import type { Hand } from './fingering.js'
import {
  FINGERS,
  noteCost,
  pairCost,
  reachable,
  tripleCost,
  type Finger,
  type RuleTally,
} from './hand-model.js'

/**
 * The cheapest way to play a run of notes, by the hand model.
 *
 * Every fingering of the passage is considered and the least difficult one
 * returned — not by enumerating them, which is 5^n, but by dynamic programming
 * over the two most recent fingers. Two is enough because no rule in the model
 * reaches further back than three notes.
 *
 * This is the piece the method books cannot supply. They finger scales,
 * arpeggios and cadences; a melody is none of those, and its fingering depends
 * on what comes next in a way no table can hold. Search over a cost model is
 * the shape of the answer, and `hand-model.ts` is where the costs come from.
 */

export interface PassageFingering {
  readonly fingers: readonly Finger[]
  /** Total difficulty in the model's points. Lower is easier. */
  readonly cost: number
  /** Points per rule, for working out why an answer came back the way it did. */
  readonly byRule: RuleTally
}

const EMPTY: PassageFingering = { fingers: [], cost: 0, byRule: {} }

/**
 * A repeated note is the one place the same finger twice is not only allowed
 * but usual. The model excludes it — it is about moving between notes — so it
 * is handled here rather than there.
 */
const repeated = (a: number, b: number) => a === b

export function fingerPassage(notes: readonly number[], hand: Hand): PassageFingering {
  const count = notes.length
  if (count === 0) return EMPTY
  if (count === 1) {
    const only = notes[0]!
    const finger = FINGERS.reduce((best, f) =>
      noteCost(only, f) < noteCost(only, best) ? f : best,
    )
    return {
      fingers: [finger],
      cost: noteCost(only, finger),
      byRule: explain(notes, [finger], hand),
    }
  }

  // best[a][b] — cheapest way to reach here with finger a on the previous note
  // and finger b on this one. Indices are fingers minus one.
  const size = 5
  let best: number[][] = Array.from({ length: size }, () => new Array<number>(size).fill(Infinity))
  const from: (number | null)[][][] = []

  for (const f of FINGERS) {
    for (const g of FINGERS) {
      if (!repeated(notes[0]!, notes[1]!) && !reachable(f, g, notes[1]! - notes[0]!, hand)) continue
      if (repeated(notes[0]!, notes[1]!) && f !== g) continue
      best[f - 1]![g - 1] =
        noteCost(notes[0]!, f) +
        noteCost(notes[1]!, g) +
        (repeated(notes[0]!, notes[1]!) ? 0 : pairCost(notes[0]!, notes[1]!, f, g, hand))
    }
  }

  for (let i = 2; i < count; i++) {
    const next: number[][] = Array.from({ length: size }, () =>
      new Array<number>(size).fill(Infinity),
    )
    const back: (number | null)[][] = Array.from({ length: size }, () =>
      new Array<number | null>(size).fill(null),
    )
    const isRepeat = repeated(notes[i - 1]!, notes[i]!)

    for (const f of FINGERS) {
      for (const g of FINGERS) {
        const reached = best[f - 1]![g - 1]!
        if (reached === Infinity) continue
        for (const h of FINGERS) {
          if (isRepeat ? h !== g : !reachable(g, h, notes[i]! - notes[i - 1]!, hand)) continue
          const step =
            noteCost(notes[i]!, h) +
            (isRepeat ? 0 : pairCost(notes[i - 1]!, notes[i]!, g, h, hand)) +
            tripleCost(notes[i - 2]!, notes[i - 1]!, notes[i]!, f, g, h, hand)
          const total = reached + step
          if (total < next[g - 1]![h - 1]!) {
            next[g - 1]![h - 1] = total
            back[g - 1]![h - 1] = f
          }
        }
      }
    }
    from.push(back)
    best = next
  }

  // Cheapest end state, then walk the predecessors back.
  let bestCost = Infinity
  let end: [Finger, Finger] = [1, 1]
  for (const f of FINGERS) {
    for (const g of FINGERS) {
      if (best[f - 1]![g - 1]! < bestCost) {
        bestCost = best[f - 1]![g - 1]!
        end = [f, g]
      }
    }
  }
  if (bestCost === Infinity) return EMPTY // nothing playable, e.g. a leap past MaxPrac

  const fingers: Finger[] = [end[0], end[1]]
  let [a, b] = end
  for (let i = from.length - 1; i >= 0; i--) {
    const previous = from[i]![a - 1]![b - 1]
    if (previous === null) break
    fingers.unshift(previous as Finger)
    b = a
    a = previous as Finger
  }

  return { fingers, cost: bestCost, byRule: explain(notes, fingers, hand) }
}

/** Re-runs the rules over a finished fingering to say where its points came from. */
export function explain(
  notes: readonly number[],
  fingers: readonly Finger[],
  hand: Hand,
): RuleTally {
  const tally: RuleTally = {}
  for (const [i, finger] of fingers.entries()) {
    noteCost(notes[i]!, finger, tally)
    if (i >= 1 && !repeated(notes[i - 1]!, notes[i]!)) {
      pairCost(notes[i - 1]!, notes[i]!, fingers[i - 1]!, finger, hand, tally)
    }
    if (i >= 2) {
      tripleCost(
        notes[i - 2]!,
        notes[i - 1]!,
        notes[i]!,
        fingers[i - 2]!,
        fingers[i - 1]!,
        finger,
        hand,
        tally,
      )
    }
  }
  return tally
}
