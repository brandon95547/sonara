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
  /**
   * This hand's movement on this note — "Thumb under". Kept beside the finger
   * it belongs to so that, with two hands playing, the cue can be drawn on the
   * key of the hand that moves rather than on both.
   */
  readonly cue?: string
}

/** One hand's recommended fingers for the material, in the order it is taught. */
export interface ExerciseFingering {
  readonly hand: Hand
  readonly fingers: readonly number[]
  readonly source: 'standard' | 'derived'
  /**
   * How many of `fingers` are played together, where it is more than one: 2
   * for a hand in thirds or octaves, 3 or 4 for a hand holding chords. Lets a
   * row of numbers be read as the groups it is.
   */
  readonly perStep?: number
}

export interface ExerciseStep {
  readonly id: string
  /** Every note that must sound. One for a scale note, several for a chord. */
  readonly notes: readonly number[]
  /** Parallel to `notes`. */
  readonly fingers: readonly StepFinger[]
  /** What to call it on screen: `A`, or `Am` — or `C + E` for two hands a third apart. */
  readonly label: string
  /**
   * Parallel to `notes`, where the notes do not all share the step's name: the
   * hands a third apart, or moving against each other. A key is labelled with
   * its own note, not with both.
   */
  readonly noteLabels?: readonly string[]
  /** Where it sits in the material: `♭3`, or `iv`. */
  readonly degree?: string
  /**
   * A movement cue, shown only while this step is current — "Thumb under" at
   * the moment the thumb has to pass under, not as a paragraph beforehand.
   *
   * The step's cue as a sentence would say it: when both hands play, it names
   * the hand ("Left: Cross over"). Each finger carries its own for the keys.
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
  /** The exact notes the exercise walks, in order — every note of every step. */
  readonly notes: readonly number[]
  /** Pitch class to scale degree — `1`, `2`, `♭3`. For the degrees overlay. */
  readonly pitchDegrees?: Readonly<Record<number, string>>
  /** The two four-note groups, as pitch classes, when the scale has them. */
  readonly tetrachordGroups?: {
    readonly lower: readonly number[]
    readonly upper: readonly number[]
  }
  /**
   * The key signature the material is written in, as fifths, or null where
   * no signature fits and every accidental is printed. The live staff draws
   * it and spells what is played from it.
   */
  readonly keyFifths: number | null
  /** Reference rows for the dashboard. Kind-specific content, generic shape. */
  readonly facts: readonly ExerciseFact[]
  /** One per hand that plays, low hand first. Empty where there is none to recommend. */
  readonly fingerings: readonly ExerciseFingering[]
  readonly defaultBpm: number
  /** Played detached. A demonstration lifts each step well before the next. */
  readonly staccato?: boolean
}

/** Whether the note belongs to the material, in any octave. */
export function isInExercise(exercise: Exercise, note: number): boolean {
  return exercise.pitchClasses.includes(((note % 12) + 12) % 12)
}
