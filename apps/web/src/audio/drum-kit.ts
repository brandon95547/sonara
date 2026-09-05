import { drumVoice, type DrumVoice } from '@sonara/shared'

/**
 * A drum kit made rather than sampled.
 *
 * Every voice here is two or three oscillators and a noise burst, which is how
 * drum machines did it before sampling and is more than good enough to keep
 * time against. The alternative is a sample pack: megabytes to download before
 * the first bar, for a part the player is not learning.
 *
 * It runs on its own graph rather than through the piano engine. A drum is not
 * a note — on the percussion channel a MIDI number names an instrument, not a
 * pitch — so routing it through a sampler pitched to that number is not a poor
 * sound, it is the wrong question.
 */

interface Kit {
  context: AudioContext
  out: GainNode
  noise: AudioBuffer
}

let kit: Kit | null = null

/** Two seconds of white noise, made once and reused by every voice. */
function makeNoise(context: AudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1
  return data ? buffer : buffer
}

function ensure(): Kit | null {
  try {
    if (kit) return kit
    const context = new AudioContext()
    const out = context.createGain()
    out.gain.value = 0.9
    out.connect(context.destination)
    kit = { context, out, noise: makeNoise(context) }
    return kit
  } catch {
    // No audio context available. The song still plays; it just has no kit.
    return null
  }
}

export function setDrumVolume(volume: number) {
  const active = ensure()
  if (active) active.out.gain.value = Math.max(0, Math.min(1, volume))
}

/** A burst of filtered noise — the body of every cymbal and snare here. */
function noiseBurst(
  kitRef: Kit,
  at: number,
  {
    decay,
    frequency,
    type = 'highpass',
    gain,
    q = 0.8,
  }: { decay: number; frequency: number; type?: BiquadFilterType; gain: number; q?: number },
) {
  const source = kitRef.context.createBufferSource()
  source.buffer = kitRef.noise
  const filter = kitRef.context.createBiquadFilter()
  filter.type = type
  filter.frequency.value = frequency
  filter.Q.value = q
  const envelope = kitRef.context.createGain()
  envelope.gain.setValueAtTime(gain, at)
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + decay)
  source.connect(filter).connect(envelope).connect(kitRef.out)
  source.start(at)
  source.stop(at + decay + 0.02)
}

/** A pitched thump — kicks and toms, which are a swept sine and nothing else. */
function tone(
  kitRef: Kit,
  at: number,
  {
    from,
    to,
    decay,
    gain,
    type = 'sine',
  }: { from: number; to: number; decay: number; gain: number; type?: OscillatorType },
) {
  const oscillator = kitRef.context.createOscillator()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(from, at)
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + decay)
  const envelope = kitRef.context.createGain()
  envelope.gain.setValueAtTime(gain, at)
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + decay)
  oscillator.connect(envelope).connect(kitRef.out)
  oscillator.start(at)
  oscillator.stop(at + decay + 0.02)
}

const VOICES: Record<DrumVoice, (kitRef: Kit, at: number, level: number) => void> = {
  kick: (k, at, level) => {
    tone(k, at, { from: 150, to: 45, decay: 0.34, gain: level })
    noiseBurst(k, at, { decay: 0.03, frequency: 2000, gain: level * 0.25 })
  },
  snare: (k, at, level) => {
    tone(k, at, { from: 210, to: 120, decay: 0.11, gain: level * 0.45, type: 'triangle' })
    noiseBurst(k, at, { decay: 0.19, frequency: 1500, gain: level * 0.7 })
  },
  rimshot: (k, at, level) => {
    tone(k, at, { from: 420, to: 300, decay: 0.05, gain: level * 0.5, type: 'square' })
    noiseBurst(k, at, { decay: 0.04, frequency: 2600, gain: level * 0.4 })
  },
  clap: (k, at, level) => {
    // Three quick bursts, which is what makes a clap sound like hands.
    for (const offset of [0, 0.012, 0.026]) {
      noiseBurst(k, at + offset, {
        decay: 0.11,
        frequency: 1200,
        gain: level * 0.5,
        type: 'bandpass',
        q: 1.4,
      })
    }
  },
  'tom-low': (k, at, level) => tone(k, at, { from: 150, to: 80, decay: 0.32, gain: level * 0.85 }),
  'tom-mid': (k, at, level) => tone(k, at, { from: 220, to: 120, decay: 0.28, gain: level * 0.85 }),
  'tom-high': (k, at, level) =>
    tone(k, at, { from: 320, to: 180, decay: 0.24, gain: level * 0.85 }),
  'hat-closed': (k, at, level) =>
    noiseBurst(k, at, { decay: 0.045, frequency: 8000, gain: level * 0.42 }),
  'hat-pedal': (k, at, level) =>
    noiseBurst(k, at, { decay: 0.08, frequency: 6500, gain: level * 0.34 }),
  'hat-open': (k, at, level) =>
    noiseBurst(k, at, { decay: 0.34, frequency: 7500, gain: level * 0.38 }),
  crash: (k, at, level) => noiseBurst(k, at, { decay: 1.1, frequency: 5200, gain: level * 0.42 }),
  ride: (k, at, level) => {
    noiseBurst(k, at, { decay: 0.6, frequency: 7000, gain: level * 0.26 })
    tone(k, at, { from: 520, to: 460, decay: 0.16, gain: level * 0.16, type: 'triangle' })
  },
  shaker: (k, at, level) => noiseBurst(k, at, { decay: 0.06, frequency: 9000, gain: level * 0.3 }),
  // Hand drums: a short pitched skin with almost no sweep, which is what
  // separates a conga from a tom. The slap on top is the hand, not the head.
  'conga-low': (k, at, level) => {
    tone(k, at, { from: 190, to: 165, decay: 0.3, gain: level * 0.8 })
    noiseBurst(k, at, { decay: 0.03, frequency: 2400, gain: level * 0.18 })
  },
  'conga-high': (k, at, level) => {
    tone(k, at, { from: 290, to: 255, decay: 0.24, gain: level * 0.75 })
    noiseBurst(k, at, { decay: 0.03, frequency: 3000, gain: level * 0.18 })
  },
  'bongo-low': (k, at, level) => {
    tone(k, at, { from: 340, to: 310, decay: 0.16, gain: level * 0.6 })
    noiseBurst(k, at, { decay: 0.02, frequency: 3400, gain: level * 0.16 })
  },
  'bongo-high': (k, at, level) => {
    tone(k, at, { from: 480, to: 440, decay: 0.13, gain: level * 0.55 })
    noiseBurst(k, at, { decay: 0.02, frequency: 4000, gain: level * 0.16 })
  },
  timbale: (k, at, level) => {
    tone(k, at, { from: 400, to: 360, decay: 0.18, gain: level * 0.6 })
    noiseBurst(k, at, { decay: 0.09, frequency: 3600, gain: level * 0.3 })
  },
  'ride-bell': (k, at, level) => {
    tone(k, at, { from: 1180, to: 1150, decay: 0.42, gain: level * 0.22, type: 'square' })
    noiseBurst(k, at, { decay: 0.28, frequency: 8000, gain: level * 0.14 })
  },
  agogo: (k, at, level) => {
    tone(k, at, { from: 780, to: 760, decay: 0.2, gain: level * 0.26, type: 'square' })
  },
  woodblock: (k, at, level) => {
    // Almost no body: a click with a pitch, which is the whole character.
    tone(k, at, { from: 1000, to: 900, decay: 0.05, gain: level * 0.45, type: 'square' })
  },
  triangle: (k, at, level) => {
    tone(k, at, { from: 5200, to: 5100, decay: 0.9, gain: level * 0.12, type: 'triangle' })
    tone(k, at, { from: 7100, to: 7000, decay: 0.7, gain: level * 0.08, type: 'triangle' })
  },
  whistle: (k, at, level) => {
    tone(k, at, { from: 2300, to: 2450, decay: 0.24, gain: level * 0.18, type: 'sine' })
  },
  scrape: (k, at, level) => {
    // Guiro, cuica, vibraslap: a rasp rather than a strike.
    noiseBurst(k, at, {
      decay: 0.26,
      frequency: 1800,
      gain: level * 0.36,
      type: 'bandpass',
      q: 2.2,
    })
  },
  cowbell: (k, at, level) => {
    tone(k, at, { from: 835, to: 800, decay: 0.22, gain: level * 0.3, type: 'square' })
    tone(k, at, { from: 560, to: 540, decay: 0.22, gain: level * 0.3, type: 'square' })
  },
}

/**
 * Hits a drum. `note` is a General MIDI percussion number, not a pitch.
 */
export function hitDrum(note: number, velocity: number) {
  const active = ensure()
  if (!active) return
  // Browsers suspend a context created before the first gesture.
  if (active.context.state === 'suspended') void active.context.resume()
  const level = Math.max(0.05, Math.min(1, velocity / 127)) * 0.9
  VOICES[drumVoice(note)](active, active.context.currentTime, level)
}
