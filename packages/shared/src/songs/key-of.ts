import { normalisePitchClass } from '../music/pitch.js'

/**
 * What key a piece is in.
 *
 * Taken from the file when the file says — MusicXML always does, and a MIDI
 * file usually carries a key-signature meta event. When it does not, the key is
 * estimated from the notes, and said to be an estimate: a wrong key printed
 * confidently is worse than no key, because the player has no way to tell.
 */

export interface DetectedKey {
  /** Tonic pitch class. */
  readonly pitchClass: number
  readonly mode: 'major' | 'minor'
  /** How the key signature is written: -7 to 7, flats negative. */
  readonly fifths: number
  /** False when it was worked out from the notes rather than read from the file. */
  readonly declared: boolean
}

const SHARP_NAMES = ['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯']
const FLAT_NAMES = ['C', 'F', 'B♭', 'E♭', 'A♭', 'D♭', 'G♭', 'C♭']

/** The tonic of a major key with this many sharps (+) or flats (−). */
export function tonicForFifths(fifths: number, mode: 'major' | 'minor'): number {
  // Each sharp moves the major tonic up a fifth; each flat, down one.
  const major = normalisePitchClass(fifths * 7)
  return mode === 'major' ? major : normalisePitchClass(major + 9)
}

export function keyName(key: DetectedKey): string {
  const index = Math.abs(key.fifths)
  const table = key.fifths < 0 ? FLAT_NAMES : SHARP_NAMES
  const major = table[Math.min(index, 7)] ?? 'C'
  if (key.mode === 'major') return `${major} major`
  // The relative minor of a key signature, named from the same signature.
  const RELATIVE: Record<string, string> = {
    C: 'A',
    G: 'E',
    D: 'B',
    A: 'F♯',
    E: 'C♯',
    B: 'G♯',
    'F♯': 'D♯',
    'C♯': 'A♯',
    F: 'D',
    'B♭': 'G',
    'E♭': 'C',
    'A♭': 'F',
    'D♭': 'B♭',
    'G♭': 'E♭',
    'C♭': 'A♭',
  }
  return `${RELATIVE[major] ?? major} minor`
}

/**
 * Krumhansl-Kessler key profiles.
 *
 * Ratings of how well each scale degree fits a key, gathered from listeners
 * rather than invented. Correlating a piece's pitch-class histogram against all
 * twenty-four rotations is the standard way to guess a key from notes alone,
 * and it is right far more often than counting accidentals.
 */
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

function correlate(histogram: readonly number[], profile: readonly number[]): number {
  const meanH = histogram.reduce((a, b) => a + b, 0) / 12
  const meanP = profile.reduce((a, b) => a + b, 0) / 12
  let top = 0
  let leftSq = 0
  let rightSq = 0
  for (let index = 0; index < 12; index++) {
    const h = histogram[index]! - meanH
    const p = profile[index]! - meanP
    top += h * p
    leftSq += h * h
    rightSq += p * p
  }
  const bottom = Math.sqrt(leftSq * rightSq)
  return bottom === 0 ? 0 : top / bottom
}

/**
 * Estimates the key from the notes actually played.
 *
 * Weighted by how long each pitch sounds rather than how often it is struck: a
 * passing note hit four times says less about the key than a bass note held
 * through the bar.
 */
export function estimateKey(
  notes: readonly { note: number; durationMs: number }[],
): DetectedKey | null {
  if (notes.length === 0) return null

  const histogram = new Array(12).fill(0)
  for (const note of notes) histogram[normalisePitchClass(note.note)] += note.durationMs
  if (histogram.every((value) => value === 0)) return null

  let best: { score: number; pitchClass: number; mode: 'major' | 'minor' } | null = null
  for (let tonic = 0; tonic < 12; tonic++) {
    const rotated = histogram.map((_, index) => histogram[(index + tonic) % 12]!)
    for (const [mode, profile] of [
      ['major', MAJOR_PROFILE],
      ['minor', MINOR_PROFILE],
    ] as const) {
      const score = correlate(rotated, profile)
      if (!best || score > best.score) best = { score, pitchClass: tonic, mode }
    }
  }
  if (!best) return null

  return {
    pitchClass: best.pitchClass,
    mode: best.mode,
    fifths: fifthsForTonic(best.pitchClass, best.mode),
    declared: false,
  }
}

/**
 * The signature a key is written with.
 *
 * Several signatures can name the same sounding key — B major and C♭ major are
 * the same seven keys under the fingers — so the one with fewer accidentals
 * wins. Searching from -7 upwards and taking the first match returns C♭ every
 * time, which is a real key nobody writes.
 */
export function fifthsForTonic(pitchClass: number, mode: 'major' | 'minor'): number {
  const majorTonic = mode === 'major' ? pitchClass : normalisePitchClass(pitchClass + 3)
  let best = 0
  let fewest = Infinity
  for (let fifths = -7; fifths <= 7; fifths++) {
    if (normalisePitchClass(fifths * 7) !== majorTonic) continue
    if (Math.abs(fifths) < fewest) {
      fewest = Math.abs(fifths)
      best = fifths
    }
  }
  return best
}
