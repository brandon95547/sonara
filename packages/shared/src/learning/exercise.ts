import type { Hand } from '../music/fingering.js'

/**
 * The generic exercise model.
 *
 * Everything Sonara can teach reduces to the same thing: an ordered list of
 * steps, where a step is a set of notes that have to sound before the next one
 * is due. A scale is a sequence of one-note steps; a chord is one step of three
 * or four notes; an arpeggio is a scale-shaped sequence over chord tones; a
 * progression is a sequence of chord-shaped steps.
 *
 * Nothing downstream — not the session engine, not the keyboard, not the
 * dashboard — knows which of those it is looking at. That is what lets Chords,
 * Arpeggios, Progressions and Exercises arrive later without touching the
 * engine or the UI: they each need a builder, and nothing else.
 */

export type ExerciseKind = 'scale' | 'chord' | 'arpeggio' | 'progression' | 'exercise'

export interface StepFinger {
  /** 1 is the thumb, 5 the little finger. A recommendation — see fingering.ts. */
  readonly finger: number
  readonly hand: Hand
}

export interface ExerciseStep {
  readonly id: string
  /** Every note that must sound. One for a scale note, several for a chord. */
  readonly notes: readonly number[]
  /** Parallel to `notes`. */
  readonly fingers: readonly StepFinger[]
  /** What to call it on screen: `A`, or `Am`. */
  readonly label: string
  /** Where it sits in the material: `♭3`, or `iv`. */
  readonly degree?: string
  /**
   * A movement cue, shown only while this step is current — "Thumb under" at
   * the moment the thumb has to pass under, not as a paragraph beforehand.
   */
  readonly cue?: string
}

export interface ExerciseFact {
  readonly label: string
  readonly value: string
}

export interface Exercise {
  readonly id: string
  readonly kind: ExerciseKind
  /** `A Natural Minor`. */
  readonly title: string
  /** `Right hand · 2 octaves · Ascending`. */
  readonly subtitle: string
  readonly steps: readonly ExerciseStep[]
  /**
   * Pitch classes belonging to the material. Explore mode lights every octave
   * of these, because "the notes of A minor" is a fact about the whole keyboard
   * and not about the two octaves this exercise happens to walk.
   */
  readonly pitchClasses: readonly number[]
  /** The tonic, so a root key can be marked without re-deriving it. */
  readonly rootPitchClass: number
  /**
   * Pitch class to spelled name — `3` is `E♭` in A minor and `D♯` in B major.
   * Carried on the exercise so nothing downstream has to re-spell anything, or
   * worse, fall back to a fixed sharp/flat preference and print the wrong one.
   */
  readonly pitchNames: Readonly<Record<number, string>>
  /** The exact notes the exercise walks, in order. */
  readonly notes: readonly number[]
  /** Reference rows for the dashboard. Kind-specific content, generic shape. */
  readonly facts: readonly ExerciseFact[]
  /**
   * How the scale is built, for the player who wants to stop memorising it.
   *
   * Separate from `facts` because it is opened rather than read: `facts` states
   * what the scale *is*, and this says why it is that, which is worth having
   * but not worth pushing the keyboard down the page for.
   */
  readonly theory?: readonly ExerciseFact[]
  readonly fingering: {
    readonly hand: Hand
    readonly fingers: readonly number[]
    readonly source: 'standard' | 'derived'
  } | null
  readonly defaultBpm: number
}

/** Whether the note belongs to the material, in any octave. */
export function isInExercise(exercise: Exercise, note: number): boolean {
  return exercise.pitchClasses.includes(((note % 12) + 12) % 12)
}
