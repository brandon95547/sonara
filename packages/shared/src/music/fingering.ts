import { isBlackKey } from '../midi/notes.js'
import { fingeringSystem, type FingeringSystemId, type ScaleForm } from './fingering-system.js'

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
 * From a fingering system — see `fingering-system.ts`. The notes of a scale
 * are one thing and the fingers a school puts on them are another, so this
 * file holds no table of its own: it asks the chosen system, and the system
 * answers for the scales its source prints.
 *
 * Everything a system does not supply — the modes, the pentatonics, blues,
 * whole tone — is worked out here from the rules published fingerings
 * themselves follow, and is marked `derived`, because "this is the standard"
 * and "this is a reasonable suggestion" are different claims.
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
  /**
   * One finger per scale degree, tonic first, as the scale runs mid-passage —
   * clear of how a particular run opens or turns. Present only for a fingering
   * a system supplied as a repeating shape; it is what "where does the 4th
   * finger go" is a question about.
   */
  readonly cycle?: readonly number[]
  /**
   * The run as it is fingered coming back down, bottom note first, where that
   * is not simply `fingers` again. See `SystemScaleFingering.closing`.
   */
  readonly closing?: readonly number[]
}

// --- Working a fingering out ------------------------------------------------

/**
 * The most notes one thumb-to-thumb span may cover. A gap of 4 fills with
 * 2 3 4 and takes the thumb again; a gap of 5 would need the little finger in
 * the middle of the passage, with nowhere to go after it.
 */
const GROUP_MAX = 4
/** Notes before the first thumb, fingered 2 3 4 upward. Four would need a 5. */
const HEAD_MAX = 3
/** Notes after the last thumb. Exactly four lands the 5 on the final note. */
const TAIL_MAX = 4

/**
 * What each choice costs.
 *
 * The ordering here is the whole point. A thumb on a black key is strongly
 * discouraged but *possible*; running out of fingers is not. The previous
 * version had this the other way round — it treated the black-key rule as
 * inviolable and quietly clamped the finger number at 5 when it ran out, which
 * produced fingerings asking the little finger to play three rising notes in a
 * row. Preference must yield to anatomy, so every penalty below is finite.
 */
const BLACK_THUMB = 12
/**
 * A thumb-under after only one note. Legal, sometimes forced, and worse than
 * the groups of three and four a scale is normally built from — it has to cost
 * more than a short closing run does, or C blues comes out as 1 2 1 2 3 4 5
 * rather than 1 2 3 4 1 2 3.
 */
const NARROW_GROUP = 3
/**
 * Indexed by how many notes precede the first thumb.
 *
 * A passage that can begin on the thumb should. An opening run of 2 3 4 is what
 * a scale starting on a black key has to do, not a free choice, so the step
 * from no head to any head is deliberately large — larger than a narrow group
 * or an early crossing costs, which is what it is competing against. Cheaper
 * than that and C major pentatonic opens 2 1 2 3 4 5 instead of 1 2 3 1 2 3,
 * and C whole tone starts on the second finger with the thumb's own key free.
 * The single steps after it keep a short head preferred over a long one.
 */
const HEAD_COST = [0, 4, 5, 6] as const
/** Indexed by how many notes follow the last thumb. */
const TAIL_COST = [5, 3, 2, 1, 0] as const
/**
 * A long finger on a black key at the very end of the passage.
 *
 * The outermost note of a scale is where the hand has to turn round or hand on
 * to the next octave, and the little finger is the worst thing to be caught
 * doing it with on a black key: F♯ major closes the right hand on 2 rather than
 * running out to 5, and B♭ major opens the left hand on 3 rather than 5. The
 * 4th finger there is fine — B♭ major's right hand ends on it — so this is
 * about the 5 specifically, not about long fingers in general.
 */
const BLACK_EXTREME = 4

/**
 * Works out a fingering for a scale with no published one.
 *
 * Decided across the whole passage rather than note by note. A greedy walk that
 * takes the thumb at the first legal opportunity cannot know that the next four
 * notes are all black, and by the time it finds out, the hand has no fingers
 * left. So the thumb positions are planned first — cheapest complete plan over
 * the passage, by shortest path — and the fingers are filled in afterwards.
 * Between any two thumbs the fingers rise from 2, which is what makes the
 * result playable by construction: no finger can be reached twice, and 5 can
 * only ever land on the final note.
 */
function derive(notes: readonly number[], hand: Hand): number[] {
  if (hand === 'left') {
    // The left hand ascending is the right hand's shape read backwards. The
    // right hand's terminal 5 becomes the left hand's opening 5, which is
    // exactly where each belongs.
    return derive([...notes].reverse(), 'right').reverse()
  }

  const count = notes.length
  if (count === 0) return []

  // A short run of black keys on its own wants no thumb at all. The planner
  // below always places one, because a scale always needs one; a fragment
  // does not, and putting the thumb on a lone black key is the one thing
  // every rule here agrees about.
  if (count <= HEAD_MAX + 1 && notes.every((note) => isBlackKey(note))) {
    return notes.map((_, index) => index + 2)
  }

  const thumbCost = (index: number) => (isBlackKey(notes[index]!) ? BLACK_THUMB : 0)

  // best[i] — the cheapest plan whose last thumb so far is at i.
  const best = new Array<number>(count).fill(Number.POSITIVE_INFINITY)
  const previous = new Array<number>(count).fill(-1)

  // Opening: the passage may run up to the first thumb on 2 3 4.
  for (let index = 0; index <= Math.min(HEAD_MAX, count - 1); index++) {
    best[index] = thumbCost(index) + HEAD_COST[index]!
  }

  for (let index = 0; index < count; index++) {
    if (best[index] === Number.POSITIVE_INFINITY) continue
    for (let gap = 2; gap <= GROUP_MAX; gap++) {
      const next = index + gap
      if (next >= count) break
      const cost = best[index]! + thumbCost(next) + (gap === 2 ? NARROW_GROUP : 0)
      if (cost < best[next]!) {
        best[next] = cost
        previous[next] = index
      }
    }
  }

  let cheapest = Number.POSITIVE_INFINITY
  let lastThumb = -1
  for (let index = 0; index < count; index++) {
    if (best[index] === Number.POSITIVE_INFINITY) continue
    const tail = count - 1 - index
    if (tail > TAIL_MAX) continue
    const terminal = tail === 0 ? 1 : tail + 1
    const awkward = terminal === 5 && isBlackKey(notes[count - 1]!) ? BLACK_EXTREME : 0
    const total = best[index]! + TAIL_COST[tail]! + awkward
    if (total < cheapest) {
      cheapest = total
      lastThumb = index
    }
  }

  // Only reachable for a passage too long to finish from any thumb, which the
  // gaps above make impossible. Fingering something is better than throwing.
  if (lastThumb < 0) return notes.map((_, index) => Math.min(index + 1, 5))

  const thumbs: number[] = []
  for (let index = lastThumb; index >= 0; index = previous[index]!) {
    thumbs.unshift(index)
    if (previous[index] === -1) break
  }

  const fingers = new Array<number>(count)
  for (let index = 0; index < thumbs[0]!; index++) fingers[index] = 2 + index
  for (const [position, thumb] of thumbs.entries()) {
    fingers[thumb] = 1
    const until = thumbs[position + 1] ?? count
    for (let index = thumb + 1; index < until; index++) fingers[index] = 2 + (index - thumb - 1)
  }
  return fingers
}

export interface FingeringRequest {
  /**
   * The tonic as the key is spelled, e.g. `E♭`. Passed to the fingering system
   * as written: a key and its enharmonic twin are different keys.
   */
  readonly rootName: string
  readonly scaleTypeId: string
  readonly hand: Hand
  readonly octaves: number
  /** The actual notes, needed for every scale a system fingers by rule or not at all. */
  readonly notes: readonly number[]
  /** Which system to ask. The default one when left out. */
  readonly system?: FingeringSystemId
  /** Which line of the page the run is — similar motion when left out. */
  readonly form?: ScaleForm
  /** The degree the run starts on, 0 at the tonic. */
  readonly startDegree?: number
}

export function scaleFingering(request: FingeringRequest): Fingering {
  const system = fingeringSystem(request.system)
  const query = {
    tonic: request.rootName,
    scaleTypeId: request.scaleTypeId,
    hand: request.hand,
    octaves: request.octaves,
    notes: request.notes,
    form: request.form,
    startDegree: request.startDegree,
  }
  const supplied = system.scale(query)

  // A line the system does not print, of a scale it does: the hands thirds
  // apart in a minor key, say. The honest fingering is the one those notes
  // already have in that scale — the same fingers, started further along —
  // and it is a suggestion, because no page was read for it.
  const borrowed =
    supplied === null && (request.startDegree ?? 0) !== 0
      ? system.scale({ ...query, form: 'similar', startDegree: 0 })?.cycle
      : undefined

  // Source travels with the fingers rather than being worked out again from
  // the request: asking twice is how the chromatic scale came to report itself
  // as published while returning nothing at all.
  const { fingers, source }: { fingers: number[]; source: Fingering['source'] } = supplied
    ? { fingers: [...supplied.fingers], source: 'standard' }
    : borrowed
      ? {
          fingers: request.notes.map(
            (_, index) => borrowed[(index + (request.startDegree ?? 0)) % borrowed.length]!,
          ),
          source: 'derived',
        }
      : { fingers: derive(request.notes, request.hand), source: 'derived' }

  return {
    fingers,
    source,
    crossings: findCrossings(fingers, request.hand),
    ...(supplied?.cycle ? { cycle: supplied.cycle } : {}),
    ...(supplied?.closing ? { closing: supplied.closing } : {}),
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
