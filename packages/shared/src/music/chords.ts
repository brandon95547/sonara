import type { Pitch } from './pitch.js'
import { findScaleType, SCALE_TYPES, spellScale, type SpelledScale } from './scales.js'
import { degreeNames } from './theory.js'

/**
 * The chords of a key, as a scale book teaches them.
 *
 * Not a chord dictionary. Under each key the book prints the same few things:
 * the tonic triad, the same triad with its octave added ("four note form"),
 * and one seventh chord — the dominant seventh in a major key, the diminished
 * seventh in a minor one. Each is played in every position, solid and broken,
 * and then run up the keyboard as an arpeggio.
 *
 * Pure data, like `scales.ts`: which notes, how they are spelled. Nothing here
 * knows about fingers.
 */

export const KEY_MODES = ['major', 'minor'] as const
export type KeyMode = (typeof KEY_MODES)[number]

export const KEY_MODE_LABELS: Record<KeyMode, string> = { major: 'Major', minor: 'Minor' }

export const CHORD_KINDS = ['triad', 'four-note', 'seventh'] as const
export type ChordKind = (typeof CHORD_KINDS)[number]

/**
 * The scale a key's chords are taken from.
 *
 * A minor key's chords come from its harmonic form: that is where the raised
 * seventh is, and the raised seventh is the note the diminished seventh chord
 * is built on.
 */
const KEY_SCALE: Record<KeyMode, string> = { major: 'major', minor: 'harmonic-minor' }

export type ChordQuality = 'major' | 'minor' | 'dominant-seventh' | 'diminished-seventh'

export interface KeyChord {
  /** The key the chord belongs to, spelled. */
  readonly key: SpelledScale
  readonly mode: KeyMode
  readonly kind: ChordKind
  readonly quality: ChordQuality
  /** The chord's own notes, root first, spelled as the key spells them. */
  readonly tones: readonly Pitch[]
  /** `C`, `Am`, `G7`, `G♯°7`. */
  readonly symbol: string
  /** `Major Triad`, `Dominant Seventh`. */
  readonly qualityName: string
}

/** Scale degrees, 0 at the tonic, that make each chord. */
const TRIAD = [0, 2, 4] as const
/** The dominant seventh: the fifth degree and every other note above it. */
const DOMINANT_SEVENTH = [4, 6, 1, 3] as const
/** The diminished seventh: the same, from the raised seventh. */
const DIMINISHED_SEVENTH = [6, 1, 3, 5] as const

export function keyChord(
  pitchClass: number,
  mode: KeyMode,
  kind: ChordKind,
  tonic?: string,
): KeyChord {
  const type = findScaleType(KEY_SCALE[mode]) ?? SCALE_TYPES[0]!
  const key = spellScale(pitchClass, type, tonic)
  const seventh = kind === 'seventh'
  const degrees = !seventh ? TRIAD : mode === 'major' ? DOMINANT_SEVENTH : DIMINISHED_SEVENTH
  const tones = degrees.map((degree) => key.notes[degree]!)
  const root = tones[0]!.name

  const quality: ChordQuality = !seventh
    ? mode
    : mode === 'major'
      ? 'dominant-seventh'
      : 'diminished-seventh'

  return {
    key,
    mode,
    kind,
    quality,
    tones,
    symbol:
      quality === 'major'
        ? root
        : quality === 'minor'
          ? `${root}m`
          : quality === 'dominant-seventh'
            ? `${root}7`
            : `${root}°7`,
    qualityName: {
      major: 'Major Triad',
      minor: 'Minor Triad',
      'dominant-seventh': 'Dominant Seventh',
      'diminished-seventh': 'Diminished Seventh',
    }[quality],
  }
}

/**
 * The triads of a key: one on every degree of its scale.
 *
 * The other thing a key's page prints, beside the tonic chord in its positions:
 * the chord each note of the scale carries when the two notes a third and a
 * fifth above it are taken from the same scale. Which of them come out major,
 * minor, diminished or augmented is the key's whole harmony in one row —
 * I ii iii IV V vi vii° in major, i ii° III+ iv V VI vii° in minor.
 */
export type TriadQuality = 'major' | 'minor' | 'diminished' | 'augmented'

export interface DegreeTriad {
  /** The degree it is built on, 0 at the tonic. */
  readonly degree: number
  /** Root, third, fifth, spelled as the key spells them. */
  readonly tones: readonly Pitch[]
  readonly quality: TriadQuality
  /** `C`, `Dm`, `Bdim`, `Caug` — the names a chord chart uses. */
  readonly symbol: string
  /** `IV`, `ii`, `vii°`, `III+`: capitals for a major third, a sign for an altered fifth. */
  readonly numeral: string
  /** `Subdominant`. */
  readonly degreeName: string
  /** One of the three the key is built on: the tonic, subdominant and dominant. */
  readonly primary: boolean
}

export interface KeyTriads {
  readonly key: SpelledScale
  readonly mode: KeyMode
  readonly triads: readonly DegreeTriad[]
}

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'] as const
const TRIAD_QUALITIES: Readonly<Record<string, TriadQuality>> = {
  '4,7': 'major',
  '3,7': 'minor',
  '3,6': 'diminished',
  '4,8': 'augmented',
}
const QUALITY_SUFFIX: Record<TriadQuality, string> = {
  major: '',
  minor: 'm',
  diminished: 'dim',
  augmented: 'aug',
}
const QUALITY_SIGN: Record<TriadQuality, string> = {
  major: '',
  minor: '',
  diminished: '°',
  augmented: '+',
}
/** The primary triads: on the first, fourth and fifth degrees. */
const PRIMARY_DEGREES: readonly number[] = [0, 3, 4]

export function keyTriads(pitchClass: number, mode: KeyMode, tonic?: string): KeyTriads {
  const type = findScaleType(KEY_SCALE[mode]) ?? SCALE_TYPES[0]!
  const key = spellScale(pitchClass, type, tonic)
  const names = degreeNames(type)

  const triads = key.notes.map((root, degree): DegreeTriad => {
    const tones = TRIAD.map((step) => key.notes[(degree + step) % 7]!)
    const above = (tone: Pitch) => (tone.pitchClass - root.pitchClass + 12) % 12
    const quality = TRIAD_QUALITIES[`${above(tones[1]!)},${above(tones[2]!)}`] ?? 'major'
    const upper = quality === 'major' || quality === 'augmented'
    const numeral = NUMERALS[degree]!
    return {
      degree,
      tones,
      quality,
      symbol: `${root.name}${QUALITY_SUFFIX[quality]}`,
      numeral: `${upper ? numeral : numeral.toLowerCase()}${QUALITY_SIGN[quality]}`,
      degreeName: names[degree] ?? '',
      primary: PRIMARY_DEGREES.includes(degree),
    }
  })

  return { key, mode, triads }
}

/**
 * The chord's notes laid up the keyboard from `rootNote`: index 0 is the root,
 * 1 the next chord note above it, and so on through the octaves.
 *
 * Every position, broken chord and arpeggio is a run of consecutive entries.
 */
export function chordLadder(tones: readonly Pitch[], rootNote: number) {
  const root = tones[0]!.pitchClass
  const offsets = tones.map((tone) => (tone.pitchClass - root + 12) % 12)
  const size = tones.length
  return (index: number) => ({
    note: rootNote + Math.floor(index / size) * 12 + offsets[((index % size) + size) % size]!,
    tone: ((index % size) + size) % size,
  })
}

const POSITION_NAMES = ['Root position', '1st inversion', '2nd inversion', '3rd inversion'] as const

/**
 * What a position is called. A triad has three, so the fourth one a chord line
 * prints — the root position again, an octave up — is the root position.
 */
export function chordPositionName(toneCount: number, position: number): string {
  return POSITION_NAMES[((position % toneCount) + toneCount) % toneCount] ?? POSITION_NAMES[0]
}
