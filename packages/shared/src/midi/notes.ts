/**
 * MIDI note number utilities.
 *
 * The whole app speaks in MIDI note numbers (0-127) and converts to names,
 * frequencies and keyboard geometry only at the edges. Note 60 is middle C
 * (C4 in scientific pitch notation, which is what every DAW and every piano
 * method book uses), note 21 is A0 — the bottom key of an 88-key piano — and
 * note 108 is C8, the top one.
 */

export const MIDI_NOTE_MIN = 0
export const MIDI_NOTE_MAX = 127

/** A0 — the lowest key on a full-size 88-key piano. */
export const PIANO_LOWEST_NOTE = 21
/** C8 — the highest key on a full-size 88-key piano. */
export const PIANO_HIGHEST_NOTE = 108
/** Middle C. */
export const MIDDLE_C = 60

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const

/**
 * Pitch classes that are black keys. Derived from the layout of a piano octave
 * rather than hard-coded per note so the rule is stated once.
 */
const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10])

export type Accidental = 'sharp' | 'flat'

/** 0-11, where 0 is C. Correct for negative note numbers too. */
export function pitchClass(note: number): number {
  return ((note % 12) + 12) % 12
}

/** Scientific pitch octave: note 60 -> 4. */
export function octaveOf(note: number): number {
  return Math.floor(note / 12) - 1
}

export function isBlackKey(note: number): boolean {
  return BLACK_PITCH_CLASSES.has(pitchClass(note))
}

export function isWhiteKey(note: number): boolean {
  return !isBlackKey(note)
}

/** `noteName(61)` -> `'C#4'`. */
export function noteName(note: number, accidental: Accidental = 'sharp'): string {
  const names = accidental === 'flat' ? FLAT_NAMES : SHARP_NAMES
  return `${names[pitchClass(note)]}${octaveOf(note)}`
}

/** The letter without the octave: `'C#'`. */
export function pitchName(note: number, accidental: Accidental = 'sharp'): string {
  const names = accidental === 'flat' ? FLAT_NAMES : SHARP_NAMES
  return names[pitchClass(note)] as string
}

/**
 * Equal-temperament frequency in Hz. `a4` is exposed because some repertoire
 * and most historical instruments are not at 440.
 */
export function noteFrequency(note: number, a4 = 440): number {
  return a4 * 2 ** ((note - 69) / 12)
}

export function clampNote(note: number): number {
  return Math.min(MIDI_NOTE_MAX, Math.max(MIDI_NOTE_MIN, Math.round(note)))
}

/** Inclusive count of white keys in `[low, high]`. */
export function countWhiteKeys(low: number, high: number): number {
  let count = 0
  for (let n = low; n <= high; n++) if (isWhiteKey(n)) count++
  return count
}

/**
 * The index of `note` among the white keys starting at `low`. Black keys
 * return the index of the white key immediately below them, which is exactly
 * what the keyboard renderer needs to position a black key between two whites.
 */
export function whiteKeyIndex(note: number, low: number): number {
  let index = -1
  for (let n = low; n <= note; n++) if (isWhiteKey(n)) index++
  return Math.max(0, index)
}

/**
 * Widen a range so it starts and ends on a white key. A keyboard that begins
 * on a C# renders a black key with nothing under its left half, which reads as
 * a broken sprite rather than as a design choice.
 */
export function snapRangeToWhiteKeys(low: number, high: number): { low: number; high: number } {
  let lo = clampNote(low)
  let hi = clampNote(high)
  while (lo > MIDI_NOTE_MIN && isBlackKey(lo)) lo--
  while (hi < MIDI_NOTE_MAX && isBlackKey(hi)) hi++
  if (isBlackKey(lo)) lo++
  if (isBlackKey(hi)) hi--
  return { low: lo, high: Math.max(lo, hi) }
}
