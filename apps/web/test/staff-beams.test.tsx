import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildScaleExercise, DEFAULT_SCALE_SPEC, type ScaleSpec } from '@sonara/shared'
import { beamsIn } from '@/features/staff/beams'
import { ScaleScore, scaleSteps } from '@/features/staff/ScaleScore'
import { measureScore, place } from '@/features/staff/score'
import { useLearningStore } from '@/state/learning-store'

class NoSize {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = NoSize as unknown as typeof ResizeObserver

afterEach(cleanup)

/**
 * Short notes, joined into the beats they belong to.
 *
 * The staff drew a flag on every quaver, because a note was drawn by itself and
 * a beam belongs to several. A scale in semiquavers came out as sixty flags in
 * a row: every note correct, and no way to see where a beat began — which is
 * the one thing a beam is for.
 */

const scale = (spec: Partial<ScaleSpec>) =>
  buildScaleExercise({
    ...DEFAULT_SCALE_SPEC,
    rootPitchClass: 0,
    scaleTypeId: 'major',
    octaves: 2,
    direction: 'up-down',
    ...spec,
  })

/** The exercise measured the way the scale score measures it. */
const measure = (spec: Partial<ScaleSpec>, beams = true) => {
  const exercise = scale(spec)
  return measureScore(
    { bpm: 120, measureMs: 500 * (exercise.meter?.beats ?? 4), beams },
    scaleSteps(exercise),
  )
}

/** How many chords each beam on a staff joins, in order. */
const groupSizes = (measured: ReturnType<typeof measure>, staff: 'treble' | 'bass' = 'treble') => {
  const sizes: number[] = []
  let last: number | undefined
  for (const entry of measured) {
    const id = entry.beam?.[staff]
    if (id === undefined) {
      last = undefined
      continue
    }
    if (id === last) sizes[sizes.length - 1]! += 1
    else sizes.push(1)
    last = id
  }
  return sizes
}

describe('which notes share a beam', () => {
  it('leaves crotchets alone', () => {
    expect(measure({}).every((entry) => entry.beam === undefined)).toBe(true)
  })

  it('joins quavers in fours, half a bar at a time, as a scale book prints them', () => {
    // 28 quavers and a minim: seven beams of four, and the last note stands alone.
    const measured = measure({ notesPerBeat: 2 })
    expect(groupSizes(measured)).toEqual([4, 4, 4, 4, 4, 4, 4])
    expect(measured.at(-1)!.beam).toBeUndefined()
  })

  it('joins semiquavers by the beat', () => {
    expect(groupSizes(measure({ notesPerBeat: 4 }))).toEqual([4, 4, 4, 4, 4, 4, 4])
  })

  it('joins triplets in threes, each under its own number', () => {
    const measured = measure({ notesPerBeat: 3 })
    // 29 notes: nine whole beats, and two left over that still belong together.
    expect(groupSizes(measured)).toEqual([3, 3, 3, 3, 3, 3, 3, 3, 3, 2])
    expect(measured[0]!.tuplet?.treble).toEqual({ id: 1, actual: 3, normal: 2 })
    expect(measured[2]!.tuplet?.treble?.id).toBe(1)
    expect(measured[3]!.tuplet?.treble?.id).toBe(2)
  })

  it('never carries a beam over a bar line', () => {
    const measured = measure({ notesPerBeat: 2 })
    const bars = new Map<number, Set<number>>()
    for (const entry of measured) {
      const id = entry.beam?.treble
      if (id === undefined) continue
      bars.set(id, (bars.get(id) ?? new Set()).add(entry.bar))
    }
    for (const [id, crossed] of bars) expect(crossed.size, `beam ${id}`).toBe(1)
  })

  it('beams each hand by itself', () => {
    const measured = measure({ hand: 'both', notesPerBeat: 4 })
    expect(groupSizes(measured, 'treble')).toEqual(groupSizes(measured, 'bass'))
    expect(measured[0]!.beam?.treble).not.toBe(measured[0]!.beam?.bass)
  })

  it('does nothing unless the score asks for beams', () => {
    // A song's onsets may be a performance, with no beat to group by.
    expect(measure({ notesPerBeat: 4 }, false).every((entry) => entry.beam === undefined)).toBe(
      true,
    )
  })
})

describe('what a beam looks like', () => {
  const laidOut = (spec: Partial<ScaleSpec>) => {
    const placed = place(measure(spec), 200)
    return { placed, ...beamsIn(placed) }
  }

  it('gives every chord under it the same stem direction', () => {
    const { placed, stems } = laidOut({ notesPerBeat: 4 })
    const directions = new Map<number, Set<boolean>>()
    for (const entry of placed) {
      const id = entry.beam?.treble
      const stem = stems.get(entry.index)?.treble
      if (id === undefined) continue
      expect(stem, `step ${entry.index}`).toBeDefined()
      directions.set(id, (directions.get(id) ?? new Set()).add(stem!.up))
    }
    for (const [id, seen] of directions) expect(seen.size, `beam ${id}`).toBe(1)
  })

  it('puts the stem ends on one straight line, never steeper than a staff space', () => {
    const { placed, stems } = laidOut({ notesPerBeat: 4 })
    const first = placed.slice(0, 4).map((entry) => ({
      x: entry.x,
      end: stems.get(entry.index)!.treble!.end,
    }))
    const slope = (first[3]!.end - first[0]!.end) / (first[3]!.x - first[0]!.x)
    for (const point of first) {
      expect(point.end).toBeCloseTo(first[0]!.end + slope * (point.x - first[0]!.x), 6)
    }
    // Ten units is a staff space: two steps of five.
    expect(Math.abs(first[3]!.end - first[0]!.end)).toBeLessThanOrEqual(10 + 1e-6)
  })

  it('draws one bar for quavers, two for semiquavers, and numbers a triplet', () => {
    expect(laidOut({ notesPerBeat: 2 }).beams[0]!.bars).toHaveLength(1)
    expect(laidOut({ notesPerBeat: 4 }).beams[0]!.bars).toHaveLength(2)
    const triplets = laidOut({ notesPerBeat: 3 }).beams
    expect(triplets[0]!.tuplet?.text).toBe('3')
    // The two left over at the end are not a whole triplet, and are not numbered as one.
    expect(triplets.at(-1)!.tuplet).toBeUndefined()
  })
})

describe('the scale on the page', () => {
  const store = () => useLearningStore.getState()
  beforeEach(() => {
    store().setTopic('scales')
    store().updateSpec({
      ...DEFAULT_SCALE_SPEC,
      rootPitchClass: 0,
      scaleTypeId: 'major',
      direction: 'up-down',
      notesPerBeat: undefined,
    })
  })

  it('has beams in place of flags, and no flag left on a beamed note', () => {
    store().updateSpec({ notesPerBeat: 4 })
    const { container } = render(<ScaleScore />)
    expect(container.querySelectorAll('.staff__beam')).toHaveLength(7)
    expect(container.querySelectorAll('.staff__flag')).toHaveLength(0)
    expect(container.querySelectorAll('.staff__stem')).toHaveLength(29)
  })

  it('prints the metre once the beat is divided, and not before', () => {
    const plain = render(<ScaleScore />)
    expect(plain.container.querySelectorAll('.staff__time-digit')).toHaveLength(0)
    plain.unmount()

    store().updateSpec({ notesPerBeat: 2 })
    const divided = render(<ScaleScore />)
    expect(divided.container.querySelectorAll('.staff__time-digit')).toHaveLength(4)
  })

  it('numbers its triplets', () => {
    store().updateSpec({ notesPerBeat: 3 })
    const { container } = render(<ScaleScore />)
    expect(container.querySelectorAll('.staff__tuplet')).toHaveLength(9)
  })
})
