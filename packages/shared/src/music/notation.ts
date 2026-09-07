/**
 * Turning a sounded note into a written one.
 *
 * `staffPlacement` says where a note sits. This says what it looks like: how
 * long it is written as, which way its stem points, and whether its accidental
 * needs printing at all given the key.
 *
 * ## What MIDI can and cannot tell us
 *
 * A performance is not a score. A file records how long a key was held, and a
 * player holding a crotchet for 92% of its length has played a crotchet, not a
 * dotted quaver — so a duration is *matched* to the nearest written value
 * rather than converted to one. Notes shorter than the gap that follows them
 * are staccato rather than short, which is why callers should pass the time
 * until the next note where they have it.
 *
 * Nothing here can recover what a file never held: voices, ties across a bar,
 * tuplets, or the difference between a rest and a note that stopped early.
 */

import { staffPlacement, type StaffPlacement } from './staff.js'

export type NoteValue = 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth' | 'thirty-second'

export interface WrittenValue {
  readonly value: NoteValue
  readonly dotted: boolean
  /** A filled notehead, which is everything shorter than a minim. */
  readonly filled: boolean
  /** Whether it carries a stem at all — a semibreve does not. */
  readonly stemmed: boolean
  /** How many flags the stem carries, before any beaming. */
  readonly flags: number
}

/** Each written value, in beats, longest first. */
const VALUES: readonly (WrittenValue & { beats: number })[] = [
  { beats: 4, value: 'whole', dotted: false, filled: false, stemmed: false, flags: 0 },
  { beats: 3, value: 'half', dotted: true, filled: false, stemmed: true, flags: 0 },
  { beats: 2, value: 'half', dotted: false, filled: false, stemmed: true, flags: 0 },
  { beats: 1.5, value: 'quarter', dotted: true, filled: true, stemmed: true, flags: 0 },
  { beats: 1, value: 'quarter', dotted: false, filled: true, stemmed: true, flags: 0 },
  { beats: 0.75, value: 'eighth', dotted: true, filled: true, stemmed: true, flags: 1 },
  { beats: 0.5, value: 'eighth', dotted: false, filled: true, stemmed: true, flags: 1 },
  { beats: 0.375, value: 'sixteenth', dotted: true, filled: true, stemmed: true, flags: 2 },
  { beats: 0.25, value: 'sixteenth', dotted: false, filled: true, stemmed: true, flags: 2 },
  { beats: 0.125, value: 'thirty-second', dotted: false, filled: true, stemmed: true, flags: 3 },
]

/**
 * The written value nearest to a played length.
 *
 * Matched on ratio rather than difference, because the ear and the page both
 * work in halves: 0.75 of a beat is as far from a crotchet as 1.33 of one, and
 * a fixed tolerance in milliseconds would call a slow piece's quavers minims.
 */
export function writtenValue(durationMs: number, beatMs: number): WrittenValue {
  if (!(durationMs > 0) || !(beatMs > 0)) return VALUES.find((v) => v.beats === 1)!
  const beats = durationMs / beatMs

  let best = VALUES[0]!
  let bestError = Infinity
  for (const candidate of VALUES) {
    const error = Math.abs(Math.log(beats / candidate.beats))
    if (error < bestError) {
      bestError = error
      best = candidate
    }
  }
  const { beats: _beats, ...written } = best
  return written
}

/**
 * The middle line of each staff, in steps from middle C.
 *
 * Treble's is B4 and bass's is D3. A note above its staff's middle line takes a
 * stem downward and one below takes it up, which is what keeps stems inside the
 * system instead of running off the top of the page.
 */
const MIDDLE_LINE = { treble: 6, bass: -6 } as const

export type StemDirection = 'up' | 'down'

/**
 * Which way one note's stem points.
 *
 * For a chord it is the note furthest from the middle line that decides, and
 * every note in the chord shares that one stem — a chord with a stem per note
 * is not a chord, it is a pile of notes.
 */
export function stemDirection(placements: readonly StaffPlacement[]): StemDirection {
  if (placements.length === 0) return 'up'
  const middle = MIDDLE_LINE[placements[0]!.staff]
  const furthest = placements.reduce((far, one) =>
    Math.abs(one.steps - middle) > Math.abs(far.steps - middle) ? one : far,
  )
  return furthest.steps > middle ? 'down' : 'up'
}

// --- Key signatures ---------------------------------------------------------

/** The order sharps are written in, as letter indices: F C G D A E B. */
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6] as const
/** And flats, which is the same order backwards: B E A D G C F. */
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3] as const

/**
 * Where each accidental of a key signature is written.
 *
 * Derived from the notes themselves rather than typed out, because the four
 * tables are easy to get wrong and impossible to check by eye — every one of
 * them was wrong when written by hand. A signature's sharps are always
 * F5 C5 G5 D5 A4 E5 B4 in the treble and a seventh lower in the bass; its flats
 * are B4 E5 A4 D5 G4 C5 F4, likewise.
 */
const stepsOf = (letter: string, octave: number) => (octave - 4) * 7 + 'CDEFGAB'.indexOf(letter)

const positions = (spelling: readonly (readonly [string, number])[]) => ({
  treble: spelling.map(([letter, octave]) => stepsOf(letter, octave)),
  // The bass staff writes the same signature an octave and a fourth lower,
  // which is one line-and-space pair: seven letter-steps.
  bass: spelling.map(([letter, octave]) => stepsOf(letter, octave) - 14),
})

const SHARP_POSITIONS = positions([
  ['F', 5],
  ['C', 5],
  ['G', 5],
  ['D', 5],
  ['A', 4],
  ['E', 5],
  ['B', 4],
])
const FLAT_POSITIONS = positions([
  ['B', 4],
  ['E', 5],
  ['A', 4],
  ['D', 5],
  ['G', 4],
  ['C', 5],
  ['F', 4],
])

export interface KeySignatureMark {
  readonly steps: number
  readonly sign: '♯' | '♭'
}

/**
 * Where to draw a key signature, given how many sharps or flats it has.
 *
 * Positive fifths are sharps, negative are flats — the same number MusicXML
 * writes and the one `estimateKey` produces.
 */
export function keySignature(fifths: number, staff: 'treble' | 'bass'): KeySignatureMark[] {
  const count = Math.min(7, Math.abs(fifths))
  const sharps = fifths > 0
  const steps = sharps ? SHARP_POSITIONS[staff] : FLAT_POSITIONS[staff]
  return Array.from({ length: count }, (_, i) => ({
    steps: steps[i]!,
    sign: sharps ? ('♯' as const) : ('♭' as const),
  }))
}

/** The letters a key signature already alters, so their notes need no sign. */
export function alteredLetters(fifths: number): ReadonlySet<number> {
  const count = Math.min(7, Math.abs(fifths))
  const order = fifths > 0 ? SHARP_ORDER : FLAT_ORDER
  return new Set(order.slice(0, count))
}

/**
 * Whether this note needs an accidental printed in front of it.
 *
 * A key signature does the work once at the start of the line, so a piece in D
 * major writes no sharp on any F. Only a note the signature does not already
 * account for carries its own sign.
 *
 * Since a note is spelled with sharps here, a flat key can only be shown
 * honestly where the signature covers it — which it does for every note in the
 * key, and those are the notes a piece is mostly made of.
 */
export function needsAccidental(note: number, fifths: number): boolean {
  const placement = staffPlacement(note)
  if (!placement.sharp) return false
  const letters = alteredLetters(fifths)
  const letterIndex = 'CDEFGAB'.indexOf(placement.letter)
  return !(fifths > 0 && letters.has(letterIndex))
}

export type { StaffPlacement }
