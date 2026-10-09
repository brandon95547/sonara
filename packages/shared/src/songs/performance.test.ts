import { describe, expect, it } from 'vitest'
import {
  playDuration,
  playedSteps,
  playOrder,
  scoreMsAt,
  scoreWindows,
  sectionsFor,
  type MeasureRepeat,
} from './performance.js'
import type { SongStep } from './song.js'

/**
 * The order a score is played in.
 *
 * A bar here is written the way a musician would say it: `|:` opens a repeat,
 * `:|` closes one, and a number is the ending it stands under.
 */
const bars = (...written: string[]) =>
  written.map((bar) => {
    const repeat: { start?: boolean; times?: number } = {}
    if (bar.includes('|:')) repeat.start = true
    const end = /:\|(?:x(\d+))?/.exec(bar)
    if (end) repeat.times = Number(end[1] ?? 2)
    const ending = /\[([\d,]+)\]/.exec(bar)?.[1]
    return {
      ...(repeat.start || repeat.times ? { repeat: repeat as MeasureRepeat } : {}),
      ...(ending ? { ending: ending.split(',').map(Number) } : {}),
    }
  })

/** Bars a second long each, so a time in seconds is a bar number. */
const timed = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ startMs: index * 1000, durationMs: 1000 }))

describe('the order the bars are played in', () => {
  it('plays a score with no repeats once through', () => {
    expect(playOrder(bars('', '', ''))).toEqual([0, 1, 2])
  })

  it('goes back to the top at an end sign with no start sign before it', () => {
    expect(playOrder(bars('', ':|', ''))).toEqual([0, 1, 0, 1, 2])
  })

  it('goes back to the start sign, not past it', () => {
    expect(playOrder(bars('', '|:', ':|', ''))).toEqual([0, 1, 2, 1, 2, 3])
  })

  it('takes the first ending the first time and the second the second', () => {
    expect(playOrder(bars('', '', '[1]:|', '[2]', ''))).toEqual([0, 1, 2, 0, 1, 3, 4])
  })

  it('starts the next repeat after the last ending, not back at the top', () => {
    // Two strains, each with its endings, and no start sign on the second.
    expect(playOrder(bars('', '[1]:|', '[2]', '', '[1]:|', '[2]'))).toEqual([
      0, 1, 0, 2, 3, 4, 3, 5,
    ])
  })

  it('plays a passage as many times as its end sign says', () => {
    expect(playOrder(bars('|:', ':|x3', ''))).toEqual([0, 1, 0, 1, 0, 1, 2])
  })

  it('plays an ending of several bars whole, and steps over all of it', () => {
    expect(playOrder(bars('', '[1]', '[1]:|', '[2]', '[2]'))).toEqual([0, 1, 2, 0, 3, 4])
  })

  it('repeats two passages in a row, each from its own start', () => {
    expect(playOrder(bars('|:', ':|', '|:', ':|'))).toEqual([0, 1, 0, 1, 2, 3, 2, 3])
  })
})

describe('a performance, timed', () => {
  it('has no sections where the score is played once through', () => {
    expect(sectionsFor(timed(3), [0, 1, 2])).toEqual([])
  })

  it('joins the bars that follow one another on the page into one stretch', () => {
    // Bars 0-2, back to 0-1, then 3: the first ending is bar 2.
    expect(sectionsFor(timed(4), [0, 1, 2, 0, 1, 3])).toEqual([
      { startMs: 0, fromMs: 0, toMs: 3000 },
      { startMs: 3000, fromMs: 0, toMs: 2000 },
      { startMs: 5000, fromMs: 3000, toMs: 4000 },
    ])
  })

  const song = { durationMs: 4000, sections: sectionsFor(timed(4), [0, 1, 2, 0, 1, 3]) }

  it('lasts as long as everything played, repeats included', () => {
    expect(playDuration(song)).toBe(6000)
    expect(playDuration({ durationMs: 4000 })).toBe(4000)
  })

  it('says where on the page a moment of the performance is', () => {
    expect(scoreMsAt(song, 2500)).toBe(2500)
    // Half a second into the second time round: back at the top.
    expect(scoreMsAt(song, 3500)).toBe(500)
    expect(scoreMsAt(song, 5500)).toBe(3500)
    expect(scoreMsAt({}, 1234)).toBe(1234)
  })

  it('gives the stretches of the page that sound across a repeat', () => {
    // From just before the repeat sign to just after it.
    expect(scoreWindows(song, 2900, 3100)).toEqual([
      { fromMs: 2900, toMs: 3000, offsetMs: 0 },
      { fromMs: 0, toMs: 100, offsetMs: 3000 },
    ])
    expect(scoreWindows({}, 10, 20)).toEqual([{ fromMs: 10, toMs: 20, offsetMs: 0 }])
  })

  it('walks the steps in the order they are played, the repeated ones twice', () => {
    const steps = [0, 1000, 2000, 3000].map((startMs) => ({ startMs, notes: [] }) as SongStep)
    expect(playedSteps(song, steps)).toEqual([0, 1, 2, 0, 1, 3])
    expect(playedSteps({}, steps)).toEqual([0, 1, 2, 3])
  })
})
