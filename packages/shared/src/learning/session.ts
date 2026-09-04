import type { Exercise, ExerciseStep } from './exercise.js'

/**
 * The practice engine.
 *
 * A pure reducer over note events, deliberately: everything interesting here —
 * when a step advances, what counts as a mistake, how tempo is inferred — is
 * logic that has to be right, and logic that is right is logic you can test
 * without a browser, an AudioContext or a MIDI cable.
 *
 * It knows nothing about scales. It advances through `Exercise.steps`, so the
 * same engine drives chords, arpeggios and progressions the moment those have
 * builders.
 */

export const LEARNING_MODES = ['explore', 'learn', 'practice'] as const
export type LearningMode = (typeof LEARNING_MODES)[number]

export const LEARNING_MODE_LABELS: Record<LearningMode, string> = {
  explore: 'Explore',
  learn: 'Learn',
  practice: 'Practice',
}

export const LEARNING_MODE_DESCRIPTIONS: Record<LearningMode, string> = {
  explore: 'Every note of the scale is lit. Play freely and listen to how it sits.',
  learn: 'One note at a time, with the recommended finger. Wrong notes flash and do not advance.',
  practice: 'The guidance goes away. Play it through while Sonara keeps score.',
}

export type SessionStatus = 'idle' | 'running' | 'complete'

export interface SessionState {
  readonly status: SessionStatus
  readonly stepIndex: number
  /** Notes of the current step already sounded — a chord is not one keystroke. */
  readonly satisfied: readonly number[]
  readonly completedSteps: number
  readonly mistakes: number
  /** Wrong notes and when they were pressed, so the UI can flash and forget. */
  readonly wrongNotes: Readonly<Record<number, number>>
  readonly startedAt: number | null
  readonly completedAt: number | null
  /** When each step was completed. The only input to the tempo estimate. */
  readonly stepTimes: readonly number[]
}

export const IDLE_SESSION: SessionState = {
  status: 'idle',
  stepIndex: 0,
  satisfied: [],
  completedSteps: 0,
  mistakes: 0,
  wrongNotes: {},
  startedAt: null,
  completedAt: null,
  stepTimes: [],
}

export type SessionEvent =
  | { type: 'start'; at: number }
  | { type: 'reset' }
  | { type: 'noteOn'; note: number; at: number }
  /** Drops wrong-note flashes older than `before`. Keeps the state pure. */
  | { type: 'expireWrong'; before: number }

/**
 * How long a wrong note stays lit. Long enough to notice mid-phrase, short
 * enough not to still be red when the right note arrives.
 */
export const WRONG_NOTE_FLASH_MS = 550

export function sessionReducer(
  state: SessionState,
  event: SessionEvent,
  exercise: Exercise | null,
): SessionState {
  switch (event.type) {
    case 'start':
      return { ...IDLE_SESSION, status: 'running', startedAt: event.at }

    case 'reset':
      return IDLE_SESSION

    case 'expireWrong': {
      const kept = Object.entries(state.wrongNotes).filter(([, at]) => at >= event.before)
      if (kept.length === Object.keys(state.wrongNotes).length) return state
      return { ...state, wrongNotes: Object.fromEntries(kept.map(([n, at]) => [Number(n), at])) }
    }

    case 'noteOn': {
      if (state.status !== 'running' || !exercise) return state
      const step = exercise.steps[state.stepIndex]
      if (!step) return state

      const belongs = step.notes.includes(event.note)
      if (!belongs) {
        return {
          ...state,
          mistakes: state.mistakes + 1,
          wrongNotes: { ...state.wrongNotes, [event.note]: event.at },
        }
      }

      // Re-pressing a note already held for this step is not progress, but it
      // is not a mistake either — a player checking a note is still a player
      // playing the right note.
      if (state.satisfied.includes(event.note)) return state

      const satisfied = [...state.satisfied, event.note]
      if (satisfied.length < step.notes.length) return { ...state, satisfied }

      const stepIndex = state.stepIndex + 1
      const done = stepIndex >= exercise.steps.length
      return {
        ...state,
        stepIndex: done ? state.stepIndex : stepIndex,
        satisfied: [],
        completedSteps: state.completedSteps + 1,
        stepTimes: [...state.stepTimes, event.at],
        status: done ? 'complete' : 'running',
        completedAt: done ? event.at : null,
      }
    }
  }
}

/* ===========================================================================
   DERIVED VALUES
   Selectors rather than stored state: every one of these is a function of the
   session, and storing them is how two numbers on the same screen end up
   disagreeing.
   ======================================================================== */

export function currentStep(exercise: Exercise | null, state: SessionState): ExerciseStep | null {
  if (!exercise) return null
  return exercise.steps[state.stepIndex] ?? null
}

export function upcomingSteps(
  exercise: Exercise | null,
  state: SessionState,
  count: number,
): ExerciseStep[] {
  if (!exercise) return []
  return exercise.steps.slice(state.stepIndex + 1, state.stepIndex + 1 + count)
}

/** 0-1. A session with nothing played yet is 100%, not 0% — nothing is wrong yet. */
export function accuracy(state: SessionState): number {
  const attempts = state.completedSteps + state.mistakes
  if (attempts === 0) return 1
  return state.completedSteps / attempts
}

export function progress(exercise: Exercise | null, state: SessionState): number {
  if (!exercise || exercise.steps.length === 0) return 0
  return Math.min(1, state.completedSteps / exercise.steps.length)
}

/**
 * Notes per minute, from the gaps between completed steps.
 *
 * The median rather than the mean, and only over a recent window. A player who
 * stops to find a note leaves one enormous gap, and a mean turns that into a
 * tempo of 11 BPM that then takes half a scale to recover. The median ignores
 * it, which is what a listener does too.
 */
export function tempo(state: SessionState, window = 8): number | null {
  const times = state.stepTimes.slice(-(window + 1))
  if (times.length < 3) return null

  const gaps: number[] = []
  for (let i = 1; i < times.length; i++) gaps.push(times[i]! - times[i - 1]!)
  gaps.sort((a, b) => a - b)

  const middle = Math.floor(gaps.length / 2)
  const median = gaps.length % 2 === 0 ? (gaps[middle - 1]! + gaps[middle]!) / 2 : gaps[middle]!
  if (median <= 0) return null

  return Math.round(60_000 / median)
}

export function elapsedSeconds(state: SessionState, now: number): number {
  if (state.startedAt === null) return 0
  return Math.max(0, ((state.completedAt ?? now) - state.startedAt) / 1000)
}
