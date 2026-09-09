/**
 * Turning a sounded note into a written one.
 *
 * `staffPlacement` says where a note sits. This says what it looks like: how
 * long it is written as, which way its stem points, which accidental to print
 * in front of it given the key and the bar so far, and how a duration that no
 * single note value can write is broken into tied ones.
 *
 * ## What MIDI can and cannot tell us
 *
 * A performance is not a score. A file records how long a key was held, and a
 * player holding a crotchet for 92% of its length has played a crotchet, not a
 * dotted quaver — so a played duration is *matched* to the nearest written
 * value rather than converted to one. A score, on the other hand, states its
 * durations exactly, and those are split rather than matched.
 */

import { type Accidental } from './pitch.js'
import { staffPlacement, type StaffPlacement } from './staff.js'

export type NoteValue = 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth' | 'thirty-second'

export interface WrittenValue {
  readonly value: NoteValue
  readonly dotted: boolean
  /** How many dots. `dotted` is `dots > 0`, kept because everything reads it. */
  readonly dots: number
  /** A filled notehead, which is everything shorter than a minim. */
  readonly filled: boolean
  /** Whether it carries a stem at all — a semibreve does not. */
  readonly stemmed: boolean
  /** How many flags the stem carries, before any beaming. */
  readonly flags: number
}

/** Each plain value in crotchets, longest first. */
const VALUE_QUARTERS: readonly { value: NoteValue; quarters: number; flags: number }[] = [
  { value: 'whole', quarters: 4, flags: 0 },
  { value: 'half', quarters: 2, flags: 0 },
  { value: 'quarter', quarters: 1, flags: 0 },
  { value: 'eighth', quarters: 0.5, flags: 1 },
  { value: 'sixteenth', quarters: 0.25, flags: 2 },
  { value: 'thirty-second', quarters: 0.125, flags: 3 },
]

/** How long a value is, in crotchets, with its dots. */
export function valueQuarters(value: NoteValue, dots = 0): number {
  const plain = VALUE_QUARTERS.find((entry) => entry.value === value)!.quarters
  return plain * (2 - 2 ** -dots)
}

export function written(value: NoteValue, dots = 0): WrittenValue {
  const entry = VALUE_QUARTERS.find((candidate) => candidate.value === value)!
  return {
    value,
    dotted: dots > 0,
    dots,
    filled: value !== 'whole' && value !== 'half',
    stemmed: value !== 'whole',
    flags: entry.flags,
  }
}

/** Every value a note can be written as with up to one dot, longest first. */
const VALUES: readonly (WrittenValue & { beats: number })[] = VALUE_QUARTERS.flatMap((entry) => [
  { ...written(entry.value, 1), beats: entry.quarters * 1.5 },
  { ...written(entry.value, 0), beats: entry.quarters },
]).sort((a, b) => b.beats - a.beats)

/**
 * The written value nearest to a played length.
 *
 * Matched on ratio rather than difference, because the ear and the page both
 * work in halves: 0.75 of a beat is as far from a crotchet as 1.33 of one, and
 * a fixed tolerance in milliseconds would call a slow piece's quavers minims.
 */
export function writtenValue(durationMs: number, beatMs: number): WrittenValue {
  if (!(durationMs > 0) || !(beatMs > 0)) return written('quarter')
  const beats = durationMs / beatMs

  let best = VALUES[0]!
  let bestError = Infinity
  for (const candidate of VALUES) {
    // A dotted semibreve is not in a beginner's edition and would swallow
    // every long note near it.
    if (candidate.value === 'whole' && candidate.dotted) continue
    const error = Math.abs(Math.log(beats / candidate.beats))
    if (error < bestError) {
      bestError = error
      best = candidate
    }
  }
  const { beats: _beats, ...rest } = best
  return rest
}

/**
 * A duration in crotchets as one written value, or null if no single value
 * with up to two dots writes it. A tuplet's notes are written as their plain
 * value — a triplet quaver is a quaver — so a caller inside a tuplet passes
 * the written length rather than the sounding one.
 */
export function writtenFromQuarters(quarters: number): WrittenValue | null {
  for (const entry of VALUE_QUARTERS) {
    for (let dots = 0; dots <= 2; dots++) {
      if (Math.abs(valueQuarters(entry.value, dots) - quarters) < 1e-6) {
        return written(entry.value, dots)
      }
    }
  }
  return null
}

/** The finest value the engraver writes. Anything shorter is rounded up to it. */
const GRID_Q = 0.125

/** Rounds a crotchet count to the demisemiquaver grid. */
export function snapToGrid(quarters: number): number {
  return Math.round(quarters / GRID_Q) * GRID_Q
}

export interface Piece {
  readonly value: NoteValue
  readonly dots: number
  /** How long this piece is, in crotchets. */
  readonly quarters: number
}

/**
 * The longest single value that fits in a span, allowing one dot.
 *
 * One dot rather than two: double dots are correct and almost never what a
 * reader expects, and a tie says the same thing in a form everyone reads.
 */
function largestPiece(quarters: number): Piece | null {
  for (const entry of VALUE_QUARTERS) {
    for (const dots of [1, 0]) {
      const length = valueQuarters(entry.value, dots)
      if (length <= quarters + 1e-6) return { value: entry.value, dots, quarters: length }
    }
  }
  return null
}

/**
 * Writes a span of a bar as note values, tied where one will not do.
 *
 * The rules an engraver follows, in the order they matter:
 *
 *  1. One value (with a dot) writes the whole span where it can, unless the
 *     span crosses a boundary the eye has to be able to find: the half bar
 *     in 4/4, and the beat in compound time. A crotchet from the second
 *     quaver of a bar is an ordinary syncopation; the same crotchet across
 *     the half bar is two tied quavers, so the half bar stays visible.
 *  2. A span that starts off the beat first fills up to the next beat.
 *  3. What remains is written from the longest value down.
 *
 * `beatQ` is the beat in crotchets — one in simple time, one and a half in
 * compound — and `barQ` the bar. Spans are snapped to the demisemiquaver grid
 * first, so a played duration a few ticks short of a crotchet still writes as
 * one.
 */
export function splitSpan(startQ: number, quarters: number, beatQ: number, barQ = 4): Piece[] {
  const span = snapToGrid(quarters)
  if (span <= 0) return []
  const start = snapToGrid(startQ)

  const whole = writtenFromQuarters(span)
  if (whole && whole.dots <= 1 && !crossesBoundary(start, span, beatQ, barQ)) {
    return [{ value: whole.value, dots: whole.dots, quarters: span }]
  }

  const pieces: Piece[] = []
  let at = start
  let left = span

  // Off the beat: fill up to the next beat first, if that is not the whole
  // span already.
  const intoBeat = beatQ > 0 ? ((at % beatQ) + beatQ) % beatQ : 0
  if (intoBeat > 1e-6) {
    let toBeat = Math.min(left, beatQ - intoBeat)
    while (toBeat > 1e-6) {
      const piece = largestPiece(toBeat)
      if (!piece) break
      pieces.push(piece)
      toBeat -= piece.quarters
      left -= piece.quarters
      at += piece.quarters
    }
  }

  while (left > 1e-6) {
    const piece = largestPiece(left)
    if (!piece) break
    pieces.push(piece)
    left -= piece.quarters
    at += piece.quarters
  }
  return pieces
}

/**
 * Whether a span straddles a point the notation must show: the half bar of
 * a bar with an even number of simple beats, or a beat of compound time.
 */
function crossesBoundary(startQ: number, quarters: number, beatQ: number, barQ: number): boolean {
  const end = startQ + quarters
  const compound = Math.abs(beatQ - 1.5) < 1e-6 || Math.abs(beatQ - 3) < 1e-6
  const boundaries: number[] = []
  if (compound) {
    for (let at = beatQ; at < barQ - 1e-6; at += beatQ) boundaries.push(at)
  } else if (barQ >= 4 && Math.abs((barQ / beatQ) % 2) < 1e-6) {
    boundaries.push(barQ / 2)
  }
  return boundaries.some((at) => at > startQ + 1e-6 && at < end - 1e-6)
}

/**
 * Writes a silence as rests.
 *
 * Rests keep to the beat more strictly than notes do: a rest is not tied, so a
 * gap across a beat is written as one rest per beat rather than one longer
 * rest that hides where the beat fell. A whole bar of nothing is the one
 * exception, and is a semibreve rest whatever the metre.
 */
export function splitRest(startQ: number, quarters: number, beatQ: number, barQ: number): Piece[] {
  const span = snapToGrid(quarters)
  if (span <= 0) return []
  if (Math.abs(span - barQ) < 1e-6 && Math.abs(startQ) < 1e-6) {
    return [{ value: 'whole', dots: 0, quarters: span }]
  }

  const pieces: Piece[] = []
  let at = snapToGrid(startQ)
  let left = span
  while (left > 1e-6) {
    const intoBeat = beatQ > 0 ? ((at % beatQ) + beatQ) % beatQ : 0
    const toBeat = intoBeat > 1e-6 ? beatQ - intoBeat : beatQ
    let chunk = Math.min(left, toBeat)
    // Whole beats in a row may merge upward — two crotchet rests on beats
    // one and two are a minim rest — but never across the half bar in 4/4.
    if (intoBeat < 1e-6 && barQ >= 4 && at % (barQ / 2) < 1e-6) {
      chunk = Math.min(left, barQ / 2)
    }
    while (chunk > 1e-6) {
      const piece = largestPiece(chunk)
      if (!piece) return pieces
      pieces.push(piece)
      chunk -= piece.quarters
      left -= piece.quarters
      at += piece.quarters
    }
  }
  return pieces
}

// --- Stems -------------------------------------------------------------------

/**
 * The middle line of each staff, in steps from middle C.
 *
 * Treble's is B4 and bass's is D3. A note above its staff's middle line takes a
 * stem downward and one below takes it up, which is what keeps stems inside the
 * system instead of running off the top of the page.
 */
export const MIDDLE_LINE = { treble: 6, bass: -6 } as const

export type StemDirection = 'up' | 'down'

/**
 * Which way one note's stem points.
 *
 * For a chord it is the note furthest from the middle line that decides, and
 * every note in the chord shares that one stem — a chord with a stem per note
 * is not a chord, it is a pile of notes. A note *on* the middle line, and a
 * chord reaching equally far both ways, take the stem down: that is the
 * convention every engraving manual gives, and the one the eye expects.
 */
export function stemDirection(
  placements: readonly Pick<StaffPlacement, 'staff' | 'steps'>[],
): StemDirection {
  if (placements.length === 0) return 'up'
  const middle = MIDDLE_LINE[placements[0]!.staff]
  let above = 0
  let below = 0
  for (const placement of placements) {
    above = Math.max(above, placement.steps - middle)
    below = Math.max(below, middle - placement.steps)
  }
  return above >= below ? 'down' : 'up'
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
 * F5 C5 G5 D5 A4 E5 B4 in the treble; its flats are B4 E5 A4 D5 G4 C5 F4. The
 * bass clef writes each of them two octaves lower — the same place on its own
 * five lines, which is what makes the two signatures look alike.
 */
const stepsOf = (letter: string, octave: number) => (octave - 4) * 7 + 'CDEFGAB'.indexOf(letter)

const positions = (spelling: readonly (readonly [string, number])[]) => ({
  treble: spelling.map(([letter, octave]) => stepsOf(letter, octave)),
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

/** The letters a key signature alters, so their notes need no sign. */
export function alteredLetters(fifths: number): ReadonlySet<number> {
  const count = Math.min(7, Math.abs(fifths))
  const order = fifths > 0 ? SHARP_ORDER : FLAT_ORDER
  return new Set(order.slice(0, count))
}

/** The accidental a key signature gives a letter: sharp, flat or nothing. */
export function keyAccidental(letterIndex: number, fifths: number): Accidental {
  if (!alteredLetters(fifths).has(letterIndex)) return 0
  return fifths > 0 ? 1 : -1
}

/**
 * The accidental to print on a note with no bar to remember in.
 *
 * The live staff draws one moment at a time and has no bar, so a note prints
 * its sign whenever the signature does not already say it: a D♯ in C major,
 * a B♮ in F major, and nothing on the F♯ of D major.
 */
export function accidentalToShow(
  placement: Pick<StaffPlacement, 'letterIndex' | 'accidental'>,
  fifths: number,
): Accidental | null {
  const given = keyAccidental(placement.letterIndex, fifths)
  return placement.accidental === given ? null : placement.accidental
}

/**
 * Whether this note needs an accidental printed in front of it, in a key,
 * with no bar to remember in. Kept for the callers that only have a MIDI
 * number; a spelled note goes through `accidentalToShow`.
 */
export function needsAccidental(note: number, fifths: number): boolean {
  return accidentalToShow(staffPlacement(note), fifths) !== null
}

/**
 * The accidentals a bar has already said.
 *
 * An accidental holds for the rest of its bar, on its own letter and octave:
 * once a bar has printed a sharp on F5, every later F5 in that bar is sharp
 * without a sign, and an F5 that goes back to natural has to say so. The
 * signature is where every bar starts from. This is the memory that rule
 * needs; the engraver walks each staff's notes in order and asks it, one
 * note at a time, what to print.
 */
export class AccidentalMemory {
  readonly #fifths: number
  #inForce = new Map<string, Accidental>()

  constructor(fifths: number) {
    this.#fifths = fifths
  }

  /** A bar line: everything goes back to the signature. */
  startBar(): void {
    this.#inForce.clear()
  }

  /** Reads what is in force for a note without changing it. */
  inForce(placement: Pick<StaffPlacement, 'letterIndex' | 'octave'>): Accidental {
    return (
      this.#inForce.get(`${placement.letterIndex}:${placement.octave}`) ??
      keyAccidental(placement.letterIndex, this.#fifths)
    )
  }

  /**
   * What to print on this note, and remembers it. Null when the bar or the
   * signature already says it.
   */
  printFor(
    placement: Pick<StaffPlacement, 'letterIndex' | 'octave' | 'accidental'>,
  ): Accidental | null {
    const current = this.inForce(placement)
    this.#inForce.set(`${placement.letterIndex}:${placement.octave}`, placement.accidental)
    return placement.accidental === current ? null : placement.accidental
  }
}

export type { StaffPlacement }
