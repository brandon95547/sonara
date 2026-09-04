import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { noteFrequency, type Instrument } from '@sonara/shared'
import { SynthEngine } from '@/audio/synth-engine'
import { FakeAudioContext, type FakeOscillator } from './fake-audio-context'

/**
 * The built-in engine is the one that must always work: it is what plays when
 * there is no network, no MIDI keyboard and no samples. "Clicking a key makes
 * no sound" is the failure these tests exist to catch.
 */

const instrument: Instrument = {
  id: 'test-piano',
  name: 'Test Piano',
  description: 'For tests.',
  family: 'acoustic',
  character: ['plain'],
  engine: { kind: 'synth' },
  voicing: {
    partials: [
      { ratio: 1, gain: 1, decay: 4 },
      { ratio: 2, gain: 0.4, decay: 2 },
      { ratio: 3, gain: 0.2, decay: 1 },
    ],
    attack: 0.004,
    release: 0.5,
    brightness: 6000,
    detune: 4,
    hammer: 0.3,
  },
  gainDb: 0,
  range: { low: 21, high: 108 },
}

const noDetune: Instrument = {
  ...instrument,
  voicing: { ...instrument.voicing, detune: 0, hammer: 0 },
}

function build(spec: Instrument = instrument) {
  const context = new FakeAudioContext()
  const destination = context.createGain()
  const engine = new SynthEngine(
    context as unknown as AudioContext,
    destination as unknown as AudioNode,
    spec,
  )
  return { context, destination, engine }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('SynthEngine', () => {
  it('builds and starts a voice on note-on', () => {
    const { context, engine } = build(noDetune)
    engine.noteOn(60, 100)

    // One oscillator per partial, all started.
    expect(context.oscillators).toHaveLength(3)
    for (const oscillator of context.oscillators) {
      expect(oscillator.started).not.toBeNull()
    }
  })

  it('tunes the fundamental to the right pitch and stacks the partials on it', () => {
    const { context, engine } = build(noDetune)
    engine.noteOn(69, 100) // A4

    const pitches = context.oscillators.map((o: FakeOscillator) => o.frequency.value)
    expect(pitches[0]).toBeCloseTo(440, 4)
    expect(pitches[1]).toBeCloseTo(880, 4)
    expect(pitches[2]).toBeCloseTo(1320, 4)
  })

  it('doubles the fundamental when the voicing is detuned', () => {
    const { context, engine } = build(instrument)
    engine.noteOn(60, 100)

    // Three partials, and the fundamental doubled: the two detuned copies are
    // what makes a piano string beat rather than sit still.
    expect(context.oscillators).toHaveLength(4)
    const detunes = context.oscillators.map((o: FakeOscillator) => o.detune.value).sort()
    expect(detunes).toEqual([-2, 0, 0, 2])
  })

  it('opens the filter with velocity, so a hard note is brighter and not just louder', () => {
    const soft = build(noDetune)
    soft.engine.noteOn(60, 20)
    const hard = build(noDetune)
    hard.engine.noteOn(60, 127)

    const cutoff = (ctx: FakeAudioContext) =>
      ctx.filters.find((f) => f.type === 'lowpass')!.frequency.value
    expect(cutoff(hard.context)).toBeGreaterThan(cutoff(soft.context))
  })

  it('never lets the filter cutoff cross Nyquist', () => {
    const bright: Instrument = { ...noDetune, voicing: { ...noDetune.voicing, brightness: 20000 } }
    const { context, engine } = build(bright)
    engine.noteOn(108, 127)

    const cutoff = context.filters.find((f) => f.type === 'lowpass')!.frequency.value
    expect(cutoff).toBeLessThan(context.sampleRate / 2)
  })

  it('adds a hammer transient when the voicing asks for one', () => {
    const { context, engine } = build(instrument)
    engine.noteOn(60, 100)
    expect(context.bufferSources).toHaveLength(1)
    expect(context.bufferSources[0]!.started).not.toBeNull()
  })

  it('schedules a stop for every source on note-off', () => {
    const { context, engine } = build(noDetune)
    engine.noteOn(60, 100)
    context.advance(1)
    engine.noteOff(60)

    for (const oscillator of context.oscillators) {
      expect(oscillator.stopped).not.toBeNull()
      // Released, not cut: the stop is scheduled after the release tail.
      expect(oscillator.stopped!).toBeGreaterThan(context.currentTime)
    }
  })

  it('releases from the envelope’s current level rather than jumping to full', () => {
    const { context, engine } = build(noDetune)
    engine.noteOn(60, 60)
    context.advance(1)
    engine.noteOff(60)

    // The voice gain is the one created for this note; it must be cancelled
    // and pinned before the ramp, or the release starts with an audible bump.
    const voiceGain = context.gains.find((gain) =>
      gain.gain.calls.some((call) => call.method === 'cancelScheduledValues'),
    )
    expect(voiceGain).toBeDefined()
    const methods = voiceGain!.gain.calls.map((call) => call.method)
    expect(methods).toEqual([
      'cancelScheduledValues',
      'setValueAtTime',
      'exponentialRampToValueAtTime',
    ])
  })

  it('does not stack a second voice when a sounding note is retriggered', () => {
    const { context, engine } = build(noDetune)
    engine.noteOn(60, 100)
    const first = [...context.oscillators]
    context.advance(0.2)
    engine.noteOn(60, 100)

    // The original voice is released rather than left ringing underneath.
    for (const oscillator of first) expect(oscillator.stopped).not.toBeNull()
    expect(context.oscillators).toHaveLength(6)
  })

  it('keeps the retriggered note alive after the old voice is cleaned up', () => {
    const { context, engine } = build(noDetune)
    engine.noteOn(60, 100)
    engine.noteOn(60, 100)
    // The first voice's deferred cleanup must not delete the note's live voice.
    vi.advanceTimersByTime(2000)

    const before = context.oscillators.length
    engine.noteOff(60)
    for (const oscillator of context.oscillators.slice(before - 3)) {
      expect(oscillator.stopped).not.toBeNull()
    }
  })

  it('caps polyphony instead of growing without bound', () => {
    const { context, engine } = build(noDetune)
    // A stuck pedal and a fast tremolo is the real-world version of this.
    for (let note = 21; note <= 108; note++) engine.noteOn(note, 90)

    const sounding = context.oscillators.filter((o: FakeOscillator) => o.stopped === null)
    expect(sounding.length / 3).toBeLessThanOrEqual(32)
  })

  it('silences everything on panic', () => {
    const { context, engine } = build(noDetune)
    engine.noteOn(60, 100)
    engine.noteOn(64, 100)
    engine.noteOn(67, 100)
    engine.allNotesOff()

    for (const oscillator of context.oscillators) expect(oscillator.stopped).not.toBeNull()
  })

  it('disconnects its output on dispose and then ignores further notes', () => {
    const { context, destination, engine } = build(noDetune)
    engine.noteOn(60, 100)
    engine.dispose()

    const output = context.gains.find((gain) => gain.connections.includes(destination))
    expect(output!.disconnected).toBeGreaterThan(0)

    const before = context.oscillators.length
    engine.noteOn(72, 100)
    expect(context.oscillators).toHaveLength(before)
  })

  it('applies the catalogue gain trim to its own output, not to the master', () => {
    const quiet: Instrument = { ...noDetune, gainDb: -6 }
    const { context, destination } = build(quiet)
    const output = context.gains.find((gain) => gain.connections.includes(destination))
    // -6 dB is a little under half amplitude.
    expect(output!.gain.value).toBeCloseTo(0.501, 2)
  })

  it('plays every note on an 88-key piano without throwing', () => {
    const { engine } = build(instrument)
    for (let note = 21; note <= 108; note++) {
      expect(() => engine.noteOn(note, 1 + (note % 127))).not.toThrow()
      expect(() => engine.noteOff(note)).not.toThrow()
    }
  })
})

describe('note frequency wiring', () => {
  it('agrees with the shared pitch table', () => {
    const { context, engine } = build(noDetune)
    engine.noteOn(48, 100)
    expect(context.oscillators[0]!.frequency.value).toBeCloseTo(noteFrequency(48), 6)
  })
})
