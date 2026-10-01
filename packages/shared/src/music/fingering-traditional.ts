import { isBlackKey } from '../midi/notes.js'
import type { Hand } from './fingering.js'
import type { KeyMode } from './chords.js'
import type {
  ArpeggioFingeringQuery,
  ChordFingeringQuery,
  FingeringSystem,
  ScaleFingeringQuery,
} from './fingering-system.js'
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
interface RunEnds {
  /** The lowest notes of the run, from the bottom up, where the page differs. */
  readonly bottom?: string
  /** The highest notes of the run, ending on the top note, where it differs. */
  readonly top?: string
  /**
   * The lowest notes again, from the bottom up, as the run comes back down
   * onto them — for the few lines that close on different fingers from the
   * ones they opened on.
   */
  readonly close?: string
}

interface HandRun extends RunEnds {
  /** One finger per degree, tonic first — the body of the run. */
  readonly cycle: string
}

/**
 * One key's page.
 *
 * `right` and `left` are the "similar motion in octaves" line, and every other
 * line on the page is those two hands again unless it says otherwise:
 *
 * - `contrary` — "contrary motion from unison". Each hand plays its own run,
 *   the left from the top down. Listed only where the page fingers a hand
 *   differently there.
 * - `third` — "separated by a third". The left hand is as above; the right
 *   runs from the third degree, on the same fingers those notes always take,
 *   so only its ends are listed.
 * - `sixth` — "separated by a sixth". The right hand is as above; the left
 *   runs from the third degree, a sixth below.
 */
interface KeyPage {
  readonly right: HandRun
  readonly left: HandRun
  readonly contrary?: { readonly right?: HandRun; readonly left?: HandRun }
  readonly third?: RunEnds
  readonly sixth?: RunEnds
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

/**
 * A sixth apart in the flat keys, the left hand starts on a white key that is
 * a thumb everywhere else in the scale. The page starts it on the little
 * finger instead and walks down to the thumb — `5 4 3 2 1` — and ends on it
 * again. (It prints a small `1` under the `5` as the alternative.)
 */
const SIXTH_FROM_FIVE: RunEnds = { bottom: '5' }

const MAJOR: Pages = {
  // C alone turns the left hand at the top of the sixths on `3 2`, not `4 3`.
  C: { ...WHITE, sixth: { top: '32' } },
  G: WHITE,
  D: WHITE,
  A: WHITE,
  E: WHITE,
  B: { right: RIGHT, left: LEFT_FROM_B },
  'F♯': {
    right: { cycle: '2341231' },
    left: { cycle: '4321321', top: '2' },
    // A♯ is a 4th finger in the scale; a third apart it opens on the 3rd.
    third: { bottom: '3' },
  },
  F: { right: RIGHT_FROM_F, left: LEFT },
  // The similar-motion line prints no digit on the left hand's top note. The
  // contrary-motion and third-apart lines of the same page do, and it is a 2.
  'B♭': {
    right: { cycle: '4123123', bottom: '2' },
    left: LEFT_FLAT,
    sixth: SIXTH_FROM_FIVE,
  },
  'E♭': {
    right: { cycle: '3123412', bottom: '2' },
    left: LEFT_FLAT,
    sixth: SIXTH_FROM_FIVE,
  },
  'A♭': {
    right: { cycle: '3412312', bottom: '23' },
    left: LEFT_FLAT,
    // In contrary motion the page's main line of digits opens `3 4`, with the
    // similar-motion `2 3` tucked beneath it as the alternative.
    contrary: { right: { cycle: '3412312' } },
    sixth: SIXTH_FROM_FIVE,
  },
  'D♭': { right: { cycle: '2312341' }, left: LEFT_FLAT, sixth: SIXTH_FROM_FIVE },
}

/** The right hand of F♯, C♯ and G♯ harmonic minor: 3 4 mid-run, opened on 2 3. */
const RIGHT_SHARP_MINOR: HandRun = { cycle: '3412312', bottom: '23' }

const HARMONIC_MINOR: Pages = {
  A: WHITE,
  E: WHITE,
  B: { right: RIGHT, left: LEFT_FROM_B },
  'F♯': {
    right: RIGHT_SHARP_MINOR,
    left: { cycle: '4321321', top: '2' },
    // Contrary motion is printed `3 4` from the first note, and ends on it.
    contrary: { right: { cycle: '3412312' } },
  },
  'C♯': { right: RIGHT_SHARP_MINOR, left: LEFT_FLAT },
  'G♯': {
    right: RIGHT_SHARP_MINOR,
    left: LEFT_FLAT,
    // Contrary motion opens `2 3` like the line above it and closes `4 3`.
    contrary: { right: { cycle: '3412312', bottom: '23', close: '34' } },
  },
  'D♯': { right: { cycle: '3123412', bottom: '2' }, left: { cycle: '2143213' } },
  D: WHITE,
  G: WHITE,
  C: WHITE,
  F: { right: RIGHT_FROM_F, left: LEFT },
  // The left hand is printed twice at the opening: `5 4` under the staff and
  // `2 1 3` over it. The one under the staff is where the book puts the left
  // hand's fingering everywhere else, the run closes on it — a 4 on the last
  // C, so a 5 on the last B♭ — and the contrary-motion line below it reaches
  // its lowest note on `4 5`. So that is the one recorded.
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

/**
 * Lays a printed hand out over however many octaves were asked for, from
 * whichever degree the run starts on.
 */
function layOut(
  cycle: readonly number[],
  ends: RunEnds,
  octaves: number,
  startDegree: number,
): { fingers: number[]; closing?: number[] } {
  const count = cycle.length * Math.max(1, octaves) + 1
  const fingers = Array.from(
    { length: count },
    (_, index) => cycle[(index + startDegree) % cycle.length]!,
  )

  // The top first, so that in a run short enough for the two to meet, the
  // opening — which is where the hand actually starts — is what is kept.
  const top = digits(ends.top ?? '')
  top.forEach((finger, index) => {
    fingers[count - top.length + index] = finger
  })

  const withBottom = (bottom: string | undefined) => {
    const laid = [...fingers]
    digits(bottom ?? '').forEach((finger, index) => {
      laid[index] = finger
    })
    return laid
  }

  return {
    fingers: withBottom(ends.bottom),
    ...(ends.close === undefined ? {} : { closing: withBottom(ends.close) }),
  }
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
  const form = query.form ?? 'similar'
  const startDegree = query.startDegree ?? 0

  if (query.scaleTypeId === 'chromatic') {
    // A rule about keys, so it does not care where the run starts.
    return query.notes.length > 0 ? { fingers: chromatic(query.notes, query.hand) } : null
  }

  const printed = PAGES[query.scaleTypeId]
  if (!printed) return null

  // `Bb` and `B♭` are one name written two ways; D♯ and E♭ are two names.
  const tonic = parsePitch(query.tonic)?.name
  if (tonic === undefined) return null

  const page = printed.pages[tonic] ?? printed.pages[PLAYED_FROM[printed.mode][tonic] ?? '']
  if (!page) return null

  if (startDegree === 0) {
    // The hand's own run from the tonic — as the page's line for this form
    // prints it, where that line differs.
    const run = (form === 'contrary' ? page.contrary?.[query.hand] : undefined) ?? page[query.hand]
    const cycle = digits(run.cycle)
    return { ...layOut(cycle, run, query.octaves, 0), cycle }
  }

  // A run from the third degree. The book prints one only for the major keys:
  // the right hand of the thirds, the left hand of the sixths.
  const ends =
    startDegree === 2 && form === 'third' && query.hand === 'right'
      ? (page.third ?? {})
      : startDegree === 2 && form === 'sixth' && query.hand === 'left'
        ? (page.sixth ?? {})
        : undefined
  if (ends === undefined || query.scaleTypeId !== 'major') return null

  const cycle = digits(page[query.hand].cycle)
  return { ...layOut(cycle, ends, query.octaves, startDegree), cycle }
}

/**
 * Chords, solid and broken.
 *
 * The book prints these under every key and fingers them the same way in every
 * key: a chord's fingering follows its shape, not its notes. One row per
 * position, lowest note first.
 *
 * The 3rd finger and the 4th trade places as the gaps move: whichever hand has
 * the wide gap next to its little finger takes the 4th finger there.
 */
const CHORD_SHAPES: Readonly<
  Record<'triad' | 'four-note' | 'dominant' | 'diminished', Record<Hand, readonly string[]>>
> = {
  // Root position, 1st inversion, 2nd inversion.
  triad: { right: ['135', '125', '135'], left: ['531', '531', '521'] },
  // The triad with its octave: four notes under one hand.
  'four-note': { right: ['1235', '1245', '1245'], left: ['5421', '5421', '5321'] },
  // Root position and three inversions.
  dominant: {
    right: ['1245', '1245', '1235', '1245'],
    left: ['5421', '5421', '5321', '5421'],
  },
  // Every position of a diminished seventh is the same shape — minor thirds
  // all the way up — so every position is fingered alike.
  diminished: {
    right: ['1245', '1245', '1245', '1245'],
    left: ['5421', '5421', '5421', '5421'],
  },
}

function chord(query: ChordFingeringQuery) {
  const shape =
    CHORD_SHAPES[
      query.kind !== 'seventh' ? query.kind : query.mode === 'major' ? 'dominant' : 'diminished'
    ][query.hand]
  return digits(shape[((query.position % shape.length) + shape.length) % shape.length]!)
}

/**
 * Arpeggios, two octaves, as printed under each key.
 *
 * Unlike the chords these are different in every key, because where the thumb
 * can go depends on which of the notes are black. So they are a table: for
 * each key, each position, the right hand and then the left, ascending.
 *
 * The page prints the way down as well. It is the way up read backwards in all
 * but a handful of places, where one finger near the turn differs; those few
 * are not recorded, and the descent is the ascent mirrored.
 */
type ArpeggioPosition = readonly [right: string, left: string]

/** Root position, 1st inversion, 2nd inversion. */
const TONIC_ARPEGGIOS: Readonly<Record<KeyMode, Readonly<Record<string, string>>>> = {
  // 'right hand × 3 | left hand × 3'
  major: {
    C: '1231235 1241245 1241245 | 5421421 5421421 5321321',
    G: '1231235 1241245 1241245 | 5421421 5421421 5321321',
    D: '1231235 2124124 1241245 | 5421421 4214212 5321321',
    A: '1231235 2124124 1241245 | 5421421 4214212 5321321',
    E: '1231235 2124124 1241245 | 5421421 4214212 5321321',
    B: '1231235 2312312 2123123 | 5321321 3213212 2132132',
    // All black keys, so nothing is gained by keeping the thumb off them.
    'F♯': '1231235 1241245 1241245 | 5421421 5421421 5321321',
    F: '1231235 1241245 1241245 | 5421421 5421421 5321321',
    'B♭': '2124124 1241245 1241245 | 4214212 5421421 5321321',
    'E♭': '2124124 1241245 2412412 | 2142142 5421421 4214212',
    'A♭': '2124124 1241245 2412412 | 2142142 5421421 4214212',
    'D♭': '2124124 1241245 2412412 | 2142142 5421421 4214212',
  },
  minor: {
    A: '1231235 1241245 1241245 | 5421421 5421421 5321321',
    E: '1231235 1241245 1241245 | 5421421 5421421 5321321',
    B: '1231235 1241245 2124124 | 5421421 5421421 4214212',
    'F♯': '2124124 1241245 2412412 | 2142142 5421421 4214212',
    'C♯': '2124124 1241245 2412412 | 2142142 5421421 4214212',
    'G♯': '2124124 1241245 2412412 | 2142142 5421421 4214212',
    'D♯': '1231235 1241245 1241245 | 5421421 5421421 5321321',
    D: '1231235 1241245 1241245 | 5421421 5421421 5321321',
    G: '1231235 2124124 1241245 | 5421421 4214212 5321321',
    C: '1231235 2124124 1241245 | 5421421 4214212 5321321',
    F: '1231235 2124124 1241245 | 5421421 4214212 5321321',
    'B♭': '2312312 2123123 1231235 | 3213212 2132132 5321321',
  },
}

/** The white-key shape: four fingers, thumb under, and the little finger on top. */
const W: ArpeggioPosition = ['123412345', '543214321']
/** Starting on a black key with the thumb on the next note up. */
const B: ArpeggioPosition = ['212341234', '432143212']
/** Two black keys before the thumb, taken 2 3. */
const BB: ArpeggioPosition = ['231234123', '432143212']

/**
 * The seventh chord of each key — dominant seventh in the major keys,
 * diminished seventh in the minor — in its four positions.
 */
const SEVENTH_ARPEGGIOS: Readonly<
  Record<KeyMode, Readonly<Record<string, readonly ArpeggioPosition[]>>>
> = {
  major: {
    C: [W, W, W, W],
    G: [W, B, W, W],
    D: [W, B, W, W],
    A: [W, B, W, W],
    E: [W, BB, ['212341234', '321432132'], W],
    B: [['234123412', '432143212'], ['341234123', '321432143'], ['212341234', '214321432'], W],
    'F♯': [['212341234', '214321432'], W, B, W],
    F: [W, W, W, B],
    'B♭': [W, W, W, B],
    'E♭': [['212341234', '321432143'], W, W, BB],
    'A♭': [['212341234', '214321432'], W, ['234123412', '432143212'], ['341234123', '321432143']],
    'D♭': [['212341234', '214321432'], W, ['234123412', '432143212'], ['341234123', '321432143']],
  },
  minor: {
    A: [B, W, W, W],
    E: [BB, ['312341234', '321432143'], W, W],
    B: [BB, ['212341234', '321432143'], W, W],
    'F♯': [W, B, W, W],
    'C♯': [W, BB, ['212341234', '321432132'], W],
    'G♯': [W, BB, ['212341234', '321432132'], W],
    'D♯': [W, W, B, W],
    D: [['212341234', '321432143'], W, W, BB],
    G: [['212341234', '321432143'], W, W, BB],
    C: [W, W, W, B],
    // The one place the page takes a black key with the 4th finger on the way
    // to the thumb: B♭ 2, D♭ 4, E 1.
    F: [W, W, ['241234123', '432143212'], ['212341234', '321432143']],
    'B♭': [W, W, BB, ['212341234', '321432143']],
  },
}

function arpeggio(query: ArpeggioFingeringQuery) {
  // The page prints two octaves. A fingering that opens and turns its own way
  // in every key is not something to stretch or cut by guesswork.
  if (query.octaves !== 2) return null

  const tonic = parsePitch(query.tonic)?.name
  if (tonic === undefined) return null
  const from = PLAYED_FROM[query.mode][tonic]
  const hand = query.hand === 'right' ? 0 : 1

  if (query.kind === 'triad') {
    const keys = TONIC_ARPEGGIOS[query.mode]
    const page = keys[tonic] ?? (from ? keys[from] : undefined)
    const run = page?.split(' | ')[hand]?.split(' ')[query.position]
    return run ? digits(run) : null
  }

  const keys = SEVENTH_ARPEGGIOS[query.mode]
  const page = keys[tonic] ?? (from ? keys[from] : undefined)
  const run = page?.[query.position]?.[hand]
  return run ? digits(run) : null
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
  chord,
  arpeggio,
}
