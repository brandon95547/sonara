import { isBlackKey } from '../midi/notes.js'

/**
 * Recommended scale fingering.
 *
 * ## This is advice, not measurement
 *
 * A MIDI keyboard reports which note was played and how hard. It does not, and
 * cannot, report which finger played it. Everything here is therefore a
 * *recommendation* — what a teacher would suggest — and the UI says so. Sonara
 * never claims to know what your hands did.
 *
 * ## Where the numbers come from
 *
 * Major and natural minor carry the fingerings method books teach, one octave
 * at a time. Every other scale type is derived from the two rules those
 * fingerings themselves follow:
 *
 *   1. The thumb does not play a black key.
 *   2. The hand moves in groups of three or four, so the thumb passes under
 *      (or the hand crosses over) once or twice per octave.
 *
 * A derived fingering is marked as such, because "this is the standard" and
 * "this is a reasonable suggestion" are different claims.
 */

export type Hand = 'right' | 'left'

export interface Fingering {
  /** One finger per note. 1 is the thumb, 5 the little finger. */
  readonly fingers: readonly number[]
  readonly source: 'standard' | 'derived'
  /**
   * Indices where the thumb passes under the hand (right, ascending) or the
   * hand crosses over the thumb (left, ascending). The moment a scale is won
   * or lost, and worth calling out at the moment it arrives.
   */
  readonly crossings: readonly number[]
}

/** One octave, root to octave inclusive — eight notes for a seven-note scale. */
type OctavePattern = readonly number[]

const f = (digits: string): OctavePattern => [...digits].map(Number)

/**
 * The standard one-octave fingerings.
 *
 * Keyed by the spelling the app itself produces for that root, so a lookup can
 * never miss because the table said `G♭` and the speller said `F♯`.
 */
const STANDARD: Record<string, { right: OctavePattern; left: OctavePattern }> = {
  // --- Major ---------------------------------------------------------------
  'major:C': { right: f('12312345'), left: f('54321321') },
  'major:G': { right: f('12312345'), left: f('54321321') },
  'major:D': { right: f('12312345'), left: f('54321321') },
  'major:A': { right: f('12312345'), left: f('54321321') },
  'major:E': { right: f('12312345'), left: f('54321321') },
  'major:B': { right: f('12312345'), left: f('43214321') },
  'major:F♯': { right: f('23412312'), left: f('43213214') },
  'major:D♭': { right: f('23123412'), left: f('32143213') },
  'major:A♭': { right: f('34123123'), left: f('32143213') },
  'major:E♭': { right: f('31234123'), left: f('32143213') },
  'major:B♭': { right: f('41231234'), left: f('32143213') },
  'major:F': { right: f('12341234'), left: f('54321321') },

  // --- Natural minor -------------------------------------------------------
  'natural-minor:A': { right: f('12312345'), left: f('54321321') },
  'natural-minor:E': { right: f('12312345'), left: f('54321321') },
  'natural-minor:B': { right: f('12312345'), left: f('43214321') },
  'natural-minor:F♯': { right: f('34123123'), left: f('43213214') },
  'natural-minor:C♯': { right: f('34123123'), left: f('32143213') },
  'natural-minor:G♯': { right: f('34123123'), left: f('32132143') },
  'natural-minor:E♭': { right: f('31234123'), left: f('32143213') },
  'natural-minor:B♭': { right: f('41231234'), left: f('32143213') },
  'natural-minor:F': { right: f('12341234'), left: f('54321321') },
  'natural-minor:C': { right: f('12312345'), left: f('54321321') },
  'natural-minor:G': { right: f('12312345'), left: f('54321321') },
  'natural-minor:D': { right: f('12312345'), left: f('54321321') },
}

/**
 * Extends a one-octave pattern across several octaves.
 *
 * The two hands extend differently, and it is not a detail. The right hand's 5
 * is a *terminal* finger — it appears only on the very last note — so the first
 * seven fingers repeat and the 5 is appended once. The left hand's 5 is an
 * *initial* finger, on the very first note, so it is placed once and the
 * remaining seven repeat. Extending either one the other way puts the little
 * finger in the middle of the scale, which is unplayable.
 */
function extend(pattern: OctavePattern, octaves: number, hand: Hand): number[] {
  const body = hand === 'right' ? pattern.slice(0, -1) : pattern.slice(1)
  const fingers: number[] = hand === 'right' ? [] : [pattern[0]!]
  for (let octave = 0; octave < octaves; octave++) fingers.push(...body)
  if (hand === 'right') fingers.push(pattern.at(-1)!)
  return fingers
}

/**
 * Derives a fingering for a scale with no standard entry.
 *
 * Walks the notes placing the thumb every three or four notes, never on a black
 * key, and fills the gaps with consecutive fingers. It reproduces the taught
 * fingering for the white-key scales and produces something playable for the
 * rest; it is not claimed to be more than that.
 */
function derive(notes: readonly number[], hand: Hand): number[] {
  if (hand === 'left') {
    // The left hand ascending is the right hand's shape read backwards: the
    // thumb still lands on white keys, but the fingers count down towards it.
    return derive([...notes].reverse(), 'right').reverse()
  }

  const fingers: number[] = []
  let finger = 1
  let sinceThumb = 0

  for (let i = 0; i < notes.length; i++) {
    const remaining = notes.length - i
    const wantsThumb =
      i === 0 ? !isBlackKey(notes[i]!) : sinceThumb >= 3 && !isBlackKey(notes[i]!) && remaining > 1

    if (wantsThumb) {
      finger = 1
      sinceThumb = 0
    } else if (i > 0) {
      // Five is the little finger; it has nowhere to go after itself, so the
      // hand has to have crossed before reaching it mid-scale.
      finger = Math.min(finger + 1, 5)
      sinceThumb++
    } else {
      // A scale starting on a black key cannot start on the thumb. Beginning on
      // the fourth finger leaves room for the thumb on the next white key,
      // which is the convention every black-key scale follows.
      finger = 4
      sinceThumb = 3
    }
    fingers.push(finger)
  }

  return fingers
}

export interface FingeringRequest {
  /** The app's own spelling of the root, e.g. `E♭`. */
  readonly rootName: string
  readonly scaleTypeId: string
  readonly hand: Hand
  readonly octaves: number
  /** The actual notes, used when no standard pattern exists. */
  readonly notes: readonly number[]
}

export function scaleFingering(request: FingeringRequest): Fingering {
  const standard = STANDARD[`${request.scaleTypeId}:${request.rootName}`]
  const fingers = standard
    ? extend(standard[request.hand], request.octaves, request.hand)
    : derive(request.notes, request.hand)

  return {
    fingers,
    source: standard ? 'standard' : 'derived',
    crossings: findCrossings(fingers, request.hand),
  }
}

/**
 * The indices where the hand has to move rather than just press.
 *
 * Right hand ascending: the thumb passing under, which shows up as a drop back
 * to 1. Left hand ascending: the hand crossing over the thumb, which shows up
 * as a jump up from 1. Both are the same event seen from opposite sides.
 */
function findCrossings(fingers: readonly number[], hand: Hand): number[] {
  const crossings: number[] = []
  for (let i = 1; i < fingers.length; i++) {
    const previous = fingers[i - 1]!
    const current = fingers[i]!
    if (hand === 'right' ? current === 1 && previous > 1 : previous === 1 && current > 1) {
      crossings.push(i)
    }
  }
  return crossings
}

export const FINGER_NAMES: Record<number, string> = {
  1: 'Thumb',
  2: 'Index',
  3: 'Middle',
  4: 'Ring',
  5: 'Little',
}
