/**
 * Where a note sits on a grand staff.
 *
 * Staff position is *diatonic*, not chromatic: C♯ and C share a line, and the
 * sharp sign is what tells them apart. So a semitone count is the wrong number
 * to draw with — this converts a MIDI note into the letter-step it is written
 * on, and says separately whether it needs an accidental.
 *
 * Everything is measured in steps from middle C, which is the one note the two
 * staves share and the natural origin for a grand staff: the treble lines sit
 * at +2, +4, +6, +8, +10 and the bass lines at −2, −4, −6, −8, −10, so the
 * whole system is symmetric about zero and needs no per-staff offsets.
 */

import { MIDDLE_C } from '../midi/notes.js'

/** Letter index (C=0 … B=6) for each pitch class, spelled with sharps. */
const LETTER_OF_PITCH_CLASS = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6] as const
const SHARPENED = [
  false,
  true,
  false,
  true,
  false,
  false,
  true,
  false,
  true,
  false,
  true,
  false,
] as const
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const

export interface StaffPlacement {
  /** Which staff the note is written on. */
  readonly staff: 'treble' | 'bass'
  /**
   * Letter-steps above middle C; negative below. One step is half the gap
   * between two staff lines, so this doubles as the vertical coordinate.
   */
  readonly steps: number
  readonly letter: (typeof LETTERS)[number]
  /** True when the note needs a ♯ in front of it, spelled with sharps. */
  readonly sharp: boolean
  /** Octave in scientific pitch notation — middle C is C4. */
  readonly octave: number
}

export function staffPlacement(note: number): StaffPlacement {
  const pitchClass = ((note % 12) + 12) % 12
  const octave = Math.floor(note / 12) - 1
  const letterIndex = LETTER_OF_PITCH_CLASS[pitchClass]!
  const diatonic = octave * 7 + letterIndex
  const middle = 4 * 7 + 0

  return {
    // Middle C belongs to the treble staff, on its first ledger line below —
    // the usual convention, and the one that keeps a two-handed player's hands
    // on the staff each is reading.
    staff: note >= MIDDLE_C ? 'treble' : 'bass',
    steps: diatonic - middle,
    letter: LETTERS[letterIndex]!,
    sharp: SHARPENED[pitchClass]!,
    octave,
  }
}

/** `C♯4` — for the accessible name of a note nobody can see. */
export function staffNoteName(note: number): string {
  const placement = staffPlacement(note)
  return `${placement.letter}${placement.sharp ? '♯' : ''}${placement.octave}`
}

/**
 * The ledger lines a note needs, as step positions.
 *
 * A staff covers ten steps; anything outside its own five lines has to carry
 * its own. Middle C is the common case — one line, shared by both staves.
 */
/** Line positions of each staff, in steps from middle C. */
const EXTENT = {
  treble: { bottom: 2, top: 10 },
  bass: { bottom: -10, top: -2 },
} as const

export function ledgerSteps(placement: StaffPlacement): number[] {
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
