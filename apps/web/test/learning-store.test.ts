import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SCALE_SPEC } from '@sonara/shared'
import { useLearningStore } from '@/state/learning-store'

/**
 * The annotation map is the entire interface between the learning system and
 * the keyboard. If it is wrong, the right key does not light up — and no test
 * of the engine underneath would notice, because the engine is fine.
 */

const store = () => useLearningStore.getState()
const roles = () =>
  Object.entries(store().annotations).map(([note, annotation]) => [Number(note), annotation.role])
const roleOf = (note: number) => store().annotations[note]?.role
const notes = () => store().exercise!.notes

beforeEach(() => {
  useLearningStore.setState({ autoTempo: false })
  store().setTopic('scales')
  store().updateSpec(DEFAULT_SCALE_SPEC)
  store().setMode('learn')
})

describe('learn mode', () => {
  it('marks the first step as the target and the rest as upcoming', () => {
    const [first, second] = notes()
    expect(roleOf(first!)).toBe('target')
    expect(roleOf(second!)).toBe('upcoming')
  })

  it('puts a recommended finger on every step it lights', () => {
    for (const note of notes()) {
      expect(store().annotations[note]?.finger).toBeGreaterThanOrEqual(1)
    }
  })

  it('shows the movement cue only on the key it applies to', () => {
    const cued = Object.values(store().annotations).filter((a) => a.cue)
    // Exactly one cue can be current at a time — the one on the target.
    expect(cued.length).toBeLessThanOrEqual(1)
    if (cued.length === 1) expect(cued[0]!.role).toBe('target')
  })

  it('moves the target forward as notes are played, and keeps the played ones lit', () => {
    const [first, second] = notes()
    store().start()
    store().noteOn(first!)

    expect(roleOf(second!)).toBe('target')
    // The scale does not empty out behind you — the shape stays visible.
    expect(roleOf(first!)).toBe('scale')
    expect(store().annotations[first!]?.finger).toBeUndefined()
  })

  it('does not move the target on a wrong note, and flashes it instead', () => {
    const [first] = notes()
    store().start()
    store().noteOn(first! + 1)

    expect(roleOf(first!)).toBe('target')
    expect(roleOf(first! + 1)).toBe('wrong')
    expect(store().session.mistakes).toBe(1)
  })

  it('ignores notes before the session is started', () => {
    store().noteOn(notes()[0]!)
    expect(store().session.completedSteps).toBe(0)
  })

  it('lights only the octaves the exercise walks', () => {
    // An A two octaves below the exercise is still an A, but it is not part of
    // this run — Learn is about a specific path, not about the scale in general.
    expect(roleOf(33)).toBeUndefined()
  })
})

describe('explore mode', () => {
  beforeEach(() => store().setMode('explore'))

  it('lights every octave of the scale', () => {
    expect(roleOf(33)).toBe('root') // A1
    expect(roleOf(45)).toBe('root') // A2
    expect(roleOf(35)).toBe('scale') // B1
    expect(roleOf(34)).toBeUndefined() // A♯ is not in A minor
  })

  it('marks the tonic differently from the rest', () => {
    const rootCount = roles().filter(([, role]) => role === 'root').length
    expect(rootCount).toBeGreaterThan(4)
  })

  it('shows no target and no finger numbers', () => {
    expect(roles().some(([, role]) => role === 'target')).toBe(false)
    expect(Object.values(store().annotations).some((a) => a.finger !== undefined)).toBe(false)
  })

  it('names every lit key with its spelled note', () => {
    store().updateSpec({ rootPitchClass: 4, scaleTypeId: 'major' })
    // E major's third black key is D♯, not E♭.
    const names = new Set(Object.values(store().annotations).map((a) => a.label))
    expect(names).toContain('D♯')
    expect(names).not.toContain('E♭')
  })
})

describe('practice mode', () => {
  beforeEach(() => store().setMode('practice'))

  it('takes the guidance away entirely', () => {
    expect(Object.keys(store().annotations)).toHaveLength(0)
  })

  it('still keeps score', () => {
    const [first] = notes()
    store().start()
    store().noteOn(first!)
    store().noteOn(first!) // wrong now — the step has moved on
    expect(store().session.completedSteps).toBe(1)
    expect(store().session.mistakes).toBe(1)
  })

  it('shows a wrong note and nothing else', () => {
    store().start()
    store().noteOn(notes()[0]! + 1)
    expect(roles()).toEqual([[notes()[0]! + 1, 'wrong']])
  })
})

describe('changing the exercise', () => {
  it('ends the run rather than carrying the score across', () => {
    store().start()
    store().noteOn(notes()[0]!)
    expect(store().session.completedSteps).toBe(1)

    store().updateSpec({ rootPitchClass: 0 })
    expect(store().session.status).toBe('idle')
    expect(store().session.completedSteps).toBe(0)
  })

  it('ends the run when the guidance level changes', () => {
    // Half a scale learned with the answers on screen is not half a scale
    // practised, and one score covering both would say it was.
    store().start()
    store().noteOn(notes()[0]!)
    store().setMode('practice')
    expect(store().session.status).toBe('idle')
  })

  it('clears the keyboard when the topic has no builder yet', () => {
    store().setTopic('chords')
    expect(store().exercise).toBeNull()
    expect(Object.keys(store().annotations)).toHaveLength(0)
  })
})

describe('auto tempo', () => {
  // The engine reads the clock, so the clock has to be real enough to read.
  // Playing every note in the same millisecond produces no measurable tempo at
  // all — which is itself correct, and is why this needs fake timers rather
  // than a looser assertion.
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  /** Plays the whole exercise correctly, one note every `gap` ms. */
  const playCleanly = (gap: number) => {
    store().start()
    for (const note of notes()) {
      vi.advanceTimersByTime(gap)
      store().noteOn(note)
    }
  }

  it('leaves the target alone when it is off', () => {
    useLearningStore.setState({ autoTempo: false, targetBpm: 72 })
    playCleanly(500)
    expect(store().targetBpm).toBe(72)
  })

  it('raises the target after a clean run at or above it', () => {
    // 500ms a note is 120 BPM, comfortably past a target of 72.
    useLearningStore.setState({ autoTempo: true, targetBpm: 72 })
    playCleanly(500)
    expect(store().targetBpm).toBe(76)
  })

  it('leaves it alone after a clean run that was slower than the target', () => {
    // Clean, but at 60 BPM against a target of 120. Nothing has been earned.
    useLearningStore.setState({ autoTempo: true, targetBpm: 120 })
    playCleanly(1000)
    expect(store().targetBpm).toBe(120)
  })

  it('eases off after a scrappy run', () => {
    useLearningStore.setState({ autoTempo: true, targetBpm: 72 })
    store().start()
    for (const note of notes()) {
      vi.advanceTimersByTime(500)
      store().noteOn(note + 1) // a wrong note before every right one
      store().noteOn(note)
    }
    expect(store().targetBpm).toBe(68)
  })

  it('moves only at the end of a run, never mid-scale', () => {
    useLearningStore.setState({ autoTempo: true, targetBpm: 72 })
    store().start()
    for (const note of notes().slice(0, -1)) {
      vi.advanceTimersByTime(500)
      store().noteOn(note)
    }
    expect(store().targetBpm).toBe(72)
  })
})
