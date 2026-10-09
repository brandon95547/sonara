import type { Song, SongStep } from './song.js'
import type { SongMeasure } from './meter.js'

/**
 * A score, and the order it is played in.
 *
 * A score is written once and not always played once through. A repeat sign
 * sends the player back, and a first ending is played the first time and
 * stepped over the second. So the song keeps two things apart: what is written,
 * which is its notes and bars in the order the page has them, and how that is
 * performed, which is a list of stretches of the page in the order they sound.
 *
 * Kept apart rather than copied out. A repeated passage written into the notes
 * a second time would be engraved a second time — the page would grow a bar for
 * every bar repeated and lose its repeat signs — and a note on the page would
 * no longer be one thing that a player, a fingering or a mistake could be
 * attached to. So the notes stay as written and are in score time, and
 * everything that plays them goes through here to find out when.
 */

/** A stretch of the score played straight through, and when in the performance it begins. */
export interface SongSection {
  /** When it begins, in performance time. */
  readonly startMs: number
  /** The stretch of score time it plays: from here… */
  readonly fromMs: number
  /** …up to, and not including, here. */
  readonly toMs: number
}

/** The repeat signs on a bar, as the score wrote them. */
export interface MeasureRepeat {
  /** A repeat begins with this bar. */
  readonly start?: boolean
  /** A repeat ends with this bar: how many times the passage is played in all. */
  readonly times?: number
}

type Marked = Pick<SongMeasure, 'repeat' | 'ending'>

/** The most bars a performance may run to, per bar written: a guard, not a rule of music. */
const MAX_PASSES = 12

/**
 * The bars of a score in the order they are played, as indices into them.
 *
 * A repeat is played from its start sign — or from the top, or from the end of
 * the repeat before it, where it has none — as many times as its end sign says.
 * A bar under an ending bracket is played only on the passes the bracket
 * names, so the first ending leads back and the second leads on.
 */
export function playOrder(measures: readonly Marked[]): number[] {
  const order: number[] = []
  /** Where the passage being repeated begins, and which time through it this is. */
  let from = 0
  let pass = 1
  /** How many times each end sign has sent the player back. */
  const taken = new Map<number, number>()
  const limit = measures.length * MAX_PASSES

  for (let index = 0; index < measures.length && order.length < limit;) {
    const bar = measures[index]!
    // A start sign met for the first time opens a new passage.
    if (bar.repeat?.start && index !== from && !taken.has(index)) {
      from = index
      pass = 1
    }
    if (bar.ending && !bar.ending.includes(pass)) {
      index++
      continue
    }

    order.push(index)

    const times = bar.repeat?.times
    const back = taken.get(index) ?? 0
    if (times !== undefined && back < times - 1) {
      taken.set(index, back + 1)
      pass++
      index = from
      continue
    }
    // The last time through an end sign, or the last bar of the last ending:
    // the passage is over, and whatever comes next is the start of another.
    const next = measures[index + 1]
    const leavesEnding = bar.ending !== undefined && (!next?.ending || next.repeat?.start)
    if (times !== undefined || leavesEnding) {
      from = index + 1
      pass = 1
    }
    index++
  }
  return order
}

/**
 * The stretches of the score a play order is made of, timed.
 *
 * Bars that follow one another on the page are one stretch. Returns nothing
 * for a score played once through, which is most of them: a song with no
 * sections is simply its notes.
 */
export function sectionsFor(
  measures: readonly Pick<SongMeasure, 'startMs' | 'durationMs'>[],
  order: readonly number[],
  /** Where the music really ends, where the last bar's notes ring past it. */
  endMs = 0,
): SongSection[] {
  if (order.every((bar, index) => bar === index) && order.length === measures.length) return []

  const sections: { startMs: number; fromMs: number; toMs: number }[] = []
  let at = 0
  for (const [position, index] of order.entries()) {
    const bar = measures[index]!
    const last = sections.at(-1)
    const lastBar = index === measures.length - 1
    const toMs = lastBar
      ? Math.max(bar.startMs + bar.durationMs, endMs)
      : bar.startMs + bar.durationMs
    if (last && position > 0 && order[position - 1] === index - 1) last.toMs = toMs
    else sections.push({ startMs: at, fromMs: bar.startMs, toMs })
    at += toMs - bar.startMs
  }
  return sections
}

/** How long the song takes to play, repeats and all. */
export function playDuration(song: Pick<Song, 'durationMs' | 'sections'>): number {
  const last = song.sections?.at(-1)
  return last ? last.startMs + (last.toMs - last.fromMs) : song.durationMs
}

/** The section a moment of the performance falls in. */
function sectionAt(sections: readonly SongSection[], playMs: number): SongSection {
  let found = sections[0]!
  for (const section of sections) {
    if (section.startMs <= playMs) found = section
    else break
  }
  return found
}

/** Where on the page a moment of the performance is: performance time into score time. */
export function scoreMsAt(song: Pick<Song, 'sections'>, playMs: number): number {
  if (!song.sections?.length) return playMs
  const section = sectionAt(song.sections, playMs)
  return Math.min(section.toMs, section.fromMs + Math.max(0, playMs - section.startMs))
}

/**
 * The stretches of score that sound between two moments of the performance.
 *
 * Each says which score times it covers — from `fromMs` up to but not
 * including `toMs` — and what to add to a score time inside it to get the
 * moment it sounds. More than one when the span crosses a repeat.
 */
export function scoreWindows(
  song: Pick<Song, 'sections'>,
  fromPlayMs: number,
  toPlayMs: number,
): { fromMs: number; toMs: number; offsetMs: number }[] {
  if (!song.sections?.length) return [{ fromMs: fromPlayMs, toMs: toPlayMs, offsetMs: 0 }]
  const windows: { fromMs: number; toMs: number; offsetMs: number }[] = []
  for (const section of song.sections) {
    const endMs = section.startMs + (section.toMs - section.fromMs)
    const from = Math.max(fromPlayMs, section.startMs)
    const to = Math.min(toPlayMs, endMs)
    if (to <= from) continue
    const offsetMs = section.startMs - section.fromMs
    windows.push({ fromMs: from - offsetMs, toMs: to - offsetMs, offsetMs })
  }
  return windows
}

/**
 * The steps of a song in the order they are played, as indices into them.
 *
 * What Learn walks through: with a repeat in the score, the same written step
 * comes round again, and it is the same step — the same notes on the page —
 * that the player is asked for the second time.
 */
export function playedSteps(song: Pick<Song, 'sections'>, steps: readonly SongStep[]): number[] {
  if (!song.sections?.length) return steps.map((_, index) => index)
  const played: number[] = []
  for (const section of song.sections)
    for (const [index, step] of steps.entries())
      if (step.startMs >= section.fromMs - 0.5 && step.startMs < section.toMs - 0.5)
        played.push(index)
  return played
}
