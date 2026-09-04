/**
 * Note spelling.
 *
 * The app moves MIDI note numbers around; a MIDI note number knows its pitch
 * but not its name. Note 6 is F♯ in D major and G♭ in D♭ major, and printing
 * the wrong one under a key is the sort of thing a teacher would correct.
 *
 * So spelling is done properly: a note is a LETTER plus an ACCIDENTAL, and the
 * letters of a scale always run in order. That is what makes A♭ major come out
 * as A♭ B♭ C D♭ E♭ F G rather than as G♯ A♯ C C♯ D♯ F G.
 */

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const
export type Letter = (typeof LETTERS)[number]

/** Semitone of each natural letter, relative to C. */
const LETTER_SEMITONES = [0, 2, 4, 5, 7, 9, 11] as const

/** -2 double flat … +2 double sharp. */
export type Accidental = -2 | -1 | 0 | 1 | 2

const ACCIDENTAL_SYMBOLS: Record<number, string> = {
  [-2]: '𝄫',
  [-1]: '♭',
  0: '',
  1: '♯',
  2: '𝄪',
}

export interface Pitch {
  /** 0 = C … 6 = B. */
  readonly letter: number
  readonly accidental: Accidental
  /** 0-11. Derived, but carried so callers never recompute it. */
  readonly pitchClass: number
  /** e.g. `A♭`. */
  readonly name: string
}

export function makePitch(letter: number, accidental: Accidental): Pitch {
  const index = ((letter % 7) + 7) % 7
  return {
    letter: index,
    accidental,
    pitchClass: normalisePitchClass(LETTER_SEMITONES[index]! + accidental),
    name: `${LETTERS[index]}${ACCIDENTAL_SYMBOLS[accidental] ?? ''}`,
  }
}

export function normalisePitchClass(value: number): number {
  return ((value % 12) + 12) % 12
}

/**
 * The accidental that turns `letter` into `pitchClass`, or null when it would
 * need more than a double.
 *
 * The wrap has to be signed: C needs a flat to reach pitch class 11, not eleven
 * sharps, and a plain subtraction says the latter.
 */
export function accidentalFor(letter: number, pitchClass: number): Accidental | null {
  const natural = LETTER_SEMITONES[((letter % 7) + 7) % 7]!
  const raw = normalisePitchClass(pitchClass - natural)
  const signed = raw > 6 ? raw - 12 : raw
  return Math.abs(signed) <= 2 ? (signed as Accidental) : null
}

/** Every letter+accidental (up to a single sharp or flat) that sounds this pitch. */
export function spellingsFor(pitchClass: number): Pitch[] {
  const spellings: Pitch[] = []
  for (let letter = 0; letter < 7; letter++) {
    const accidental = accidentalFor(letter, pitchClass)
    // A root written with a double accidental is not a key anyone plays in.
    if (accidental !== null && Math.abs(accidental) <= 1) {
      spellings.push(makePitch(letter, accidental))
    }
  }
  return spellings
}

/** Parses `A`, `Bb`, `F#`, `E♭`. Returns null for anything else. */
export function parsePitch(name: string): Pitch | null {
  const match = /^([A-Ga-g])(bb|##|[b#♭♯𝄫𝄪]?)$/.exec(name.trim())
  if (!match) return null
  const letter = LETTERS.indexOf(match[1]!.toUpperCase() as Letter)
  if (letter < 0) return null
  const symbol = match[2] ?? ''
  const accidental: Accidental =
    symbol === 'bb' || symbol === '𝄫'
      ? -2
      : symbol === 'b' || symbol === '♭'
        ? -1
        : symbol === '##' || symbol === '𝄪'
          ? 2
          : symbol === '#' || symbol === '♯'
            ? 1
            : 0
  return makePitch(letter, accidental)
}

/** The MIDI note for this pitch in a given scientific octave. Note 60 is C4. */
export function pitchToMidi(pitch: Pitch, octave: number): number {
  // Built from the letter's natural position, not from the pitch class, so B♯3
  // lands on note 60 rather than wrapping to the octave below.
  return (octave + 1) * 12 + LETTER_SEMITONES[pitch.letter]! + pitch.accidental
}
