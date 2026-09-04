import { describe, expect, it } from 'vitest'
import { buildScaleExercise, DEFAULT_SCALE_SPEC } from './scale-exercise.js'
import {
  accuracy,
  currentStep,
  IDLE_SESSION,
  progress,
  sessionReducer,
  tempo,
  upcomingSteps,
  type SessionEvent,
  type SessionState,
} from './session.js'

const exercise = buildScaleExercise({ ...DEFAULT_SCALE_SPEC, octaves: 1 })

const run = (events: SessionEvent[], from: SessionState = IDLE_SESSION) =>
  events.reduce((state, event) => sessionReducer(state, event, exercise), from)

const started = () => run([{ type: 'start', at: 0 }])

/** Plays the exercise correctly, one note every `gap` ms. */
const playThrough = (count: number, gap = 800) => {
  const events: SessionEvent[] = [{ type: 'start', at: 0 }]
  for (let i = 0; i < count; i++) {
    events.push({ type: 'noteOn', note: exercise.steps[i]!.notes[0]!, at: (i + 1) * gap })
  }
  return run(events)
}

describe('the session engine', () => {
  it('does nothing until it is started', () => {
    const state = run([{ type: 'noteOn', note: exercise.steps[0]!.notes[0]!, at: 10 }])
    expect(state.status).toBe('idle')
    expect(state.completedSteps).toBe(0)
    expect(state.mistakes).toBe(0)
  })

  it('advances on the right note', () => {
    const state = run([{ type: 'noteOn', note: exercise.steps[0]!.notes[0]!, at: 100 }], started())
    expect(state.stepIndex).toBe(1)
    expect(state.completedSteps).toBe(1)
    expect(state.mistakes).toBe(0)
  })

  it('does not advance on a wrong note, and records it', () => {
    const wrong = exercise.steps[0]!.notes[0]! + 1
    const state = run([{ type: 'noteOn', note: wrong, at: 100 }], started())
    expect(state.stepIndex).toBe(0)
    expect(state.mistakes).toBe(1)
    expect(state.wrongNotes[wrong]).toBe(100)
  })

  it('keeps going after a mistake rather than resetting', () => {
    // A wrong note is information, not a failure state. Stopping the exercise
    // would make a five-mistake run impossible to finish.
    const state = run(
      [
        { type: 'noteOn', note: 0, at: 10 },
        { type: 'noteOn', note: exercise.steps[0]!.notes[0]!, at: 20 },
      ],
      started(),
    )
    expect(state.stepIndex).toBe(1)
    expect(state.mistakes).toBe(1)
    expect(state.completedSteps).toBe(1)
  })

  it('treats re-pressing the current note as neither progress nor a mistake', () => {
    const chord: typeof exercise = {
      ...exercise,
      steps: [{ id: 'c', notes: [60, 64, 67], fingers: [], label: 'C' }],
    }
    let state = sessionReducer(IDLE_SESSION, { type: 'start', at: 0 }, chord)
    state = sessionReducer(state, { type: 'noteOn', note: 60, at: 1 }, chord)
    const repeated = sessionReducer(state, { type: 'noteOn', note: 60, at: 2 }, chord)
    expect(repeated).toBe(state)
    expect(repeated.mistakes).toBe(0)
  })

  it('waits for every note of a chord before advancing', () => {
    // The engine is not scale-specific: a step is a SET of notes, which is what
    // lets chords and progressions reuse it untouched.
    const chord: typeof exercise = {
      ...exercise,
      steps: [
        { id: 'c', notes: [60, 64, 67], fingers: [], label: 'C' },
        { id: 'f', notes: [65, 69, 72], fingers: [], label: 'F' },
      ],
    }
    let state = sessionReducer(IDLE_SESSION, { type: 'start', at: 0 }, chord)
    for (const note of [60, 64]) {
      state = sessionReducer(state, { type: 'noteOn', note, at: 1 }, chord)
      expect(state.stepIndex).toBe(0)
    }
    state = sessionReducer(state, { type: 'noteOn', note: 67, at: 2 }, chord)
    expect(state.stepIndex).toBe(1)
    expect(state.satisfied).toEqual([])
  })

  it('completes on the last step and stops advancing', () => {
    const state = playThrough(exercise.steps.length)
    expect(state.status).toBe('complete')
    expect(state.completedSteps).toBe(exercise.steps.length)
    expect(progress(exercise, state)).toBe(1)

    const after = sessionReducer(state, { type: 'noteOn', note: 60, at: 9999 }, exercise)
    expect(after).toBe(state)
  })

  it('starts over cleanly', () => {
    const played = playThrough(3)
    const restarted = sessionReducer(played, { type: 'start', at: 5000 }, exercise)
    expect(restarted.stepIndex).toBe(0)
    expect(restarted.mistakes).toBe(0)
    expect(restarted.completedSteps).toBe(0)
    expect(restarted.startedAt).toBe(5000)
  })
})

describe('accuracy', () => {
  it('is 100% before anything has been played', () => {
    // Nothing is wrong yet. Starting a player at 0% would be a lie about a
    // performance that has not happened.
    expect(accuracy(IDLE_SESSION)).toBe(1)
  })

  it('is right notes over attempts', () => {
    const state = run(
      [
        { type: 'noteOn', note: 0, at: 1 },
        { type: 'noteOn', note: exercise.steps[0]!.notes[0]!, at: 2 },
        { type: 'noteOn', note: exercise.steps[1]!.notes[0]!, at: 3 },
        { type: 'noteOn', note: exercise.steps[2]!.notes[0]!, at: 4 },
      ],
      started(),
    )
    expect(accuracy(state)).toBeCloseTo(3 / 4, 6)
  })
})

describe('tempo', () => {
  it('says nothing until there is enough to say it from', () => {
    expect(tempo(playThrough(1))).toBeNull()
    expect(tempo(playThrough(2))).toBeNull()
  })

  it('reads an even 800ms gap as 75 BPM', () => {
    expect(tempo(playThrough(6, 800))).toBe(75)
  })

  it('ignores one long pause instead of collapsing the estimate', () => {
    // A player who stops to find a note leaves one enormous gap. A mean turns
    // that into a tempo of 11 BPM that takes half a scale to recover from;
    // the median simply does not see it, which is what a listener does too.
    const events: SessionEvent[] = [{ type: 'start', at: 0 }]
    const times = [500, 1000, 1500, 2000, 12000, 12500, 13000, 13500]
    times.forEach((at, i) => {
      events.push({ type: 'noteOn', note: exercise.steps[i]!.notes[0]!, at })
    })
    expect(tempo(run(events))).toBe(120)
  })
})

describe('wrong-note flashes', () => {
  it('expire without touching anything else', () => {
    const state = run(
      [
        { type: 'noteOn', note: 0, at: 100 },
        { type: 'noteOn', note: 1, at: 900 },
      ],
      started(),
    )
    expect(Object.keys(state.wrongNotes)).toHaveLength(2)

    const expired = sessionReducer(state, { type: 'expireWrong', before: 500 }, exercise)
    expect(Object.keys(expired.wrongNotes)).toEqual(['1'])
    expect(expired.mistakes).toBe(2)
  })

  it('returns the same object when there is nothing to expire', () => {
    // Cheap, and it keeps a 60Hz expiry timer from re-rendering the keyboard.
    const state = started()
    expect(sessionReducer(state, { type: 'expireWrong', before: 1 }, exercise)).toBe(state)
  })
})

describe('selectors', () => {
  it('reports the current and upcoming steps', () => {
    const state = playThrough(2)
    expect(currentStep(exercise, state)?.label).toBe(exercise.steps[2]!.label)
    expect(upcomingSteps(exercise, state, 3).map((s) => s.label)).toEqual(
      exercise.steps.slice(3, 6).map((s) => s.label),
    )
  })
})
