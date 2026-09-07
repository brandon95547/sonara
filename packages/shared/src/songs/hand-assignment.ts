import { gripCost } from '../music/hand-model.js'
import type { Hand } from '../music/fingering.js'

/**
 * Deciding which hand plays what, when the file does not say.
 *
 * A MusicXML score names the staff each note is on and a multi-track MIDI file
 * usually separates the hands, and where either does, this is not used. Where
 * neither does — a single-track MIDI, which is most of them — something has to
 * decide, and what was deciding was the pitch of each note taken on its own:
 * middle C or above went to the right hand, below it to the left.
 *
 * That is wrong in three ways at once, and one song shows all three. The
 * opening of *Lean On Me* is four first-inversion triads walking up, E3-G3-C4
 * to A3-C4-F4, and read note by note every one of them is torn in half at
 * middle C — two notes to the left hand, one to the right. Nobody plays a
 * close-position triad with two hands.
 *
 *   1. **A chord is one thing.** Notes that sound together and fit under one
 *      hand belong to one hand.
 *   2. **The seam is not fixed.** Music sits where it sits: a low passage has
 *      both hands under middle C and a high one has both above it.
 *   3. **A hand is somewhere.** Where it goes next depends on where it already
 *      is, not only on the notes in front of it.
 *
 * So the question is asked per chord rather than per note, and answered by
 * search: at each moment the choice is where to divide the notes between the
 * hands, and the cost is what the hands have to do to get there.
 */

/** Notes struck this close together are one chord, not a fast run. */
const CHORD_WINDOW_MS = 60

/**
 * After this long without playing, a hand has had time to go anywhere, so where
 * it was last stops constraining where it goes next.
 */
const REPOSITION_MS = 700

/**
 * Using both hands for notes one hand could have taken.
 *
 * What settles this is *where* the division falls. Hands divide at a gap, and a
 * gap means an octave with nothing in it — not a fourth, which is an ordinary
 * interval inside a chord and no place to put a seam. Below that the penalty
 * stands; at an octave or more it turns into a small preference for dividing,
 * because two lines that far apart with nothing between them are two voices as
 * often as they are one hand's octave.
 *
 * Any of this only applies where one hand could have taken the whole thing.
 * A chord wider than a hand divides because it must, and pays nothing for it.
 */
const SPLIT_PENALTY = 6
const WIDE_GAP = 12
const WIDE_GAP_BONUS = 2

/** How strongly each hand is drawn to its own side of the keyboard. */
const REGISTER_PULL = 0.25

/**
 * Bringing in a hand that was not playing a moment ago.
 *
 * Without this, handing a line to the other hand is free — an idle hand is
 * anywhere it likes, so it costs nothing to arrive, and the faintest register
 * preference is enough to make a passage change hands mid-phrase. The rising
 * triads that open *Lean On Me* did exactly that: two chords in the left hand,
 * then two in the right, because by the third the notes had drifted above
 * middle C.
 *
 * A line stays in the hand that is already playing it unless there is a real
 * reason to move, and the reason has to be worth more than this.
 */
const HAND_ENTRY = 3

/** Longer than this and the next note is a new phrase, not a continuation. */
const PHRASE_GAP_MS = 400

/** Where the seam sits when nothing else has an opinion. Middle C. */
const SEAM = 60

export interface HandStep {
  /** Pitches sounding together, ascending. */
  readonly notes: readonly number[]
  readonly startMs: number
  readonly endMs: number
}

/** Groups notes into the chords a player actually meets. */
export function handSteps<T extends { note: number; startMs: number; durationMs: number }>(
  notes: readonly T[],
): { step: HandStep; members: T[] }[] {
  const sorted = [...notes].sort((a, b) => a.startMs - b.startMs || a.note - b.note)
  const groups: { members: T[]; startMs: number; endMs: number }[] = []

  for (const note of sorted) {
    const last = groups.at(-1)
    if (last && note.startMs - last.startMs <= CHORD_WINDOW_MS) {
      last.members.push(note)
      last.endMs = Math.max(last.endMs, note.startMs + note.durationMs)
      continue
    }
    groups.push({
      members: [note],
      startMs: note.startMs,
      endMs: note.startMs + note.durationMs,
    })
  }

  return groups.map((group) => {
    const members = [...group.members].sort((a, b) => a.note - b.note)
    return {
      step: {
        notes: members.map((member) => member.note),
        startMs: group.startMs,
        endMs: group.endMs,
      },
      members,
    }
  })
}

/** The mean of a hand's notes — near enough to where the hand is. */
const centre = (notes: readonly number[]) =>
  notes.reduce((total, note) => total + note, 0) / notes.length

/**
 * What one hand's share of a chord costs it, or null where it cannot be played.
 *
 * A hand with nothing to play costs nothing, which is what lets a chord go
 * entirely to one hand without the other objecting.
 */
const shareCost = (notes: readonly number[], hand: Hand): number | null => gripCost(notes, hand)

interface Node {
  cost: number
  /** Where each hand is, whether or not it is playing right now. */
  left: number
  right: number
  /** When each hand last played, so a rested hand is free to move. */
  leftAt: number
  rightAt: number
  /** What each hand played in this step, or null if it did not. */
  playedLeft: number | null
  playedRight: number | null
  /** When this step ended, for telling a continuation from a new phrase. */
  playedAt: number
  from: number
}

/**
 * Assigns every step's notes to a hand.
 *
 * Returns, for each step, how many of its notes (counting up from the lowest)
 * go to the left hand. Zero means the right hand takes all of them.
 *
 * The search is a dynamic program over the steps. Each state is one division of
 * one chord; its cost is what the hands pay to hold their shares and to travel
 * from wherever they were. Where a hand has been idle long enough to move
 * freely, travelling costs it nothing.
 */
export function assignHands(steps: readonly HandStep[]): number[] {
  if (steps.length === 0) return []

  const splits = steps.map((step) => {
    const options: { split: number; cost: number; left: number | null; right: number | null }[] = []
    for (let split = 0; split <= step.notes.length; split++) {
      const low = step.notes.slice(0, split)
      const high = step.notes.slice(split)
      const leftCost = shareCost(low, 'left')
      const rightCost = shareCost(high, 'right')
      if (leftCost === null || rightCost === null) continue
      // Splitting a chord one hand could have held is what to avoid — but only
      // where the division would cut through a cluster rather than fall in a
      // gap the music left there.
      const wholeFitsOne =
        shareCost(step.notes, 'left') !== null || shareCost(step.notes, 'right') !== null
      const divided = low.length > 0 && high.length > 0
      const gap = divided ? high[0]! - low[low.length - 1]! : 0
      const dividing =
        divided && wholeFitsOne ? (gap >= WIDE_GAP ? -WIDE_GAP_BONUS : SPLIT_PENALTY) : 0
      options.push({
        split,
        cost: leftCost + rightCost + dividing,
        left: low.length > 0 ? centre(low) : null,
        right: high.length > 0 ? centre(high) : null,
      })
    }
    // A chord no division can place — wider than two hands, or more notes than
    // ten — still has to go somewhere; the pitch seam is the last resort.
    if (options.length === 0) {
      const split = step.notes.filter((note) => note < SEAM).length
      options.push({ split, cost: 0, left: null, right: null })
    }
    return options
  })

  let layer: Node[] = splits[0]!.map((option, index) => ({
    cost:
      option.cost +
      (option.left === null ? 0 : Math.max(0, option.left - SEAM) * REGISTER_PULL) +
      (option.right === null ? 0 : Math.max(0, SEAM - option.right) * REGISTER_PULL),
    left: option.left ?? SEAM - 12,
    right: option.right ?? SEAM + 12,
    leftAt: option.left === null ? -Infinity : steps[0]!.endMs,
    rightAt: option.right === null ? -Infinity : steps[0]!.endMs,
    playedLeft: option.left,
    playedRight: option.right,
    playedAt: steps[0]!.endMs,
    from: index,
  }))
  const trail: number[][] = []

  for (let i = 1; i < steps.length; i++) {
    const step = steps[i]!
    const next: Node[] = []
    const back: number[] = []

    for (const option of splits[i]!) {
      let best: Node | null = null
      let bestFrom = 0
      for (const [j, previous] of layer.entries()) {
        // A hand that has rested long enough can be anywhere by now.
        const travel = (was: number, now: number | null, since: number) =>
          now === null || step.startMs - since > REPOSITION_MS ? 0 : Math.abs(now - was) / 3
        // Which hands were playing a moment ago. A hand resting between phrases
        // is not "leaving" — it has simply finished, and may start again
        // wherever it likes.
        const continuous = step.startMs - previous.playedAt <= PHRASE_GAP_MS
        const entering = (now: number | null, before: number | null) =>
          continuous && now !== null && before === null ? HAND_ENTRY : 0

        const cost =
          previous.cost +
          option.cost +
          travel(previous.left, option.left, previous.leftAt) +
          travel(previous.right, option.right, previous.rightAt) +
          entering(option.left, previous.playedLeft) +
          entering(option.right, previous.playedRight) +
          // Keep the hands on their own sides of the keyboard, gently. This
          // only decides where nothing else does — the opening chord of a
          // piece, when neither hand has been anywhere yet.
          (option.left === null ? 0 : Math.max(0, option.left - SEAM) * REGISTER_PULL) +
          (option.right === null ? 0 : Math.max(0, SEAM - option.right) * REGISTER_PULL)
        if (best === null || cost < best.cost) {
          best = {
            cost,
            left: option.left ?? previous.left,
            right: option.right ?? previous.right,
            leftAt: option.left === null ? previous.leftAt : step.endMs,
            rightAt: option.right === null ? previous.rightAt : step.endMs,
            playedLeft: option.left,
            playedRight: option.right,
            playedAt: step.endMs,
            from: j,
          }
          bestFrom = j
        }
      }
      next.push(best!)
      back.push(bestFrom)
    }
    trail.push(back)
    layer = next
  }

  let cheapest = 0
  for (const [i, node] of layer.entries()) if (node.cost < layer[cheapest]!.cost) cheapest = i

  const chosen: number[] = new Array(steps.length)
  let index = cheapest
  for (let i = steps.length - 1; i >= 0; i--) {
    chosen[i] = splits[i]![index]!.split
    if (i > 0) index = trail[i - 1]![index]!
  }
  return chosen
}

/**
 * Re-decides the hands of notes whose file never said.
 *
 * Everything that is not keyboard — an accompaniment part, a drum kit — passes
 * through untouched: it is not being played by hands at all.
 */
export function withInferredHands<
  T extends { note: number; startMs: number; durationMs: number; hand: Hand; role: string },
>(notes: readonly T[]): T[] {
  const playable = notes.filter((note) => note.role === 'keyboard')
  if (playable.length === 0) return [...notes]

  const grouped = handSteps(playable)
  const splits = assignHands(grouped.map(({ step }) => step))

  const hands = new Map<T, Hand>()
  grouped.forEach(({ members }, index) => {
    const split = splits[index]!
    members.forEach((member, i) => hands.set(member, i < split ? 'left' : 'right'))
  })

  return notes.map((note) => {
    const hand = hands.get(note)
    return hand === undefined || hand === note.hand ? note : { ...note, hand }
  })
}
