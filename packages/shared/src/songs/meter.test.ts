import { describe, expect, it } from 'vitest'
import {
  barIndexAt,
  beamBoundaries,
  gridMeasures,
  metronomePulses,
  numberMeasures,
  quartersPerBar,
} from './meter.js'

describe('the metronome pulse', () => {
  const offsets = (beats: number, beatType: number) =>
    metronomePulses(beats, beatType).map((pulse) => pulse.offsetQ)

  it('beats every crotchet in simple time', () => {
    expect(offsets(4, 4)).toEqual([0, 1, 2, 3])
    expect(offsets(3, 4)).toEqual([0, 1, 2])
    expect(offsets(2, 4)).toEqual([0, 1])
  })

  it('beats in minims in cut time', () => {
    expect(offsets(2, 2)).toEqual([0, 2])
    expect(offsets(3, 2)).toEqual([0, 2, 4])
  })

  it('beats in dotted crotchets in compound time', () => {
    // 6/8 is two beats, not three and not six. Clicking every crotchet puts
    // the second click between the two beats, which is worse than no click.
    expect(offsets(6, 8)).toEqual([0, 1.5])
    expect(offsets(9, 8)).toEqual([0, 1.5, 3])
    expect(offsets(12, 8)).toEqual([0, 1.5, 3, 4.5])
    expect(offsets(6, 4)).toEqual([0, 3])
  })

  it('groups additive metres in twos with a three at the end', () => {
    expect(offsets(5, 8)).toEqual([0, 1])
    expect(offsets(7, 8)).toEqual([0, 1, 2])
    expect(offsets(3, 8)).toEqual([0, 0.5, 1])
  })

  it('accents the downbeat and nothing else', () => {
    for (const [beats, beatType] of [
      [4, 4],
      [6, 8],
      [7, 8],
      [2, 2],
    ] as const) {
      const pulses = metronomePulses(beats, beatType)
      expect(pulses[0]!.strong).toBe(true)
      expect(pulses.slice(1).every((pulse) => !pulse.strong)).toBe(true)
    }
  })

  it('survives a signature that makes no sense', () => {
    expect(metronomePulses(0, 4)).toEqual([{ offsetQ: 0, strong: true }])
  })
})

describe('bars', () => {
  it('counts a bar in crotchets whatever the denominator', () => {
    expect(quartersPerBar(4, 4)).toBe(4)
    expect(quartersPerBar(6, 8)).toBe(3)
    expect(quartersPerBar(2, 2)).toBe(4)
    expect(quartersPerBar(7, 8)).toBe(3.5)
  })

  it('lays a one-tempo piece out on a grid', () => {
    const bars = gridMeasures({ bpm: 120, beats: 3, beatType: 4, durationMs: 4000 })
    expect(bars.map((bar) => bar.startMs)).toEqual([0, 1500, 3000])
    expect(bars.map((bar) => bar.number)).toEqual([1, 2, 3])
    expect(bars[0]!.quarterMs).toBe(500)
  })

  it('numbers a pickup bar zero and the first full bar one', () => {
    const bar = (startQ: number, durationQ: number) => ({
      startMs: startQ * 500,
      durationMs: durationQ * 500,
      startQ,
      durationQ,
      beats: 3,
      beatType: 4,
      quarterMs: 500,
    })
    expect(numberMeasures([bar(0, 1), bar(1, 3), bar(4, 3)]).map((b) => b.number)).toEqual([
      0, 1, 2,
    ])
    expect(numberMeasures([bar(0, 3), bar(3, 3)]).map((b) => b.number)).toEqual([1, 2])
  })

  it('finds the bar a moment falls in', () => {
    const bars = gridMeasures({ bpm: 120, beats: 4, beatType: 4, durationMs: 6000 })
    expect(barIndexAt(bars, 0)).toBe(0)
    expect(barIndexAt(bars, 1999)).toBe(0)
    expect(barIndexAt(bars, 2000)).toBe(1)
    expect(barIndexAt(bars, 99999)).toBe(2)
  })
})

describe('beam groups', () => {
  it('breaks on the beat in simple time and on the dotted crotchet in compound', () => {
    expect(beamBoundaries(4, 4)).toEqual([0, 1, 2, 3])
    expect(beamBoundaries(6, 8)).toEqual([0, 1.5])
    expect(beamBoundaries(2, 2)).toEqual([0, 2])
  })
})
