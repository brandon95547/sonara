import { isBlackKey } from '../midi/notes.js'
import type { Hand } from './fingering.js'
import type { FingeringSystem, ScaleFingeringQuery } from './fingering-system.js'
import { normalisePitchClass, parsePitch } from './pitch.js'

/**
 * The Traditional / Orthodox system.
 *
 * Transcribed from the fingering printed in *Scales, Chords and Arpeggios for
 * Piano — The Brown Scale Book* (Frederick Harris Music, ©1948), which says of
 * itself: "Throughout this book only the orthodox system of fingering has been
 * given."
 *
 * ## The rule this file is held to
 *
 * It says what the page says. Not what the page would say if it were more
 * consistent, and not what another book says about the same scale.
 *
 * That matters most at the ends of a run. The book opens A♭ major in the right
 * hand on `2 3` and only takes `3 4` on those two notes an octave later; it
 * turns the left hand at the top of F♯ major on the 2nd finger though F♯ takes
 * the 4th everywhere below. Those are not misprints to tidy away — the hand has
 * nowhere to have come from at the bottom and nowhere to be going at the top,
 * so the page uses the nearer finger. Carrying the mid-run finger out to the
 * ends is exactly the "more consistent" fingering this system is not.
 *
 * Only the printed digits count. The scanned copy this was read from has a
 * previous owner's pencil over several of these openings, correcting `2 3` to
 * `3 4`; the print underneath is what is recorded here.
 *
 * ## What the book supplies
 *
 * Every major key, and every minor key in its harmonic and melodic forms, each
 * printed over two octaves in similar motion; and the chromatic scale. A
 * natural minor has no line of its own — it is the way down of the melodic
 * form, and is fingered from that.
 *
 * Anything else — the modes, the pentatonics, blues, whole tone — the book
 * does not print, and this system says so by returning nothing.
 */

/**
 * How one hand is printed for one key.
 *
 * The page gives two octaves; a player may ask for one or four. So a run is
 * recorded as what repeats and what does not: the finger each degree takes in
 * the middle of a run, plus whatever the page does differently on its lowest
 * and its highest notes.
 */
interface HandRun {
  /** One finger per degree, tonic first — the body of the run. */
  readonly cycle: string
  /** The lowest notes of the run, from the bottom up, where the page differs. */
  readonly bottom?: string
  /** The highest notes of the run, ending on the top note, where it differs. */
  readonly top?: string
}

interface KeyPage {
  readonly right: HandRun
  readonly left: HandRun
}

/** Printed keys, by the tonic as the page names it. */
type Pages = Readonly<Record<string, KeyPage>>

/** The white-key shape: the little finger ends the right hand and opens the left. */
const RIGHT: HandRun = { cycle: '1231234', top: '5' }
const LEFT: HandRun = { cycle: '1432132', bottom: '5' }
const WHITE: KeyPage = { right: RIGHT, left: LEFT }

/** B, major and minor: the left hand opens on the 4th finger. */
const LEFT_FROM_B: HandRun = { cycle: '1321432', bottom: '4' }
/** F, major and minor: the right hand's thumb goes under after four, and it ends on 4. */
const RIGHT_FROM_F: HandRun = { cycle: '1234123', top: '4' }
/** The flat-key left hand, 3 2 1 then 4 3 2 1, turning at the top on the 2nd finger. */
const LEFT_FLAT: HandRun = { cycle: '3214321', top: '2' }

const MAJOR: Pages = {
  C: WHITE,
  G: WHITE,
  D: WHITE,
  A: WHITE,
  E: WHITE,
  B: { right: RIGHT, left: LEFT_FROM_B },
  'F♯': { right: { cycle: '2341231' }, left: { cycle: '4321321', top: '2' } },
  F: { right: RIGHT_FROM_F, left: LEFT },
  // No digit is printed on the left hand's top note in B♭, so it keeps the 3
  // the pattern gives it; in the three keys after it the page prints a 2.
  'B♭': { right: { cycle: '4123123', bottom: '2' }, left: { cycle: '3214321' } },
  'E♭': { right: { cycle: '3123412', bottom: '2' }, left: LEFT_FLAT },
  'A♭': { right: { cycle: '3412312', bottom: '23' }, left: LEFT_FLAT },
  'D♭': { right: { cycle: '2312341' }, left: LEFT_FLAT },
}

/** The right hand of F♯, C♯ and G♯ harmonic minor: 3 4 mid-run, opened on 2 3. */
const RIGHT_SHARP_MINOR: HandRun = { cycle: '3412312', bottom: '23' }

const HARMONIC_MINOR: Pages = {
  A: WHITE,
  E: WHITE,
  B: { right: RIGHT, left: LEFT_FROM_B },
  'F♯': { right: RIGHT_SHARP_MINOR, left: { cycle: '4321321', top: '2' } },
  'C♯': { right: RIGHT_SHARP_MINOR, left: LEFT_FLAT },
  'G♯': { right: RIGHT_SHARP_MINOR, left: LEFT_FLAT },
  'D♯': { right: { cycle: '3123412', bottom: '2' }, left: { cycle: '2143213' } },
  D: WHITE,
  G: WHITE,
  C: WHITE,
  F: { right: RIGHT_FROM_F, left: LEFT },
  // The left hand is printed twice at the opening: `5 4` under the staff and
  // `2 1 3` over it. The one under the staff is where the book puts the left
  // hand's fingering everywhere else, and the run closes on it — a 4 on the
  // last C, so a 5 on the last B♭ — so that is the one recorded.
  'B♭': {
    right: { cycle: '4123123', bottom: '2' },
    left: { cycle: '2132143', bottom: '5432' },
  },
}

/** The melodic form going up: sixth and seventh raised. */
const MELODIC_MINOR_ASCENDING: Pages = {
  A: WHITE,
  E: WHITE,
  B: { right: RIGHT, left: LEFT_FROM_B },
  // The raised sixth is a black key under where the thumb would go, so the
  // 4th finger takes it and the run tops out on 3.
  'F♯': { right: { cycle: '2312341', top: '3' }, left: { cycle: '4321321', top: '2' } },
  'C♯': { right: { cycle: '2312341', top: '3' }, left: LEFT_FLAT },
  // Printed `3 4 1` from the first note here, where the harmonic form on the
  // same page opens `2 3 1`. Both are the page; neither is corrected to match.
  'G♯': { right: { cycle: '3412312' }, left: LEFT_FLAT },
  'D♯': { right: { cycle: '3123412', bottom: '2' }, left: { cycle: '2143213' } },
  D: WHITE,
  G: WHITE,
  C: WHITE,
  F: { right: RIGHT_FROM_F, left: LEFT },
  'B♭': { right: { cycle: '4123123', bottom: '2' }, left: { cycle: '2132143' } },
}

/**
 * The melodic form coming down, which is the natural minor.
 *
 * Read off the second half of each melodic line. It is also the only place the
 * book fingers a natural minor at all, so a natural minor asked for on its own
 * is fingered from here.
 */
const MELODIC_MINOR_DESCENDING: Pages = {
  A: WHITE,
  E: WHITE,
  B: { right: RIGHT, left: LEFT_FROM_B },
  'F♯': { right: RIGHT_SHARP_MINOR, left: { cycle: '4321321', top: '2' } },
  'C♯': { right: RIGHT_SHARP_MINOR, left: LEFT_FLAT },
  // The left hand comes off the top 2 3 1: the 3rd finger on F♯ this once,
  // and the 4th on every F♯ below it.
  'G♯': { right: { cycle: '3412312' }, left: { cycle: '3213214', top: '32' } },
  'D♯': { right: { cycle: '3123412', bottom: '2' }, left: { cycle: '2143213' } },
  D: WHITE,
  G: WHITE,
  C: WHITE,
  F: { right: RIGHT_FROM_F, left: LEFT },
  'B♭': { right: { cycle: '4123123', bottom: '2' }, left: { cycle: '2132143' } },
}

const PAGES: Readonly<Record<string, { pages: Pages; mode: 'major' | 'minor' }>> = {
  major: { pages: MAJOR, mode: 'major' },
  'harmonic-minor': { pages: HARMONIC_MINOR, mode: 'minor' },
  'melodic-minor': { pages: MELODIC_MINOR_ASCENDING, mode: 'minor' },
  'natural-minor': { pages: MELODIC_MINOR_DESCENDING, mode: 'minor' },
}

/**
 * Keys the book does not print, and the printed key each is played from.
 *
 * Stated, not assumed. A key and its enharmonic twin are different keys — they
 * are spelled differently, signed differently and read differently — and the
 * tables above hold only the ones the book prints, under the names it prints.
 * This is the separate, deliberate step of saying that a key with no page of
 * its own takes the fingering of the page that lies under the same keys.
 *
 * The book makes the first two of these itself, in its page titles: "F♯ Major
 * (Enharmonic G♭ Major)" and "D♭ Major (Enharmonic C♯ Major)". The rest follow
 * the same reasoning.
 */
const PLAYED_FROM: Readonly<Record<'major' | 'minor', Readonly<Record<string, string>>>> = {
  major: { 'G♭': 'F♯', 'C♯': 'D♭', 'C♭': 'B' },
  minor: { 'E♭': 'D♯', 'A♭': 'G♯', 'A♯': 'B♭' },
}

const digits = (run: string) => [...run].map(Number)

/** Lays a printed hand out over however many octaves were asked for. */
function layOut(run: HandRun, octaves: number): number[] {
  const cycle = digits(run.cycle)
  const count = cycle.length * Math.max(1, octaves) + 1
  const fingers = Array.from({ length: count }, (_, index) => cycle[index % cycle.length]!)

  // The top first, so that in a run short enough for the two to meet, the
  // opening — which is where the hand actually starts — is what is kept.
  const top = digits(run.top ?? '')
  top.forEach((finger, index) => {
    fingers[count - top.length + index] = finger
  })
  digits(run.bottom ?? '').forEach((finger, index) => {
    fingers[index] = finger
  })

  return fingers
}

/**
 * The chromatic scale, which the book gives as a rule and not a shape.
 *
 * From the fully fingered two-octave line on the chromatic page: every black
 * key takes the 3rd finger and every white key the thumb, except where two
 * white keys are neighbours — E–F and B–C — and one of the pair has to give
 * way. The right hand's 2nd finger takes F and C; the left hand's takes E and
 * B.
 *
 * And the right hand's lowest note takes the thumb even where it is a C: the
 * page starts and ends that line on 1 and plays the two Cs above it on 2. There
 * is nothing below the bottom note for the thumb to have just played.
 *
 * (The same page opens with a second fingering, in groups of three and four —
 * `1 2 3 4 1 2 3` — printed only in part and only from C. It is an alternative
 * for another system to offer, not this one's default.)
 */
const CHROMATIC_SECOND_FINGER: Record<Hand, readonly number[]> = {
  right: [0, 5], // C and F
  left: [4, 11], // E and B
}

function chromatic(notes: readonly number[], hand: Hand): number[] {
  const seconds = CHROMATIC_SECOND_FINGER[hand]
  const fingers = notes.map((note) =>
    isBlackKey(note) ? 3 : seconds.includes(normalisePitchClass(note)) ? 2 : 1,
  )
  if (hand === 'right' && fingers[0] === 2) fingers[0] = 1
  return fingers
}

function scale(query: ScaleFingeringQuery) {
  if (query.scaleTypeId === 'chromatic') {
    return query.notes.length > 0 ? { fingers: chromatic(query.notes, query.hand) } : null
  }

  const form = PAGES[query.scaleTypeId]
  if (!form) return null

  // `Bb` and `B♭` are one name written two ways; D♯ and E♭ are two names.
  const tonic = parsePitch(query.tonic)?.name
  if (tonic === undefined) return null

  const page = form.pages[tonic] ?? form.pages[PLAYED_FROM[form.mode][tonic] ?? '']
  if (!page) return null

  const run = page[query.hand]
  return { fingers: layOut(run, query.octaves), cycle: digits(run.cycle) }
}

export const TRADITIONAL: FingeringSystem = {
  id: 'traditional',
  name: 'Traditional / Orthodox',
  shortName: 'Traditional',
  description:
    'The fingering printed in The Brown Scale Book, including the way it opens and turns each scale.',
  reference:
    'Scales, Chords and Arpeggios for Piano — The Brown Scale Book (Frederick Harris Music, ©1948)',
  scale,
}
