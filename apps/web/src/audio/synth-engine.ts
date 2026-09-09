import { noteFrequency, velocityToGain, type Instrument } from '@sonara/shared'
import { decibelsToGain, type AudioEngine } from './types'

/**
 * The built-in engine: additive synthesis, no network, no licence.
 *
 * It plays two roles. It is the `Sonara Studio` instrument in its own right,
 * and it is what every sampled instrument falls back to when its samples
 * cannot be fetched — which is why each catalogue entry carries a voicing.
 * A player on a train keeps a playable piano instead of a silent app.
 *
 * The model is a bank of decaying sine partials through one velocity-tracking
 * low-pass, plus a noise transient for the hammer. That is not a physical
 * model of a piano and does not pretend to be; it is the smallest structure
 * that gets the two things the ear actually checks for — partials that decay
 * at different rates, and a tone that opens up the harder you play.
 */

interface Voice {
  readonly note: number
  readonly startedAt: number
  readonly gain: GainNode
  readonly sources: (OscillatorNode | AudioBufferSourceNode)[]
  releaseAt: number | null
}

/**
 * Voice cap. Ten fingers plus a sustain pedal is comfortably under this; the
 * limit exists for a stuck pedal and a fast tremolo, where an uncapped engine
 * accumulates oscillators until the audio thread gives up.
 */
const MAX_VOICES = 32
/** Retrigger release. Long enough not to click, short enough not to smear. */
const RETRIGGER_RELEASE = 0.04
/** What allNotesOff() gives every voice: the shortest fade that does not click. */
const PANIC_RELEASE = 0.08
/**
 * The shortest ramp scheduled anywhere in a voice, in seconds.
 *
 * A ramp of zero length is a step, and a step in gain is a click at the start
 * (or end) of every note — the same reason the master volume is ramped rather
 * than assigned. Two milliseconds is under a hundred samples, too short to
 * hear as an attack and long enough not to hear as a click. A catalogue
 * voicing is free to ask for less; it gets this.
 */
const MIN_RAMP = 0.002
/**
 * The smallest gain a ramp may be scheduled to or from.
 *
 * `exponentialRampToValueAtTime` throws a RangeError at zero — the curve has
 * nowhere to go — and a voicing can legitimately carry a silent partial, so
 * one `gain: 0` in the catalogue would make every note on that instrument
 * throw out of noteOn. Clamped to a level below audibility instead.
 */
const GAIN_FLOOR = 0.0001

/** A gain that is safe to hand to an exponential ramp: finite and above the floor. */
function audible(gain: number): number {
  return Number.isFinite(gain) && gain > GAIN_FLOOR ? gain : GAIN_FLOOR
}

/** A ramp length that is safe to schedule: finite and at least MIN_RAMP. */
function rampLength(seconds: number): number {
  return Number.isFinite(seconds) && seconds > MIN_RAMP ? seconds : MIN_RAMP
}

export class SynthEngine implements AudioEngine {
  readonly kind = 'synth' as const
  readonly instrumentId: string

  readonly #context: AudioContext
  readonly #output: GainNode
  readonly #voicing: Instrument['voicing']
  readonly #noise: AudioBuffer
  readonly #voices = new Map<number, Voice>()
  #disposed = false

  constructor(context: AudioContext, destination: AudioNode, instrument: Instrument) {
    this.#context = context
    this.instrumentId = instrument.id
    this.#voicing = instrument.voicing

    this.#output = context.createGain()
    this.#output.gain.value = decibelsToGain(instrument.gainDb)
    this.#output.connect(destination)

    // One noise buffer for the life of the engine. Generating 100ms of noise
    // per keystroke would allocate on the audio path for no benefit — the
    // hammer transient is far too short for anyone to hear it repeat.
    this.#noise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.12), context.sampleRate)
    const channel = this.#noise.getChannelData(0)
    for (let i = 0; i < channel.length; i++) channel[i] = Math.random() * 2 - 1
  }

  noteOn(note: number, velocity: number): void {
    if (this.#disposed) return

    // Retriggering a sounding note releases the old voice quickly rather than
    // stacking a second one on top: two copies of the same pitch at slightly
    // different phases is a flanging artefact, not a louder note.
    const existing = this.#voices.get(note)
    if (existing) this.#release(existing, RETRIGGER_RELEASE)
    if (this.#voices.size >= MAX_VOICES) this.#stealOldest()

    const context = this.#context
    const now = context.currentTime
    const voicing = this.#voicing
    const level = velocityToGain(velocity)
    const normalised = velocity / 127
    const attack = rampLength(voicing.attack)

    const gain = context.createGain()
    gain.gain.value = level * 0.22 // headroom for a ten-note chord
    gain.connect(this.#output)

    // Velocity opens the filter as well as raising the level. This is most of
    // what separates "played harder" from "turned up" — a fortissimo note is
    // brighter, not merely louder.
    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = Math.min(
      context.sampleRate / 2 - 1000,
      voicing.brightness * (0.35 + 0.65 * normalised),
    )
    filter.Q.value = 0.6
    filter.connect(gain)

    const fundamental = noteFrequency(note)
    const sources: Voice['sources'] = []

    voicing.partials.forEach((partial, index) => {
      // Detune is applied only to the fundamental, where the beating between
      // two strings is audible. Detuning all six partials triples the
      // oscillator count for something the ear cannot pick out.
      const copies =
        index === 0 && voicing.detune > 0 ? [-voicing.detune / 2, voicing.detune / 2] : [0]

      for (const cents of copies) {
        const oscillator = context.createOscillator()
        oscillator.type = 'sine'
        oscillator.frequency.value = fundamental * partial.ratio
        oscillator.detune.value = cents

        const partialGain = context.createGain()
        const peak = audible((partial.gain / copies.length) * (0.55 + 0.45 * normalised))
        partialGain.gain.setValueAtTime(GAIN_FLOOR, now)
        partialGain.gain.linearRampToValueAtTime(peak, now + attack)
        // A struck string decays exponentially. exponentialRamp cannot reach
        // zero, so it targets a value below audibility instead.
        partialGain.gain.exponentialRampToValueAtTime(
          audible(peak * 0.0004),
          now + attack + rampLength(partial.decay),
        )

        oscillator.connect(partialGain).connect(filter)
        oscillator.start(now)
        sources.push(oscillator)
      }
    })

    if (voicing.hammer > 0) {
      const hammer = context.createBufferSource()
      hammer.buffer = this.#noise
      const hammerFilter = context.createBiquadFilter()
      hammerFilter.type = 'bandpass'
      // The transient tracks the note: a struck bass string thumps, a treble
      // string ticks. A fixed-frequency click sounds like a separate percussion
      // instrument playing along.
      hammerFilter.frequency.value = Math.min(12000, fundamental * 6)
      hammerFilter.Q.value = 0.8

      const hammerGain = context.createGain()
      const peak = audible(voicing.hammer * normalised * 0.5)
      hammerGain.gain.setValueAtTime(peak, now)
      hammerGain.gain.exponentialRampToValueAtTime(GAIN_FLOOR, now + 0.06)

      hammer.connect(hammerFilter).connect(hammerGain).connect(filter)
      hammer.start(now)
      hammer.stop(now + 0.12)
      sources.push(hammer)
    }

    this.#voices.set(note, { note, startedAt: now, gain, sources, releaseAt: null })
  }

  noteOff(note: number): void {
    const voice = this.#voices.get(note)
    if (voice) this.#release(voice, this.#voicing.release)
  }

  allNotesOff(): void {
    for (const voice of this.#voices.values()) this.#release(voice, PANIC_RELEASE)
    this.#voices.clear()
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    for (const voice of this.#voices.values()) {
      for (const source of voice.sources) {
        try {
          source.stop()
        } catch {
          // Already stopped. Web Audio throws rather than no-oping, and there
          // is nothing to do about a node that has finished.
        }
      }
      voice.gain.disconnect()
    }
    this.#voices.clear()
    this.#output.disconnect()
  }

  #release(voice: Voice, requested: number): void {
    if (voice.releaseAt !== null) return
    const now = this.#context.currentTime
    const seconds = rampLength(requested)
    voice.releaseAt = now + seconds

    // Ramp from wherever the envelope currently is, not from the peak — a
    // release that jumps back to full level before fading is an audible bump.
    const current = audible(voice.gain.gain.value)
    voice.gain.gain.cancelScheduledValues(now)
    voice.gain.gain.setValueAtTime(current, now)
    voice.gain.gain.exponentialRampToValueAtTime(GAIN_FLOOR, now + seconds)

    for (const source of voice.sources) {
      try {
        source.stop(now + seconds + 0.02)
      } catch {
        // Already scheduled to stop.
      }
    }

    // Only forget the voice if it is still the live one for this note: a fast
    // retrigger has already replaced it, and deleting the new voice here would
    // leave a note that never stops.
    globalThis.setTimeout(
      () => {
        if (this.#voices.get(voice.note) === voice) this.#voices.delete(voice.note)
        voice.gain.disconnect()
      },
      (seconds + 0.1) * 1000,
    )
  }

  #stealOldest(): void {
    let oldest: Voice | null = null
    for (const voice of this.#voices.values()) {
      if (voice.releaseAt !== null) continue
      if (!oldest || voice.startedAt < oldest.startedAt) oldest = voice
    }
    if (oldest) {
      this.#release(oldest, 0.05)
      this.#voices.delete(oldest.note)
    }
  }
}
