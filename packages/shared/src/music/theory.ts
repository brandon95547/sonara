import type { Hand } from './fingering.js'
import { normalisePitchClass } from './pitch.js'
import { findScaleType, scaleOffsets, spellScale, type ScaleType } from './scales.js'

/**
 * The facts about a scale that make it smaller to remember than it looks.
 *
 * Everything here is *derived* from the fingering and the scale itself rather
 * than listed per key. A table of "the sharp keys go like this, the flat keys
 * like that" is only true until it isn't — B major's left hand takes the 4th
 * finger twice, F major's right hand takes it in the middle of the octave, and
 * G♯ minor's left hand moves it depending on which minor you are playing. A
 * derivation gets those right for nothing; a summary has to remember to.
 */

/**
 * Where the 4th finger falls, as scale-degree indices (0 = the tonic).
 *
 * This is the single most useful thing a player can hold in their head about a
 * scale. Palmer/Manus/Lethco build their whole per-key layout around it: "if
 * you know the position of the 4th finger, you can figure out the position of
 * the other fingers." Eight digits collapse to one.
 *
 * The right hand's last note is excluded. Its final finger is a *terminal* one
 * — it ends the scale and does not recur — so counting it would report F major
 * as having the 4th finger on both the 4th degree and the tonic, when only the
 * first of those is a position the hand keeps returning to. The left hand's
 * first note is not excluded, because for the hand shapes that start on 4 it is
 * exactly where the finger keeps landing: B major's left hand really does take
 * it twice an octave, on the 1st degree and the 5th.
 */
export function fourthFingerDegrees(fingers: readonly number[], hand: Hand): number[] {
  const last = fingers.length - 1
  const degrees = new Set<number>()

  fingers.forEach((finger, index) => {
    if (finger !== 4) return
    if (hand === 'right' && index === last) return
    degrees.add(index % 7)
  })

  return [...degrees].sort((a, b) => a - b)
}

/** `1st`, `2nd`, `3rd`… for degree indices. */
export function ordinal(n: number): string {
  const teen = n % 100
  if (teen >= 11 && teen <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

/**
 * The classical name of each degree.
 *
 * The seventh is the one that is not fixed: a semitone below the tonic it leads
 * to it and is called the leading tone; a whole tone below it does not, and is
 * called the subtonic. Natural minor has the second kind, which is a large part
 * of why it sounds the way it does.
 */
export function degreeNames(type: ScaleType): string[] {
  const offsets = scaleOffsets(type)
  if (offsets.length !== 7) return []
  const seventh = 12 - offsets[6]! === 1 ? 'Leading tone' : 'Subtonic'
  return ['Tonic', 'Supertonic', 'Mediant', 'Subdominant', 'Dominant', 'Submediant', seventh]
}

export interface RelativeKey {
  readonly name: string
  readonly typeName: string
  /** The degree of *this* scale that the related key starts on, 1-based. */
  readonly fromDegree: number
}

/**
 * The major or minor key built from the same notes.
 *
 * A minor scale is its relative major started three semitones lower — the same
 * seven notes, a different home. Knowing that turns an unfamiliar scale into
 * one already learned, which is a far cheaper thing to remember than another
 * seven notes. Derived from the degree rather than tabulated, so C major gives
 * A minor and G major gives E minor without a list to get wrong.
 */
export function relativeKey(rootPitchClass: number, type: ScaleType): RelativeKey | null {
  const pairs: Record<string, { toId: string; degree: number }> = {
    // The relative minor starts on the 6th degree of its major.
    major: { toId: 'natural-minor', degree: 6 },
    // And the relative major on the ♭3rd of any of the minors. All three minor
    // forms share a key signature — they differ only in which degrees get
    // raised on the way past — so all three have the same relative major.
    'natural-minor': { toId: 'major', degree: 3 },
    'harmonic-minor': { toId: 'major', degree: 3 },
    'melodic-minor': { toId: 'major', degree: 3 },
  }

  const pair = pairs[type.id]
  if (!pair) return null

  const target = findScaleType(pair.toId)
  if (!target) return null

  const offsets = scaleOffsets(type)
  const semitones = offsets[pair.degree - 1]
  if (semitones === undefined) return null

  const scale = spellScale(normalisePitchClass(rootPitchClass + semitones), target)
  return { name: scale.root.name, typeName: target.name, fromDegree: pair.degree }
}

export interface Tetrachords {
  readonly lower: string
  readonly upper: string
  /** The interval joining the two groups, as a step name. */
  readonly join: string
}

/**
 * The two four-note groups a scale is built from, when it is built from two.
 *
 * The major scale's shape is not seven arbitrary steps: it is one four-note
 * group, a whole step, and the same group again. That is two things to hold
 * rather than seven — and it is also the mechanism behind the circle of 5ths,
 * because the upper group of one major scale is the lower group of the next.
 * Returns null for the scales that do not split evenly, which is most of them.
 */
export function tetrachords(type: ScaleType): Tetrachords | null {
  const steps = type.steps
  if (steps.length !== 7) return null

  const lower = steps.slice(0, 3)
  const upper = steps.slice(4, 7)
  if (lower.length !== 3 || upper.length !== 3) return null
  if (!lower.every((step, i) => step === upper[i])) return null

  const name = (semitones: number) =>
    semitones === 1 ? 'H' : semitones === 2 ? 'W' : `${semitones}`
  return {
    lower: lower.map(name).join(' '),
    upper: upper.map(name).join(' '),
    join: name(steps[3]!),
  }
}
