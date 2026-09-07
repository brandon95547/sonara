import { isBlackKey } from '../midi/notes.js'
import { normalisePitchClass, parsePitch } from './pitch.js'

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
 * Major, minor and chromatic carry the fingerings method books teach, checked
 * against The Complete Book of Scales, Chords, Arpeggios & Cadences (Palmer,
 * Manus & Lethco, Alfred, 1994). The transcribed tables and the reasoning
 * behind them are in `sites/piano-content`.
 *
 * Everything else — the modes, the pentatonics, blues, whole tone — is worked
 * out from the rules those published fingerings themselves follow, and is
 * marked `derived`, because "this is the standard" and "this is a reasonable
 * suggestion" are different claims.
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

interface HandPatterns {
  readonly right: OctavePattern
  readonly left: OctavePattern
}

const f = (digits: string): OctavePattern => [...digits].map(Number)

/**
 * The published fingerings, keyed by the root's pitch class.
 *
 * Pitch class rather than name, because a key has more than one name and the
 * app's speller picks whichever the key signature calls for. Keyed by name,
 * `D♯ minor` misses the `E♭ minor` entry and silently falls through to a
 * worked-out fingering — which is exactly what used to happen.
 */
const MAJOR: Record<number, HandPatterns> = {
  0: { right: f('12312345'), left: f('54321321') }, // C
  7: { right: f('12312345'), left: f('54321321') }, // G
  2: { right: f('12312345'), left: f('54321321') }, // D
  9: { right: f('12312345'), left: f('54321321') }, // A
  4: { right: f('12312345'), left: f('54321321') }, // E
  11: { right: f('12312345'), left: f('43214321') }, // B
  6: { right: f('23412312'), left: f('43213214') }, // F♯ / G♭
  1: { right: f('23123412'), left: f('32143213') }, // D♭ / C♯
  8: { right: f('34123123'), left: f('32143213') }, // A♭
  3: { right: f('31234123'), left: f('32143213') }, // E♭
  10: { right: f('41231234'), left: f('32143213') }, // B♭
  5: { right: f('12341234'), left: f('54321321') }, // F
}

/**
 * The book's minor chart.
 *
 * Printed as the harmonic minor, and used for the natural and melodic forms as
 * well: the per-key pages give one fingering per minor key and apply it to all
 * three. The two flat left hands are the exceptions the source names to "a
 * major scale and its parallel harmonic minor are fingered alike" — both put
 * the 4th finger on G♭ rather than following the parallel major.
 */
const MINOR: Record<number, HandPatterns> = {
  9: { right: f('12312345'), left: f('54321321') }, // A
  4: { right: f('12312345'), left: f('54321321') }, // E
  11: { right: f('12312345'), left: f('43214321') }, // B
  6: { right: f('34123123'), left: f('43213214') }, // F♯
  1: { right: f('34123123'), left: f('32143213') }, // C♯
  8: { right: f('34123123'), left: f('32143213') }, // G♯ / A♭
  3: { right: f('31234123'), left: f('21432132') }, // E♭ / D♯ — 4th finger on G♭
  10: { right: f('41231234'), left: f('21321432') }, // B♭ / A♯ — 4th finger on G♭
  5: { right: f('12341234'), left: f('54321321') }, // F
  0: { right: f('12312345'), left: f('54321321') }, // C
  7: { right: f('12312345'), left: f('54321321') }, // G
  2: { right: f('12312345'), left: f('54321321') }, // D
}

/**
 * The natural minor is the chart above with one substitution.
 *
 * G♯ is the only scale in the book whose natural-minor left hand differs from
 * its harmonic minor, and the page says so itself: natural takes the 4th finger
 * on F♯, the 7th degree, where harmonic takes it on C♯, the 4th.
 */
const NATURAL_MINOR: Record<number, HandPatterns> = {
  ...MINOR,
  8: { right: MINOR[8]!.right, left: f('32132143') },
}

/**
 * The melodic minor raises the sixth, and in two keys that changes the hand.
 *
 * Everywhere else the raised sixth and seventh land where the harmonic minor's
 * fingering already expects them, which is why the source prints one fingering
 * per minor key. In F♯ and C♯ the raised sixth turns a white key black directly
 * under the thumb, so the source moves the right hand's 4th finger onto it and
 * says so on the page: "RH 4th finger on D♯ ascending" for F♯, "on A♯
 * ascending" for C♯. Both come out as the same shape, and it is the one D♭
 * major uses — an identically coloured run of keys.
 *
 * Ascending only. Coming down, a melodic minor is a natural minor and takes the
 * natural minor's fingering, which is why the exercise builder fingers the two
 * directions from their own forms rather than mirroring one into the other.
 *
 * The last digit is the terminal finger, used once at the very top and not on
 * the octave notes along the way — the repeating body is `2 3 1 2 3 4 1`. It is
 * a 3 rather than a 2 because the top note is played once and the descent that
 * follows begins on 3. Ending the ascent on 2 would ask two different fingers
 * for one note, and put the same finger on the two notes either side of the
 * turn.
 */
const MELODIC_MINOR: Record<number, HandPatterns> = {
  ...MINOR,
  6: { right: f('23123413'), left: MINOR[6]!.left }, // F♯ — 4th finger to D♯
  1: { right: f('23123413'), left: MINOR[1]!.left }, // C♯ — 4th finger to A♯
}

function publishedPattern(scaleTypeId: string, pitchClass: number): HandPatterns | undefined {
  switch (scaleTypeId) {
    case 'major':
      return MAJOR[pitchClass]
    case 'natural-minor':
      return NATURAL_MINOR[pitchClass]
    case 'harmonic-minor':
      return MINOR[pitchClass]
    case 'melodic-minor':
      return MELODIC_MINOR[pitchClass]
    default:
      return undefined
  }
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
 * The chromatic scale, which is given rather than worked out.
 *
 * Every black key takes the 3rd finger. Every white key takes the thumb —
 * except where two white keys are adjacent, at E–F and B–C, where one of the
 * pair has to give way, since the thumb cannot play both. Which one gives way
 * is what separates the hands: the source puts the right hand's 2nd finger on
 * C and F, and the left hand's on E and B.
 */
const CHROMATIC_SECOND_FINGER: Record<Hand, readonly number[]> = {
  right: [0, 5], // C and F
  left: [4, 11], // E and B
}

function chromaticFingers(notes: readonly number[], hand: Hand): number[] {
  const seconds = CHROMATIC_SECOND_FINGER[hand]
  return notes.map((note) =>
    isBlackKey(note) ? 3 : seconds.includes(normalisePitchClass(note)) ? 2 : 1,
  )
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
  /** The app's own spelling of the root, e.g. `E♭`. Resolved to a pitch class. */
  readonly rootName: string
  readonly scaleTypeId: string
  readonly hand: Hand
  readonly octaves: number
  /** The actual notes, needed for every scale with no published fingering. */
  readonly notes: readonly number[]
}

export function scaleFingering(request: FingeringRequest): Fingering {
  const pitchClass = parsePitch(request.rootName)?.pitchClass
  const published =
    pitchClass === undefined ? undefined : publishedPattern(request.scaleTypeId, pitchClass)

  // Source travels with the fingers rather than being worked out again from
  // the request: asking twice is how the chromatic scale came to report itself
  // as published while returning nothing at all.
  const { fingers, source }: { fingers: number[]; source: Fingering['source'] } = published
    ? {
        fingers: extend(published[request.hand], request.octaves, request.hand),
        source: 'standard',
      }
    : // The chromatic fingering is the source's own, applied by rule rather
      // than stored as a pattern, so it counts as published too.
      request.scaleTypeId === 'chromatic' && request.notes.length > 0
      ? { fingers: chromaticFingers(request.notes, request.hand), source: 'standard' }
      : { fingers: derive(request.notes, request.hand), source: 'derived' }

  return { fingers, source, crossings: findCrossings(fingers, request.hand) }
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
