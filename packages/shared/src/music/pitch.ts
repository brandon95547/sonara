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
export const LETTER_SEMITONES = [0, 2, 4, 5, 7, 9, 11] as const

/** -2 double flat … +2 double sharp. */
export type Accidental = -2 | -1 | 0 | 1 | 2

export const ACCIDENTAL_SYMBOLS: Record<number, string> = {
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

// --- Spelling by key ----------------------------------------------------------

/**
 * A written note: which letter, and which accidental.
 *
 * What `Pitch` carries, less the fields derived from it, so it can live on a
 * stored note without dragging a name and a pitch class along. Every score
 * format records this — MusicXML as step and alter, MuseScore as a tonal pitch
 * class — and a MIDI file does not, which is why it is optional downstream.
 */
export interface Spelling {
  readonly letter: number
  readonly accidental: Accidental
}

/**
 * Position on the line of fifths, with C at 14.
 *
 * MuseScore's numbering, kept so a `<tpc>` read from a file needs no
 * conversion: F♭ is 6, F is 13, F♯ is 20, F𝄪 is 27, and every step of one is
 * a fifth up. Two spellings of one pitch are twelve apart — B♭ is 12, A♯ is 24
 * — which is what makes "which is nearer the key" a subtraction.
 */
const TPC_NATURAL = [14, 16, 18, 13, 15, 17, 19] as const
/** Letters in line-of-fifths order: F C G D A E B. */
const TPC_LETTERS = [3, 0, 4, 1, 5, 2, 6] as const

export function tpcOf(spelling: Spelling): number {
  return TPC_NATURAL[((spelling.letter % 7) + 7) % 7]! + 7 * spelling.accidental
}

/** The spelling at a position on the line of fifths, or null past a double. */
export function spellingFromTpc(tpc: number): Spelling | null {
  const letter = TPC_LETTERS[(((tpc + 1) % 7) + 7) % 7]!
  const accidental = Math.floor((tpc + 1) / 7) - 2
  if (accidental < -2 || accidental > 2) return null
  return { letter, accidental: accidental as Accidental }
}

/** The pitch class at a position on the line of fifths. */
export function pitchClassOfTpc(tpc: number): number {
  return normalisePitchClass(7 * tpc + 10)
}

export function spellingName(spelling: Spelling): string {
  return makePitch(spelling.letter, spelling.accidental).name
}

/**
 * How a pitch class is written in a key.
 *
 * The seven notes of the key are spelled as its signature spells them; that
 * much is a lookup. The other five are the question, and the answer is the
 * one an engraver gives: the spelling nearer the key on the line of fifths.
 * In C major that makes C♯, E♭, F♯, A♭ and B♭ — the sharps a piece in C
 * actually uses and the flats it actually uses, rather than one row of
 * either. A minor key extends its reach up to the raised sixth and seventh,
 * so A minor spells its leading tone G♯ and not A♭.
 *
 * `approach` is the melodic tie-break: a chromatic note a semitone below
 * the next one is written as a raised note going up and a lowered note
 * coming down, which is how a chromatic run reads as C C♯ D and D D♭ C
 * rather than one of them twice. It is only allowed to override the key
 * when the two spellings are close to equally near; B♭ in C major stays B♭
 * whichever way the line is going.
 */
export function spellInKey(
  pitchClass: number,
  fifths: number,
  mode: 'major' | 'minor' = 'major',
  approach?: 'up' | 'down',
): Spelling {
  const tonic = 14 + Math.max(-7, Math.min(7, fifths))
  const low = tonic - 1
  const high = tonic + 5 + (mode === 'minor' ? 3 : 0)

  // Every spelling of this pitch class within a double accidental, nearest
  // the key first. A double accidental outside the key is a real spelling
  // but a rare one — B major borrows a G♮ far more often than it raises an
  // F𝄪 — so it pays extra to be chosen. Inside the key it is the note: G♯
  // minor's leading tone is F𝄪 and nothing else.
  const candidates: { tpc: number; distance: number }[] = []
  for (let tpc = -1; tpc <= 33; tpc++) {
    if (pitchClassOfTpc(tpc) !== normalisePitchClass(pitchClass)) continue
    const distance = Math.max(0, low - tpc, tpc - high)
    const double = tpc < 6 || tpc > 26
    candidates.push({ tpc, distance: distance + (double && distance > 0 ? 3 : 0) })
  }
  candidates.sort((a, b) => a.distance - b.distance || Math.abs(a.tpc - 14) - Math.abs(b.tpc - 14))

  const best = candidates[0]!
  if (best.distance === 0) return spellingFromTpc(best.tpc)!

  const sharpSide = candidates.filter((c) => c.tpc > high).sort((a, b) => a.tpc - b.tpc)[0]
  const flatSide = candidates.filter((c) => c.tpc < low).sort((a, b) => b.tpc - a.tpc)[0]
  if (!sharpSide || !flatSide) return spellingFromTpc(best.tpc)!

  const gap = Math.abs(sharpSide.distance - flatSide.distance)
  if (approach && gap <= 2) {
    return spellingFromTpc(approach === 'up' ? sharpSide.tpc : flatSide.tpc)!
  }
  if (gap === 0) {
    // Flat keys and C lean to the flat side, sharp keys to the sharp side.
    return spellingFromTpc(fifths > 0 ? sharpSide.tpc : flatSide.tpc)!
  }
  return spellingFromTpc(best.tpc)!
}

/** The spelling a MIDI note carries when nothing has spelled it: sharps. */
export function sharpSpelling(pitchClass: number): Spelling {
  const pc = normalisePitchClass(pitchClass)
  for (let letter = 0; letter < 7; letter++) {
    if (LETTER_SEMITONES[letter] === pc) return { letter, accidental: 0 }
  }
  for (let letter = 0; letter < 7; letter++) {
    if (normalisePitchClass(LETTER_SEMITONES[letter]! + 1) === pc) return { letter, accidental: 1 }
  }
  return { letter: 0, accidental: 0 }
}
