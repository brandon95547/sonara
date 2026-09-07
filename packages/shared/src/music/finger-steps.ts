import type { Hand } from './fingering.js'
import {
  FINGERS,
  chordCost,
  holdable,
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
 * The triad fingerings the method books print, by inversion.
 *
 * From The Complete Book of Scales, Chords, Arpeggios & Cadences, pages 8, 9,
 * 88 and 89 — consistent on every page that states them, and unchanged by
 * chord quality: page 88 runs major, minor, diminished and augmented triads on
 * the same root and fingers all four alike.
 *
 * These are needed because the hand model cannot separate them. `1 3 5` and
 * `1 2 4` cost a C major triad exactly the same — both are relaxed at every
 * pair, both use one weak finger — so without the published answer the choice
 * comes down to whichever was enumerated first. The point of consulting a book
 * is precisely the questions physics does not settle.
 */
const TRIADS: Record<string, { right: readonly Finger[]; left: readonly Finger[] }> = {
  // Keyed by the two intervals of a close-position triad, low to high.
  root: { right: [1, 3, 5], left: [5, 3, 1] },
  first: { right: [1, 2, 5], left: [5, 3, 1] },
  second: { right: [1, 3, 5], left: [5, 2, 1] },
}

/**
 * Which inversion a close-position triad is in, from its shape alone.
 *
 * A root position triad is a third then a third; a first inversion a third then
 * a fourth; a second inversion a fourth then a third. Nothing here needs to
 * know the key, or which note is the root — which is as well, because a MIDI
 * file does not say.
 */
function publishedTriad(pitches: readonly number[], hand: Hand): readonly Finger[] | null {
  if (pitches.length !== 3) return null
  const lower = pitches[1]! - pitches[0]!
  const upper = pitches[2]! - pitches[1]!
  const third = (n: number) => n === 3 || n === 4
  const fourth = (n: number) => n === 5

  const shape =
    third(lower) && third(upper)
      ? 'root'
      : third(lower) && fourth(upper)
        ? 'first'
        : fourth(lower) && third(upper)
          ? 'second'
          : null
  return shape ? TRIADS[shape]![hand] : null
}

interface Candidate {
  readonly fingers: readonly Finger[]
  readonly cost: number
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
      if (holdable(pitches, fingers, hand)) {
        const published = publishedTriad(pitches, hand)
        // Enough to settle what the spans leave open, and to carry a triad the
        // hand finds slightly tight — a diminished triad spans six semitones,
        // which costs 1 3 5 a small-span point the book pays without comment.
        // Not enough to override the passage: transition costs are added after
        // this, so a progression that wants a different grip still gets one,
        // which is what the book's own cadences do.
        const matches = published?.every((finger, i) => finger === fingers[i]) ?? false
        chosen.push({ fingers, cost: chordCost(pitches, fingers, hand) - (matches ? 2 : 0) })
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
): (readonly Finger[] | null)[] {
  const out: (readonly Finger[] | null)[] = steps.map(() => null)
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

/** Second order, because three consecutive single notes have rules of their own. */
function solve(
  steps: readonly (readonly number[])[],
  options: Candidate[][],
  start: number,
  end: number,
  hand: Hand,
  out: (readonly Finger[] | null)[],
): void {
  if (start === end) {
    out[start] = options[start]![0]!.fingers
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
    out[start + offset] = options[start + offset]![choice]!.fingers
  })
}
