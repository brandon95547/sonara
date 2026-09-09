import type { Hand } from './fingering.js'
import {
  FINGERS,
  chordCost,
  reach,
  moveCost,
  pairCost,
  reachable,
  tripleCost,
  type Finger,
} from './hand-model.js'

/**
 * Fingering a part that has chords in it as well as single notes.
 *
 * `fingerPassage` handles a melodic line, which is what the published model
 * covers. Real piano music is not that: a hand plays a note, then two, then
 * three, then one again. This searches the same way over *steps* — a step being
 * whatever sounds at once — so a part is fingered end to end instead of in the
 * fragments between its chords.
 *
 * Where every step is a single note this is the melodic model exactly, rule for
 * rule, which is what keeps the one part of this that was independently
 * validated from drifting.
 */

/** More than this and the search is not worth its own precision. */
const CANDIDATE_LIMIT = 6

/**
 * The chord fingerings the method books print, keyed by shape.
 *
 * A chord's shape is the intervals between its notes, low to high — nothing
 * else is needed. `(4, 3)` is a major triad in root position, `(3, 5)` a minor
 * triad in first inversion, `(6, 2)` the three-note dominant seventh a cadence
 * uses. The key does not appear, the root does not appear, and neither is
 * missed: page 88 runs major, minor, diminished and augmented triads on one
 * root and fingers all four alike.
 *
 * These exist because the hand model cannot reach them. `1 3 5` and `1 2 4`
 * cost a C major triad exactly the same — relaxed at every pair, one weak
 * finger each — so the spans leave the choice open and only a book settles it.
 *
 * Sources: pages 8, 9, 88 and 89 for the block triads, and the three cadence
 * positions of pages 21, 45 and 51 for the seventh voicings. Every entry here
 * is a shape the source fingers the *same way* every time it prints it. Shapes
 * it fingers differently in different places are deliberately absent — those
 * are decided by what surrounds them, which is the search's job and not a
 * table's.
 */
interface Shape {
  readonly right?: readonly Finger[]
  readonly left?: readonly Finger[]
  /**
   * Whether the source prints this shape the same way everywhere it appears.
   *
   * A firm shape settles the matter: the book's answer is taken even where the
   * hand model would rather have something else, which happens — the three-note
   * dominant seventh is fingered 1 2 4, and by span alone 1 2 5 is easier. The
   * book is fingering it for the chord it resolves to. That is the knowledge
   * being borrowed, and overruling it with a span table defeats the point.
   *
   * A soft shape is a default that context may move, and every left-hand shape
   * read from the cadences is one: not a single one is fingered the same way in
   * all three positions.
   */
  readonly firm?: boolean
}

const SHAPES: Record<string, Shape> = {
  // Triads, root position: a third then a third.
  '3,4': { right: [1, 3, 5], left: [5, 3, 1] },
  '4,3': { right: [1, 3, 5], left: [5, 3, 1] },
  '3,3': { right: [1, 3, 5], left: [5, 3, 1] },
  '4,4': { right: [1, 3, 5], left: [5, 3, 1] },
  // First inversion: a third then a fourth.
  '3,5': { right: [1, 2, 5], left: [5, 3, 1], firm: true },
  '4,5': { right: [1, 2, 5], left: [5, 3, 1], firm: true },
  // Second inversion: a fourth then a third.
  '5,3': { right: [1, 3, 5], left: [5, 2, 1] },
  '5,4': { right: [1, 3, 5], left: [5, 2, 1] },
  // Three-note dominant sevenths, from the cadences. The right hand is the
  // same in all three keys read; the left is not, so it is left to the search.
  //
  // Two of these are the shapes the source prints — D-F-B and B-F-G, in C. The
  // third is the remaining rotation of the same shell, F-G-B, which the source
  // never reaches because its cadence pages take that inversion with four notes.
  // It was keyed `2,3` for a long time, which is F-G-B♭ — a minor seventh, not
  // a dominant one, and a chord this comment does not describe.
  '3,6': { right: [1, 2, 4], firm: true },
  '6,2': { right: [1, 4, 5], firm: true },
  '2,4': { right: [1, 2, 4], firm: true },
}

/** How far a published shape outweighs what the spans alone would choose. */
const FIRM_SHAPE = 10
/** A chord too wide to put down at once, played from the outside in. */
const ROLL = 3
const DEFAULT_SHAPE = 2

function publishedShape(
  pitches: readonly number[],
  hand: Hand,
): { fingers: readonly Finger[]; firm: boolean } | null {
  if (pitches.length < 2) return null
  const intervals: number[] = []
  for (let i = 1; i < pitches.length; i++) intervals.push(pitches[i]! - pitches[i - 1]!)
  const shape = SHAPES[intervals.join(',')]
  const fingers = shape?.[hand]
  return fingers ? { fingers, firm: shape!.firm ?? false } : null
}

interface Candidate {
  readonly fingers: readonly Finger[]
  readonly cost: number
  readonly rolled: boolean
}

/**
 * How one step is played.
 *
 * `rolled` is not a detail of the search. A chord wider than the hand is
 * fingered exactly as a held one — the fingers still go where they go — and
 * the only thing that separates the two is whether they can arrive together.
 * That answer was being computed and thrown away, which left everything
 * downstream asking for a grip no hand can close.
 */
export interface StepFingering {
  readonly fingers: readonly Finger[]
  readonly rolled: boolean
}

/**
 * Every way the hand could hold one step, cheapest first.
 *
 * Fingers run in the same direction as pitch — ascending in the right hand,
 * descending in the left. A held chord cannot cross its own fingers, so the
 * assignment is a choice of *which* fingers, never of their order.
 */
function candidatesFor(pitches: readonly number[], hand: Hand): Candidate[] {
  if (pitches.length === 0 || pitches.length > 5) return []

  const chosen: Candidate[] = []
  const build = (sofar: Finger[], from: number) => {
    if (sofar.length === pitches.length) {
      const fingers = hand === 'right' ? sofar : [...sofar].reverse()
      const held = reach(pitches, fingers, hand)
      if (held !== 'no') {
        const published = publishedShape(pitches, hand)
        // Enough to settle what the spans leave open, and to carry a grip the
        // hand finds slightly tight — a diminished triad spans six semitones,
        // which costs 1 3 5 a small-span point the book pays without comment.
        // Not enough to override the passage: transition costs are added after
        // this, so a progression that wants a different grip still gets one,
        // which is what the source's own cadences do.
        const matches = published?.fingers?.every((finger, i) => finger === fingers[i]) ?? false
        const bonus = matches ? (published!.firm ? FIRM_SHAPE : DEFAULT_SHAPE) : 0
        // Rolling costs something — it is a chord you cannot simply put down —
        // but far less than not fingering it at all.
        const roll = held === 'rolled' ? ROLL : 0
        chosen.push({
          fingers,
          cost: chordCost(pitches, fingers, hand) - bonus + roll,
          rolled: held === 'rolled',
        })
      }
      return
    }
    for (let f = from; f <= 5; f++) build([...sofar, f as Finger], f + 1)
  }
  // Built ascending either way; reversed for the left hand, whose little finger
  // takes the lowest note.
  build([], 1)

  return chosen.sort((a, b) => a.cost - b.cost).slice(0, CANDIDATE_LIMIT)
}

const single = (step: readonly number[]) => step.length === 1

/**
 * What it costs to go from one step to the next.
 *
 * Two single notes are a melodic interval and are charged by the published
 * model. Anything involving a chord is charged as hand movement instead,
 * because the model does not cover it and guessing at an extension of it would
 * be worse than measuring the thing that plainly matters.
 */
function stepCost(
  from: readonly number[],
  fromFingers: readonly Finger[],
  to: readonly number[],
  toFingers: readonly Finger[],
  hand: Hand,
): number {
  if (single(from) && single(to)) {
    // A repeated note keeps its finger, which is the one place the same finger
    // twice is what everybody does.
    if (from[0] === to[0]) return fromFingers[0] === toFingers[0] ? 0 : Number.POSITIVE_INFINITY

    const interval = to[0]! - from[0]!
    if (reachable(fromFingers[0]!, toFingers[0]!, interval, hand)) {
      return pairCost(from[0]!, to[0]!, fromFingers[0]!, toFingers[0]!, hand)
    }
    // Not reachable by this pair. If no pair reaches it the hand has to jump,
    // which is legitimate and common — a leap is not an unfingerable passage,
    // it is a passage with a move in it. Any other unreachable pair is simply
    // wrong, and letting it through is how the thumb ended up on two notes.
    const anyPairReaches = FINGERS.some((f) => FINGERS.some((g) => reachable(f, g, interval, hand)))
    return anyPairReaches ? Number.POSITIVE_INFINITY : moveCost(from, fromFingers, to, toFingers)
  }
  return moveCost(from, fromFingers, to, toFingers)
}

/**
 * Fingers a run of steps, or returns null for it where nothing will hold.
 *
 * A step nothing can hold — six notes at once, or a span no hand covers — ends
 * the run rather than the search: what follows it is a fresh hand position and
 * has nothing to inherit.
 */
export function fingerSteps(
  steps: readonly (readonly number[])[],
  hand: Hand,
): (StepFingering | null)[] {
  const out: (StepFingering | null)[] = steps.map(() => null)
  const options = steps.map((step) => candidatesFor(step, hand))

  let start = 0
  while (start < steps.length) {
    if (options[start]!.length === 0) {
      start += 1
      continue
    }
    let end = start
    while (end + 1 < steps.length && options[end + 1]!.length > 0) end += 1
    solve(steps, options, start, end, hand, out)
    start = end + 1
  }
  return out
}

/** What survives the search: the grip, and whether the hand can close on it at once. */
const pick = (candidate: Candidate): StepFingering => ({
  fingers: candidate.fingers,
  rolled: candidate.rolled,
})

/** Second order, because three consecutive single notes have rules of their own. */
function solve(
  steps: readonly (readonly number[])[],
  options: Candidate[][],
  start: number,
  end: number,
  hand: Hand,
  out: (StepFingering | null)[],
): void {
  if (start === end) {
    out[start] = pick(options[start]![0]!)
    return
  }

  // best[a][b] — cheapest path with candidate a on the step before this one and
  // candidate b on this one.
  let best: number[][] = options[start]!.map((first) =>
    options[start + 1]!.map(
      (second) =>
        first.cost +
        second.cost +
        stepCost(steps[start]!, first.fingers, steps[start + 1]!, second.fingers, hand),
    ),
  )
  const back: number[][][] = []

  for (let i = start + 2; i <= end; i++) {
    const next = options[i - 1]!.map(() => options[i]!.map(() => Number.POSITIVE_INFINITY))
    const from = options[i - 1]!.map(() => options[i]!.map(() => -1))

    for (const [a, first] of options[i - 2]!.entries()) {
      for (const [b, second] of options[i - 1]!.entries()) {
        const reached = best[a]![b]!
        if (!Number.isFinite(reached)) continue
        for (const [c, third] of options[i]!.entries()) {
          let step =
            third.cost + stepCost(steps[i - 1]!, second.fingers, steps[i]!, third.fingers, hand)
          // The three-note rules apply only where all three really are notes.
          if (single(steps[i - 2]!) && single(steps[i - 1]!) && single(steps[i]!)) {
            step += tripleCost(
              steps[i - 2]![0]!,
              steps[i - 1]![0]!,
              steps[i]![0]!,
              first.fingers[0]!,
              second.fingers[0]!,
              third.fingers[0]!,
              hand,
            )
          }
          const total = reached + step
          if (total < next[b]![c]!) {
            next[b]![c] = total
            from[b]![c] = a
          }
        }
      }
    }
    back.push(from)
    best = next
  }

  let cheapest = Number.POSITIVE_INFINITY
  let last: [number, number] = [0, 0]
  for (const [a, row] of best.entries()) {
    for (const [b, cost] of row.entries()) {
      if (cost < cheapest) {
        cheapest = cost
        last = [a, b]
      }
    }
  }
  if (!Number.isFinite(cheapest)) return

  const path: number[] = [last[0], last[1]]
  let [a, b] = last
  for (let i = back.length - 1; i >= 0; i--) {
    const previous = back[i]![a]![b]!
    if (previous < 0) break
    path.unshift(previous)
    b = a
    a = previous
  }
  path.forEach((choice, offset) => {
    out[start + offset] = pick(options[start + offset]![choice]!)
  })
}
