/**
 * Where a note sits on a grand staff.
 *
 * Staff position is *diatonic*, not chromatic: C♯ and C share a line, and the
 * sharp sign is what tells them apart. So a semitone count is the wrong number
 * to draw with — this converts a written note into the letter-step it is
 * written on, and says separately which accidental it carries.
 *
 * A MIDI note number knows its pitch and not its name, so a note arrives here
 * with its spelling where the file or the key supplied one. Without one it is
 * spelled with sharps, which is a last resort and not a policy: an A♯ drawn
 * in F major, under a signature with a flat on B, is the wrong note to a
 * reader, and the callers that know the key pass the spelling in.
 *
 * Everything is measured in steps from middle C, which is the one note the two
 * staves share and the natural origin for a grand staff: the treble lines sit
 * at +2, +4, +6, +8, +10 and the bass lines at −2, −4, −6, −8, −10, so the
 * whole system is symmetric about zero and needs no per-staff offsets.
 */

import { MIDDLE_C, pitchClass } from '../midi/notes.js'
import {
  ACCIDENTAL_SYMBOLS,
  LETTERS,
  sharpSpelling,
  type Accidental,
  type Spelling,
} from './pitch.js'

export type Staff = 'treble' | 'bass'

export interface StaffPlacement {
  /** Which staff the note is written on. */
  readonly staff: Staff
  /**
   * Letter-steps above middle C; negative below. One step is half the gap
   * between two staff lines, so this doubles as the vertical coordinate.
   */
  readonly steps: number
  readonly letter: (typeof LETTERS)[number]
  /** 0 = C … 6 = B. */
  readonly letterIndex: number
  /** The accidental the note is written with — not whether it is printed. */
  readonly accidental: Accidental
  /** Octave in scientific pitch notation of the *letter* — B♯3 is octave 3. */
  readonly octave: number
}

/**
 * Which staff a note belongs on.
 *
 * Piano music puts the right hand on the upper staff and the left on the
 * lower, wherever the notes fall — a left-hand chord above middle C is
 * written in the bass with ledger lines, not moved into the treble. So where
 * the hand is known it decides, and middle C is only the seam for a note
 * nobody has assigned to a hand, which is the live staff in free play.
 */
export function staffFor(note: number, hand?: 'left' | 'right' | null): Staff {
  if (hand === 'left') return 'bass'
  if (hand === 'right') return 'treble'
  return note >= MIDDLE_C ? 'treble' : 'bass'
}

export function staffPlacement(
  note: number,
  spelling?: Spelling | null,
  staff?: Staff | null,
): StaffPlacement {
  const spelled = spelling ?? sharpSpelling(pitchClass(note))
  const letterIndex = ((spelled.letter % 7) + 7) % 7
  // The octave belongs to the letter, not to the sound: B♯3 is note 60, and
  // it is written on B's line in octave 3, one step under middle C.
  const natural = note - spelled.accidental
  const octave = Math.floor(natural / 12) - 1
  const diatonic = octave * 7 + letterIndex
  const middle = 4 * 7

  return {
    staff: staff ?? staffFor(note),
    steps: diatonic - middle,
    letter: LETTERS[letterIndex]!,
    letterIndex,
    accidental: spelled.accidental,
    octave,
  }
}

/** `C♯4`, `B♭3` — for the accessible name of a note nobody can see. */
export function staffNoteName(note: number, spelling?: Spelling | null): string {
  const placement = staffPlacement(note, spelling)
  return `${placement.letter}${ACCIDENTAL_SYMBOLS[placement.accidental] ?? ''}${placement.octave}`
}

/** Line positions of each staff, in steps from middle C. */
const EXTENT = {
  treble: { bottom: 2, top: 10 },
  bass: { bottom: -10, top: -2 },
} as const

/**
 * The ledger lines a note needs, as step positions.
 *
 * A staff covers ten steps; anything outside its own five lines has to carry
 * its own. Middle C is the common case — one line, shared by both staves.
 */
export function ledgerSteps(placement: Pick<StaffPlacement, 'staff' | 'steps'>): number[] {
  const { bottom, top } = EXTENT[placement.staff]
  const lines: number[] = []

  // Only lines are drawn, so only even steps count. A note in the first space
  // beyond the staff sits clear of it and needs nothing under or over it.
  if (placement.steps >= top + 2) {
    for (let step = top + 2; step <= placement.steps; step += 2) lines.push(step)
  } else if (placement.steps <= bottom - 2) {
    for (let step = bottom - 2; step >= placement.steps; step -= 2) lines.push(step)
  }

  return lines
}
