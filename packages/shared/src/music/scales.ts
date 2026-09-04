import { accidentalFor, makePitch, normalisePitchClass, spellingsFor, type Pitch } from './pitch.js'

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
}

export const SCALE_TYPES: readonly ScaleType[] = [
  {
    id: 'major',
    name: 'Major',
    steps: [2, 2, 1, 2, 2, 2, 1],
    degrees: ['1', '2', '3', '4', '5', '6', '7'],
    family: 'major',
    description: 'The reference scale. Bright, and the one every other is described against.',
  },
  {
    id: 'natural-minor',
    name: 'Natural Minor',
    steps: [2, 1, 2, 2, 1, 2, 2],
    degrees: ['1', '2', '♭3', '4', '5', '♭6', '♭7'],
    family: 'minor',
    description:
      'The plain minor. Same notes as its relative major, started three semitones lower.',
  },
  {
    id: 'harmonic-minor',
    name: 'Harmonic Minor',
    steps: [2, 1, 2, 2, 1, 3, 1],
    degrees: ['1', '2', '♭3', '4', '5', '♭6', '7'],
    family: 'minor',
    description: 'Natural minor with the seventh raised, which is what gives it the leading tone.',
  },
  {
    id: 'melodic-minor',
    name: 'Melodic Minor',
    steps: [2, 1, 2, 2, 2, 2, 1],
    degrees: ['1', '2', '♭3', '4', '5', '6', '7'],
    family: 'minor',
    description: 'Ascending form: sixth and seventh raised, smoothing the leap harmonic minor has.',
  },
  {
    id: 'dorian',
    name: 'Dorian',
    steps: [2, 1, 2, 2, 2, 1, 2],
    degrees: ['1', '2', '♭3', '4', '5', '6', '♭7'],
    family: 'mode',
    description: 'Minor with a raised sixth. The sound of a great deal of folk and jazz.',
  },
  {
    id: 'phrygian',
    name: 'Phrygian',
    steps: [1, 2, 2, 2, 1, 2, 2],
    degrees: ['1', '♭2', '♭3', '4', '5', '♭6', '♭7'],
    family: 'mode',
    description: 'Minor with a flattened second. Spanish, and unmistakable from the first step.',
  },
  {
    id: 'lydian',
    name: 'Lydian',
    steps: [2, 2, 2, 1, 2, 2, 1],
    degrees: ['1', '2', '3', '♯4', '5', '6', '7'],
    family: 'mode',
    description: 'Major with a raised fourth. Floating, unresolved, film-score bright.',
  },
  {
    id: 'mixolydian',
    name: 'Mixolydian',
    steps: [2, 2, 1, 2, 2, 1, 2],
    degrees: ['1', '2', '3', '4', '5', '6', '♭7'],
    family: 'mode',
    description: 'Major with a flattened seventh. The dominant-seventh sound.',
  },
  {
    id: 'locrian',
    name: 'Locrian',
    steps: [1, 2, 2, 1, 2, 2, 2],
    degrees: ['1', '♭2', '♭3', '4', '♭5', '♭6', '♭7'],
    family: 'mode',
    description: 'The one with no perfect fifth. Restless, and rarely used on its own.',
  },
  {
    id: 'major-pentatonic',
    name: 'Major Pentatonic',
    steps: [2, 2, 3, 2, 3],
    degrees: ['1', '2', '3', '5', '6'],
    family: 'pentatonic',
    description: 'Major with the two semitone steps removed. Nothing in it can clash.',
  },
  {
    id: 'minor-pentatonic',
    name: 'Minor Pentatonic',
    steps: [3, 2, 2, 3, 2],
    degrees: ['1', '♭3', '4', '5', '♭7'],
    family: 'pentatonic',
    description: 'The other five-note scale. Blues and rock live here.',
  },
  {
    id: 'blues',
    name: 'Blues',
    steps: [3, 2, 1, 1, 3, 2],
    degrees: ['1', '♭3', '4', '♭5', '5', '♭7'],
    family: 'other',
    description:
      'Minor pentatonic with the flattened fifth pushed in between the fourth and fifth.',
  },
  {
    id: 'chromatic',
    name: 'Chromatic',
    steps: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    degrees: ['1', '♯1', '2', '♯2', '3', '4', '♯4', '5', '♯5', '6', '♯6', '7'],
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
export function spellScaleFrom(root: Pitch, type: ScaleType): SpelledScale | null {
  const offsets = scaleOffsets(type)
  const notes: Pitch[] = []

  for (let i = 0; i < offsets.length; i++) {
    const letter = (root.letter + degreeNumber(type.degrees[i]!) - 1) % 7
    const accidental = accidentalFor(letter, normalisePitchClass(root.pitchClass + offsets[i]!))
    if (accidental === null) return null
    notes.push(makePitch(letter, accidental))
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
    const weight = (scale: SpelledScale) =>
      scale.notes.reduce((total, note) => total + Math.abs(note.accidental), 0)
    const byWeight = weight(a) - weight(b)
    if (byWeight !== 0) return byWeight
    // A tie means both spellings are in real use — F♯ major and G♭ major are
    // six of one. Prefer the simpler root, then sharps, which is the side
    // convention lands on for the one pitch class where this comes up.
    const byRoot = Math.abs(a.root.accidental) - Math.abs(b.root.accidental)
    if (byRoot !== 0) return byRoot
    return b.root.accidental - a.root.accidental
  })[0]!
}
