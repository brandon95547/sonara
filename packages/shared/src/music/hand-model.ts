import { isBlackKey } from '../midi/notes.js'
import type { Hand } from './fingering.js'

/**
 * What a hand finds difficult.
 *
 * The scale tables in `fingering.ts` answer "how is this scale fingered". They
 * cannot answer "how is this passage fingered", because a passage is not a
 * scale and no book prints one. What is needed instead is a way to score any
 * fingering of any sequence of notes, so that candidates can be compared —
 * and that is what this is.
 *
 * The model is the one published by Parncutt, Sloboda, Clarke, Raekallio and
 * Desain (An Ergonomic Model of Keyboard Fingering for Melodic Fragments,
 * *Music Perception* 14(4), 1997). Twelve rules, each a specific source of
 * physical difficulty, each contributing points; the least-points fingering is
 * the prediction. It was tested against fingerings pianists wrote on Czerny
 * studies, and most of what they chose came out among its cheapest.
 *
 * Implemented from the paper's own specification rather than invented here.
 * The weights are its weights and the span table is its Table 1 — none of it is
 * tuned to taste, because the whole value of the thing is that somebody
 * measured it.
 *
 * ## What it does not cover
 *
 * Melodic fragments: one note at a time, one hand. Chords are out of scope, and
 * so is anything musical — phrasing, articulation, what the other hand is
 * doing. It is a model of the hand, not of the music.
 */

export type Finger = 1 | 2 | 3 | 4 | 5
export const FINGERS: readonly Finger[] = [1, 2, 3, 4, 5]

/**
 * Right-hand spans in semitones, indexed [f][g] for a move from finger f to
 * finger g. Rows and columns are fingers 1-5; the leading diagonal is zero
 * because the model does not reuse a finger between notes.
 *
 * A positive number is a rising interval, a negative one falling. Below the
 * diagonal a positive number means the fingers cross — MaxPrac(2,1) = 5 says
 * finger 2 can pass up to 5 semitones over the thumb.
 */
const MAX_PRAC = [
  [0, 10, 12, 14, 15],
  [5, 0, 5, 7, 10],
  [4, -1, 0, 4, 7],
  [3, -1, -1, 0, 5],
  [1, -2, -1, -1, 0],
] as const

const MAX_COMF = [
  [0, 8, 10, 12, 13],
  [3, 0, 3, 5, 8],
  [2, -1, 0, 2, 5],
  [1, -1, -1, 0, 3],
  [-1, -2, -1, -1, 0],
] as const

const MAX_REL = [
  [0, 5, 7, 9, 10],
  [-1, 0, 2, 4, 6],
  [-3, -1, 0, 2, 4],
  [-5, -3, -1, 0, 2],
  [-7, -5, -3, -1, 0],
] as const

/**
 * The minimum spans are the maximums reflected about the diagonal and negated,
 * which is the paper's own definition: `MinX(f, g) = -MaxX(g, f)`. Storing one
 * set and deriving the other keeps them from drifting apart.
 */
const at = (table: readonly (readonly number[])[], f: Finger, g: Finger) => table[f - 1]![g - 1]!
const maxPrac = (f: Finger, g: Finger) => at(MAX_PRAC, f, g)
const maxComf = (f: Finger, g: Finger) => at(MAX_COMF, f, g)
const maxRel = (f: Finger, g: Finger) => at(MAX_REL, f, g)
const minPrac = (f: Finger, g: Finger) => -at(MAX_PRAC, g, f)
const minComf = (f: Finger, g: Finger) => -at(MAX_COMF, g, f)
const minRel = (f: Finger, g: Finger) => -at(MAX_REL, g, f)

/**
 * The table is written for the right hand. The left is its mirror, so every
 * interval is read upside down before the table sees it — the paper gives this
 * as one of two equivalent adaptations, and it is the one that needs no second
 * copy of the numbers.
 */
const asRightHand = (interval: number, hand: Hand) => (hand === 'right' ? interval : -interval)

/** Whether a pair of fingers can reach an interval at all. */
export function reachable(f: Finger, g: Finger, interval: number, hand: Hand): boolean {
  if (f === g) return false // the model does not step from a note to the next with one finger
  const i = asRightHand(interval, hand)
  return i >= minPrac(f, g) && i <= maxPrac(f, g)
}

export interface RuleTally {
  [rule: string]: number
}

const add = (tally: RuleTally | undefined, rule: string, points: number) => {
  if (tally && points !== 0) tally[rule] = (tally[rule] ?? 0) + points
  return points
}

/**
 * The rules that need only one note and the finger on it.
 *
 * Rule 10 has a flat point for the thumb on a black key however it is
 * approached, on top of the two points each for a white neighbour either side —
 * those two belong with the neighbours and are charged in `pairCost`.
 */
export function noteCost(note: number, finger: Finger, tally?: RuleTally): number {
  let points = 0
  // 6. Weak-Finger: 1 point every time finger 4 or 5 is used.
  points += add(tally, 'weak-finger', finger >= 4 ? 1 : 0)
  // 10. Thumb-on-Black, the part that does not depend on the neighbours.
  if (finger === 1 && isBlackKey(note)) points += add(tally, 'thumb-on-black', 1)
  return points
}

/**
 * Everything decided by two consecutive notes.
 *
 * Rules 1-3 are the span rules, stated in the paper's appendix in the general
 * form used here — one formulation covering rising and falling intervals and
 * thumb passing alike. Rules 8, 9 and 12 are transitions. Rules 10 and 11 are
 * about a note's neighbours, so half of each lands here and half on the note's
 * other side.
 */
export function pairCost(
  noteA: number,
  noteB: number,
  f: Finger,
  g: Finger,
  hand: Hand,
  tally?: RuleTally,
): number {
  const i = asRightHand(noteB - noteA, hand)
  const thumbInvolved = f === 1 || g === 1
  let points = 0

  // 1. Stretch: 2 points per semitone outside the comfortable span.
  if (i > maxComf(f, g)) points += add(tally, 'stretch', 2 * (i - maxComf(f, g)))
  if (i < minComf(f, g)) points += add(tally, 'stretch', 2 * (minComf(f, g) - i))

  // 2. Small-Span and 3. Large-Span: 1 point per semitone outside the relaxed
  // span with the thumb involved, 2 without — the thumb moves sideways, the
  // other fingers do not.
  const weight = thumbInvolved ? 1 : 2
  if (i < minRel(f, g)) points += add(tally, 'small-span', weight * (minRel(f, g) - i))
  if (i > maxRel(f, g)) points += add(tally, 'large-span', weight * (i - maxRel(f, g)))

  // 8. Three-to-Four: raising the fourth finger while the third is down.
  if (f === 3 && g === 4) points += add(tally, 'three-to-four', 1)

  // 9. Four-on-Black: 3 and 4 consecutively, either order, 3 on white and 4 on
  // black.
  const blackA = isBlackKey(noteA)
  const blackB = isBlackKey(noteB)
  if ((f === 3 && g === 4 && !blackA && blackB) || (f === 4 && g === 3 && blackA && !blackB)) {
    points += add(tally, 'four-on-black', 1)
  }

  // 10 and 11, the half that looks backwards: a thumb or little finger on a
  // black key is only awkward because of the white keys either side of it.
  if (g === 1 && blackB && !blackA) points += add(tally, 'thumb-on-black', 2)
  if (g === 5 && blackB && !blackA) points += add(tally, 'five-on-black', 2)
  // ...and the half that looks forwards, for the note just left behind.
  if (f === 1 && blackA && !blackB) points += add(tally, 'thumb-on-black', 2)
  if (f === 5 && blackA && !blackB) points += add(tally, 'five-on-black', 2)

  // 12. Thumb-Passing: crossing on one level, or worse, up onto a black key.
  const crossing = (f === 1 && g !== 1 && i < 0) || (g === 1 && f !== 1 && i > 0)
  if (crossing) {
    const lowerIsWhite = i > 0 ? !blackA : !blackB
    const upperIsBlack = i > 0 ? blackB : blackA
    const thumbOnUpper = i > 0 ? g === 1 : f === 1
    points += add(tally, 'thumb-passing', lowerIsWhite && upperIsBlack && thumbOnUpper ? 3 : 1)
  }

  return points
}

/**
 * Everything decided by three consecutive notes.
 *
 * Rules 4 and 5 are about changes of hand position, which only exist once there
 * is a note before and a note after. Rule 7 is about runs on the weak side of
 * the hand.
 */
export function tripleCost(
  noteA: number,
  noteB: number,
  noteC: number,
  f: Finger,
  g: Finger,
  h: Finger,
  hand: Hand,
  tally?: RuleTally,
): number {
  let points = 0
  const outer = asRightHand(noteC - noteA, hand)

  // 4. Position-Change-Count and 5. Position-Change-Size. A change of position
  // is when the outer two notes of a group of three lie outside what the
  // fingers taking them can comfortably span.
  const beyondComfort = outer > maxComf(f, h) || outer < minComf(f, h)
  if (beyondComfort) {
    // A full change is the thumb in the middle, the middle note between the
    // outer two in pitch, and the outer interval past what is practical.
    const middleBetween = (noteB > noteA && noteB < noteC) || (noteB < noteA && noteB > noteC)
    const full = g === 1 && middleBetween && (outer > maxPrac(f, h) || outer < minPrac(f, h))
    points += add(tally, 'position-change-count', full ? 2 : 1)

    if (outer > maxComf(f, h)) points += add(tally, 'position-change-size', outer - maxComf(f, h))
    if (outer < minComf(f, h)) points += add(tally, 'position-change-size', minComf(f, h) - outer)
  }

  // 7. Three-Four-Five: 3, 4 and 5 consecutively in any order.
  const weakSide = [f, g, h].every((finger) => finger >= 3)
  if (weakSide && new Set([f, g, h]).size === 3) points += add(tally, 'three-four-five', 1)

  return points
}

// --- Chords ------------------------------------------------------------------

/**
 * Whether a hand can hold these notes at once with these fingers.
 *
 * The span table is a table of how far apart two fingers can sit, which is the
 * same question whether the notes are struck one after another or together — so
 * the chord case needs no new numbers, only every pair checked rather than the
 * consecutive ones. Checking every pair matters: 1-2 and 2-3 can each be
 * comfortable while 1-3 is impossible.
 */
export function holdable(
  pitches: readonly number[],
  assignment: readonly Finger[],
  hand: Hand,
): boolean {
  return reach(pitches, assignment, hand) === 'held'
}

/**
 * Whether a grip is held, rolled, or out of the question.
 *
 * A chord wider than the hand is not unfingerable — it is rolled, and a printed
 * edition fingers it exactly as if it were held, because the fingers still go
 * where they go. What separates a rollable chord from an impossible one is
 * where the excess sits: a bass note a tenth below a grip the hand *can* hold
 * is ordinary piano writing, while a chord whose inner notes are themselves
 * out of reach is not playable by one hand at all.
 *
 * So every pair is checked except the outermost, and the outermost only has to
 * be in the same direction rather than within reach.
 */
export function reach(
  pitches: readonly number[],
  assignment: readonly Finger[],
  hand: Hand,
): 'held' | 'rolled' | 'no' {
  if (pitches.length !== assignment.length) return 'no'

  // The note the little finger takes: the lowest in the left hand, the highest
  // in the right. It is the one a wide chord is rolled from.
  const outer = hand === 'left' ? 0 : pitches.length - 1
  let rolled = false

  for (let i = 0; i < pitches.length; i++) {
    for (let j = i + 1; j < pitches.length; j++) {
      const f = assignment[i]!
      const g = assignment[j]!
      if (f === g) return 'no' // one finger cannot be on two keys
      const span = asRightHand(pitches[j]! - pitches[i]!, hand)
      if (span >= minPrac(f, g) && span <= maxPrac(f, g)) continue
      // A pair involving the outer note may be rolled: the hand strikes it and
      // travels to the rest, which is ordinary piano writing and what a printed
      // edition fingers without comment. The rest of the grip has to hold on
      // its own — a chord whose *inner* notes are out of reach is not a roll,
      // it is two hands.
      if ((i === outer || j === outer) && pitches.length > 2) {
        rolled = true
        continue
      }
      return 'no'
    }
  }
  return rolled ? 'rolled' : 'held'
}

/**
 * How hard a chord is to hold.
 *
 * The span rules only — stretch, small and large — applied to every pair of
 * fingers in the grip, plus what each finger costs on its own key. The
 * transition rules have no meaning here: nothing passes under anything in a
 * chord struck as one.
 */
export function chordCost(
  pitches: readonly number[],
  assignment: readonly Finger[],
  hand: Hand,
  tally?: RuleTally,
): number {
  let points = 0
  for (const [i, finger] of assignment.entries()) points += noteCost(pitches[i]!, finger, tally)

  for (let i = 0; i < pitches.length; i++) {
    for (let j = i + 1; j < pitches.length; j++) {
      const f = assignment[i]!
      const g = assignment[j]!
      const span = asRightHand(pitches[j]! - pitches[i]!, hand)
      const thumb = f === 1 || g === 1
      if (span > maxComf(f, g)) points += add(tally, 'stretch', 2 * (span - maxComf(f, g)))
      if (span < minComf(f, g)) points += add(tally, 'stretch', 2 * (minComf(f, g) - span))
      const weight = thumb ? 1 : 2
      if (span > maxRel(f, g)) points += add(tally, 'large-span', weight * (span - maxRel(f, g)))
      if (span < minRel(f, g)) points += add(tally, 'small-span', weight * (minRel(f, g) - span))
    }
  }
  return points
}

/**
 * What it costs to get from one grip to the next.
 *
 * The published model stops at melodic fragments and says nothing about moving
 * between chords, so this does not pretend to be it: it is a measure of hand
 * movement, which is what Section 7 of the fingering reference shows the method
 * books' own cadences are choosing between. A finger used in both grips pays
 * for the distance it travels; a finger that has to be found or let go pays a
 * flat point for re-forming the hand.
 */
/**
 * Changing a finger on a note that is in both grips.
 *
 * Small, and measured rather than assumed. The obvious reasoning says this
 * should be expensive — the note is already down and the hand has to swap under
 * it — but checked against the cadences the source prints, a heavy penalty
 * makes the match markedly worse: 39 chords of 68 at four points against 44 at
 * one. The books re-grip a held note freely and deliberately, moving the whole
 * hand down a finger between chords, which is a thing a penalty here fights.
 */
const SUBSTITUTION = 1

export function moveCost(
  from: readonly number[],
  fromFingers: readonly Finger[],
  to: readonly number[],
  toFingers: readonly Finger[],
): number {
  const byFinger = (notes: readonly number[], fingers: readonly Finger[]) => {
    const map = new Map<Finger, number>()
    fingers.forEach((finger, i) => map.set(finger, notes[i]!))
    return map
  }
  const byNote = (notes: readonly number[], fingers: readonly Finger[]) => {
    const map = new Map<number, Finger>()
    fingers.forEach((finger, i) => map.set(notes[i]!, finger))
    return map
  }
  const before = byFinger(from, fromFingers)
  const after = byFinger(to, toFingers)

  let points = 0

  // A note common to both grips should keep its finger. This is what makes a
  // progression hold together rather than being re-gripped chord by chord, and
  // it is the thing the method books' cadences are visibly doing: the tonic
  // stays under one finger while everything around it moves.
  const heldBefore = byNote(from, fromFingers)
  for (const [note, finger] of byNote(to, toFingers)) {
    const was = heldBefore.get(note)
    if (was !== undefined && was !== finger) points += SUBSTITUTION
  }

  // What each finger that survives the change has to travel, and the cost of
  // finding or letting go of the ones that do not.
  for (const [finger, note] of after) {
    const was = before.get(finger)
    if (was === undefined) points += 1
    else points += Math.abs(note - was) / 2
  }
  for (const finger of before.keys()) if (!after.has(finger)) points += 1

  return points
}
