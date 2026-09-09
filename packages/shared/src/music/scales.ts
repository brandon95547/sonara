import {
  accidentalFor,
  makePitch,
  normalisePitchClass,
  spellingsFor,
  tpcOf,
  type Accidental,
  type Pitch,
} from './pitch.js'

/**
 * Scale definitions.
 *
 * Pure data: a step pattern and the degree names that go with it. Nothing here
 * knows about a keyboard, a lesson or a React component — which is the point.
 * Adding a mode is one entry in this table and it appears everywhere the app
 * offers scales.
 *
 * `degrees` is not redundant with `steps`. It carries the *spelling* intent:
 * that the third of a natural minor is a flattened third, not a sharpened
 * second, and therefore takes the letter a third above the root. The two are
 * checked against each other in the tests.
 */

export interface ScaleType {
  readonly id: string
  readonly name: string
  /** Semitones between consecutive notes, root to octave. Sums to 12. */
  readonly steps: readonly number[]
  /** Degree names, one per note, root first. Drives letter choice when spelling. */
  readonly degrees: readonly string[]
  /** Groups the picker; also decides which spelling of a root reads better. */
  readonly family: 'major' | 'minor' | 'mode' | 'pentatonic' | 'other'
  readonly description: string
  /**
   * The form this scale takes coming back down, when it is not the same one.
   *
   * Only the melodic minor has one. It raises the sixth and seventh on the way
   * up to smooth the leap the harmonic minor leaves, and drops both again on
   * the way down — so its descending form is the natural minor. A melodic
   * minor that plays its ascending form in both directions is a different
   * scale (the jazz minor), and teaching it as the melodic minor teaches two
   * wrong notes every time the hand turns around.
   */
  readonly descendingTypeId?: string
  /**
   * How the scale is spelled coming back down, when that differs.
   *
   * Only the chromatic scale: it is written with sharps rising and flats
   * falling, so that every step is a raised note going up and a lowered one
   * coming down. Same pitches, same fingering, different names.
   */
  readonly descendingDegrees?: readonly string[]
  /**
   * Which degree of a major scale this scale begins on, for its key
   * signature.
   *
   * D dorian is the notes of C major from D, so its signature is C major's;
   * A harmonic minor keeps C major's signature and writes its G♯ as an
   * accidental. Absent for the scales no signature fits — chromatic, whole
   * tone — which are written in C with accidentals throughout.
   */
  readonly signatureDegree?: number
  /**
   * Whether a degree that would need a double accidental may be respelled on
   * the neighbouring letter instead.
   *
   * The blues scale's flattened fifth from a flat root is the case: E♭ blues
   * by the letter rule is E♭ G♭ A♭ B𝄫 B♭ D♭, and no blues player has ever
   * written B𝄫 — the note is A. Scales are otherwise held to the letter rule,
   * because G♯ harmonic minor really does have an F𝄪.
   */
  readonly respellDoubles?: boolean
}

export const SCALE_TYPES: readonly ScaleType[] = [
  {
    id: 'major',
    name: 'Major',
    steps: [2, 2, 1, 2, 2, 2, 1],
    degrees: ['1', '2', '3', '4', '5', '6', '7'],
    family: 'major',
    signatureDegree: 1,
    description: 'The reference scale. Bright, and the one every other is described against.',
  },
  {
    id: 'natural-minor',
    name: 'Natural Minor',
    steps: [2, 1, 2, 2, 1, 2, 2],
    degrees: ['1', '2', '♭3', '4', '5', '♭6', '♭7'],
    family: 'minor',
    signatureDegree: 6,
    description:
      'The plain minor. Same notes as its relative major, started three semitones lower.',
  },
  {
    id: 'harmonic-minor',
    name: 'Harmonic Minor',
    steps: [2, 1, 2, 2, 1, 3, 1],
    degrees: ['1', '2', '♭3', '4', '5', '♭6', '7'],
    family: 'minor',
    signatureDegree: 6,
    description: 'Natural minor with the seventh raised, which is what gives it the leading tone.',
  },
  {
    id: 'melodic-minor',
    name: 'Melodic Minor',
    steps: [2, 1, 2, 2, 2, 2, 1],
    degrees: ['1', '2', '♭3', '4', '5', '6', '7'],
    family: 'minor',
    signatureDegree: 6,
    description:
      'Sixth and seventh raised going up, smoothing the leap harmonic minor has; both drop back on the way down.',
    descendingTypeId: 'natural-minor',
  },
  {
    id: 'dorian',
    name: 'Dorian',
    steps: [2, 1, 2, 2, 2, 1, 2],
    degrees: ['1', '2', '♭3', '4', '5', '6', '♭7'],
    family: 'mode',
    signatureDegree: 2,
    description: 'Minor with a raised sixth. The sound of a great deal of folk and jazz.',
  },
  {
    id: 'phrygian',
    name: 'Phrygian',
    steps: [1, 2, 2, 2, 1, 2, 2],
    degrees: ['1', '♭2', '♭3', '4', '5', '♭6', '♭7'],
    family: 'mode',
    signatureDegree: 3,
    description: 'Minor with a flattened second. Spanish, and unmistakable from the first step.',
  },
  {
    id: 'lydian',
    name: 'Lydian',
    steps: [2, 2, 2, 1, 2, 2, 1],
    degrees: ['1', '2', '3', '♯4', '5', '6', '7'],
    family: 'mode',
    signatureDegree: 4,
    description: 'Major with a raised fourth. Floating, unresolved, film-score bright.',
  },
  {
    id: 'mixolydian',
    name: 'Mixolydian',
    steps: [2, 2, 1, 2, 2, 1, 2],
    degrees: ['1', '2', '3', '4', '5', '6', '♭7'],
    family: 'mode',
    signatureDegree: 5,
    description: 'Major with a flattened seventh. The dominant-seventh sound.',
  },
  {
    id: 'locrian',
    name: 'Locrian',
    steps: [1, 2, 2, 1, 2, 2, 2],
    degrees: ['1', '♭2', '♭3', '4', '♭5', '♭6', '♭7'],
    family: 'mode',
    signatureDegree: 7,
    description: 'The one with no perfect fifth. Restless, and rarely used on its own.',
  },
  {
    id: 'major-pentatonic',
    name: 'Major Pentatonic',
    steps: [2, 2, 3, 2, 3],
    degrees: ['1', '2', '3', '5', '6'],
    family: 'pentatonic',
    signatureDegree: 1,
    description: 'Major with the two semitone steps removed. Nothing in it can clash.',
  },
  {
    id: 'minor-pentatonic',
    name: 'Minor Pentatonic',
    steps: [3, 2, 2, 3, 2],
    degrees: ['1', '♭3', '4', '5', '♭7'],
    family: 'pentatonic',
    signatureDegree: 6,
    description: 'The other five-note scale. Blues and rock live here.',
  },
  {
    id: 'blues',
    name: 'Blues',
    steps: [3, 2, 1, 1, 3, 2],
    degrees: ['1', '♭3', '4', '♭5', '5', '♭7'],
    family: 'other',
    signatureDegree: 6,
    respellDoubles: true,
    description:
      'Minor pentatonic with the flattened fifth pushed in between the fourth and fifth.',
  },
  {
    id: 'chromatic',
    name: 'Chromatic',
    steps: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    degrees: ['1', '♯1', '2', '♯2', '3', '4', '♯4', '5', '♯5', '6', '♯6', '7'],
    // Falling, the same twelve keys are lowered notes: C B B♭ A A♭ G G♭ …
    descendingDegrees: ['1', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', '7'],
    family: 'other',
    description: 'Every key in order. A technique exercise more than a colour.',
  },
  {
    id: 'whole-tone',
    name: 'Whole Tone',
    steps: [2, 2, 2, 2, 2, 2],
    degrees: ['1', '2', '3', '♯4', '♯5', '♯6'],
    family: 'other',
    description: 'Nothing but whole steps. No leading tone, so no gravity at all.',
  },
]

export function findScaleType(id: string): ScaleType | undefined {
  return SCALE_TYPES.find((type) => type.id === id)
}

/** Cumulative semitones from the root, one per note. Excludes the octave. */
export function scaleOffsets(type: ScaleType): number[] {
  const offsets = [0]
  for (let i = 0; i < type.steps.length - 1; i++) {
    offsets.push(offsets[i]! + type.steps[i]!)
  }
  return offsets
}

/**
 * The W/H formula a method book prints: whole step, half step, and the
 * augmented second that harmonic minor is known for.
 */
/**
 * One octave of a scale as MIDI notes, root to octave inclusive.
 *
 * Which octave it starts in does not matter to anything that reads this — what
 * matters is which notes are black, and that follows the pitch class. It exists
 * so a caller that only wants to know how a scale is fingered does not have to
 * build the note list itself and get it subtly wrong.
 */
export function octaveNotes(pitchClass: number, type: ScaleType, start = 60): number[] {
  const root = start + normalisePitchClass(pitchClass)
  return [...scaleOffsets(type).map((offset) => root + offset), root + 12]
}

export function scaleFormula(type: ScaleType): string {
  return type.steps
    .map((step) => (step === 2 ? 'W' : step === 1 ? 'H' : step === 3 ? 'W+H' : `${step}`))
    .join(' ')
}

/** The number in a degree label: `♭3` is a third, so it takes the third letter. */
export function degreeNumber(degree: string): number {
  const match = /(\d+)/.exec(degree)
  return match ? Number(match[1]) : 1
}

export interface SpelledScale {
  readonly root: Pitch
  readonly notes: readonly Pitch[]
  readonly type: ScaleType
}

/**
 * Spells a scale from a specific root.
 *
 * Each degree takes the letter its NUMBER implies — a ♭3 is a third above the
 * root, so it takes the third letter — and the accidental is whatever makes
 * that letter sound the right pitch. That single rule produces the traditional
 * spelling for everything here, including the blues scale's G♭ and G♮ sharing
 * the letter G.
 *
 * Returns null when the root would force a triple accidental, which is how the
 * caller knows to try the enharmonic root instead.
 */
export function spellScaleFrom(
  root: Pitch,
  type: ScaleType,
  degrees: readonly string[] = type.degrees,
): SpelledScale | null {
  const offsets = scaleOffsets(type)
  const notes: Pitch[] = []

  for (let i = 0; i < offsets.length; i++) {
    const pitchClass = normalisePitchClass(root.pitchClass + offsets[i]!)
    const letter = (root.letter + degreeNumber(degrees[i]!) - 1) % 7
    let accidental = accidentalFor(letter, pitchClass)
    let written = letter
    // A double accidental where the scale allows respelling moves to the
    // neighbouring letter: a double flat becomes the letter below, a double
    // sharp the letter above. B𝄫 is A; F𝄪 is G.
    if (accidental !== null && Math.abs(accidental) === 2 && type.respellDoubles) {
      written = (letter + (accidental < 0 ? 6 : 1)) % 7
      accidental = accidentalFor(written, pitchClass)
    }
    if (accidental === null) return null
    notes.push(makePitch(written, accidental))
  }

  return { root, notes, type }
}

/**
 * Spells a scale on a pitch class, choosing the root spelling a musician would.
 *
 * Both enharmonic roots are spelled out and the one needing fewer accidentals
 * wins — which is why pitch class 1 comes out as D♭ major (five flats) and not
 * C♯ major (seven sharps), and as C♯ minor (four sharps) and not D♭ minor
 * (eight flats). It is the same reasoning a key signature encodes, arrived at
 * from the notes rather than from a lookup table that has to be right for every
 * combination of root and mode.
 */
export function spellScale(pitchClass: number, type: ScaleType): SpelledScale {
  const candidates = spellingsFor(normalisePitchClass(pitchClass))
    .map((root) => spellScaleFrom(root, type))
    .filter((scale): scale is SpelledScale => scale !== null)

  if (candidates.length === 0) {
    // Cannot happen for the scales above, but a fallback beats a throw in a
    // path that renders a keyboard.
    return {
      root: makePitch(0, 0),
      notes: [makePitch(0, 0)],
      type,
    }
  }

  return candidates.sort((a, b) => {
    // The signature first, where the scale has one: G♯ harmonic minor
    // carries an F𝄪 that A♭ harmonic minor does not, and counting the
    // accidentals in the notes would call it a tie — but G♯ minor is five
    // sharps and A♭ minor is seven flats, and that is the fact a musician
    // names the key by.
    const signature = (scale: SpelledScale) => {
      const fifths = keySignatureOf(scale)
      return fifths === null ? 99 : Math.abs(fifths)
    }
    const bySignature = signature(a) - signature(b)
    if (bySignature !== 0) return bySignature
    const weight = (scale: SpelledScale) =>
      scale.notes.reduce((total, note) => total + Math.abs(note.accidental), 0)
    const byWeight = weight(a) - weight(b)
    if (byWeight !== 0) return byWeight
    // A tie means both spellings are in real use — F♯ major and G♭ major are
    // six of one, and so are D♯ minor and E♭ minor. Prefer the simpler root,
    // then the side the reference books print: the sharp name for a major
    // key and the flat name for a minor one, so the app says F♯ major and
    // E♭ minor everywhere it names them. The blues and pentatonic scales
    // built on a minor follow the minor.
    const byRoot = Math.abs(a.root.accidental) - Math.abs(b.root.accidental)
    if (byRoot !== 0) return byRoot
    return prefersFlats(type)
      ? a.root.accidental - b.root.accidental
      : b.root.accidental - a.root.accidental
  })[0]!
}

/** Whether a scale's root, on a tie, is named on the flat side. */
export function prefersFlats(type: ScaleType): boolean {
  return type.family === 'minor' || type.signatureDegree === 6
}

/**
 * Fifths on the line of fifths from the tonic to each degree of a major
 * scale: the fourth is one fifth down, the seventh five up.
 */
const DEGREE_FIFTHS = [0, 2, 4, -1, 1, 3, 5] as const

/**
 * The key signature a spelled scale is written in, as fifths, or null for a
 * scale no signature fits.
 *
 * Read off the line of fifths rather than by counting the scale's
 * accidentals, because the count is wrong for exactly the scales a player
 * would ask about: A harmonic minor has a G♯ and a signature of nothing.
 * The scale's root and its degree in the parent major fix the parent's
 * tonic, and the tonic fixes the signature — D♯ minor comes out as six
 * sharps and E♭ minor as six flats, because they are spelled differently.
 */
export function keySignatureOf(scale: SpelledScale): number | null {
  const degree = scale.type.signatureDegree
  if (degree === undefined) return null
  const parentTonic = tpcOf(scale.root) - DEGREE_FIFTHS[degree - 1]!
  const fifths = parentTonic - 14
  return Math.abs(fifths) <= 7 ? fifths : null
}

export type { Accidental }
