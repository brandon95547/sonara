import type { KeyMode } from './chords.js'
import type { Hand } from './fingering.js'

/**
 * The cadence of a key, in its three positions.
 *
 * I – IV – I – V – I, with the hand moving as little as it can: the tonic chord
 * is held in one of its three positions, and the subdominant and the dominant
 * are taken in whichever of theirs lies nearest, so that a note stays put from
 * each chord to the next. That is the whole point of the exercise — root
 * position chords make the hand leap, and these do not — and it is why the
 * voicings are written out here rather than derived: which notes stay is the
 * thing being taught.
 *
 * Transcribed from the Alfred book (Palmer, Manus, Lethco, *The Complete Book
 * of Scales, Chords, Arpeggios & Cadences*), where every key's right-hand page
 * prints the same three. All thirty were read. The notes are the same shapes in
 * every key, so they are stored as scale degrees; the fingering is the same in
 * twenty-eight of them, and the two that differ are listed.
 */

/** The four chords a cadence is made of. The tonic is played three times. */
export const CADENCE_CHORDS = ['I', 'IV', 'V', 'V7'] as const
export type CadenceChord = (typeof CADENCE_CHORDS)[number]

/**
 * Each chord in each position, as scale degrees from the tonic the position is
 * built over: 0 is that tonic, 7 the tonic above it, -1 the leading tone below.
 * Lowest note first.
 *
 * The seventh chord is the dominant triad with its fifth left out and its
 * seventh put in — the fourth degree of the scale, in the fifth's place — so it
 * is still three notes, and the hand does not have to open.
 */
export const CADENCE_VOICINGS: readonly Readonly<Record<CadenceChord, readonly number[]>>[] = [
  { I: [0, 2, 4], IV: [0, 3, 5], V: [-1, 1, 4], V7: [-1, 3, 4] },
  { I: [2, 4, 7], IV: [3, 5, 7], V: [1, 4, 6], V7: [3, 4, 6] },
  { I: [4, 7, 9], IV: [5, 7, 10], V: [4, 6, 8], V7: [4, 6, 10] },
]

/** What each position is called: by where it puts the tonic chord. */
export const CADENCE_POSITION_NAMES = ['Root position', '1st inversion', '2nd inversion'] as const

type Fingers = Readonly<Record<CadenceChord, string>>

/**
 * The fingering printed under twenty-eight of the thirty keys. Lowest note
 * first, so the left hand reads 5 3 1 where the page stacks it 1 3 5.
 *
 * The page also prints two alternatives in brackets — 5 3 1 for the left hand's
 * second-position IV, 4 2 1 for the right hand's third-position I. They are
 * left out, like every other bracketed alternative in either book.
 */
const COMMON: Record<Hand, readonly Fingers[]> = {
  right: [
    { I: '135', IV: '135', V: '125', V7: '145' },
    { I: '125', IV: '135', V: '124', V7: '124' },
    { I: '135', IV: '125', V: '124', V7: '125' },
  ],
  left: [
    { I: '531', IV: '521', V: '531', V7: '521' },
    { I: '531', IV: '421', V: '521', V7: '431' },
    { I: '521', IV: '421', V: '531', V7: '531' },
  ],
}

/**
 * Where a key's page departs from the rest: `mode:pitchClass`, then the
 * position, then the chord.
 *
 * C major's dominant is all white keys in every position, and its page keeps
 * the open hand for it. D minor's page brackets the 5 3 1 instead of the 4 2 1.
 */
const EXCEPTIONS: Readonly<
  Record<string, Partial<Record<Hand, Readonly<Record<number, Partial<Fingers>>>>>>
> = {
  'major:0': { right: { 1: { V: '135' }, 2: { V: '135' } } },
  'minor:2': { right: { 2: { I: '124' } } },
}

/** The fingers for one chord of the cadence, lowest note first. */
export function cadenceFingers(query: {
  pitchClass: number
  mode: KeyMode
  hand: Hand
  /** 0, 1 or 2: which position of the tonic the cadence starts from. */
  position: number
  chord: CadenceChord
}): number[] {
  const { hand, position, chord } = query
  const run =
    EXCEPTIONS[`${query.mode}:${query.pitchClass}`]?.[hand]?.[position]?.[chord] ??
    COMMON[hand][position]![chord]
  return [...run].map(Number)
}

/**
 * The cadence with one hand on the chords and the other on their roots.
 *
 * I – IV – I – V – V7 – I, as the same book sets it among its closing routines
 * (p. 86): the chords in their first position, and under them — or over them —
 * the root of each one, alone. Printed in C; fingered here as it is there.
 */
export const ROOTED_CADENCE = {
  chords: ['I', 'IV', 'I', 'V', 'V7', 'I'] as readonly CadenceChord[],
  /** The root of each chord, as a scale degree from the tonic. */
  roots: [0, 3, 0, 4, 4, 0] as readonly number[],
  /** The hand playing single roots: one finger a chord. */
  rootFingers: { left: [5, 2, 5, 1, 1, 5], right: [1, 4, 1, 5, 5, 1] } as Record<
    Hand,
    readonly number[]
  >,
}
