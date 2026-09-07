import { describe, expect, it } from 'vitest'
import { fingerSteps } from './finger-steps.js'
import { chordCost, holdable } from './hand-model.js'

const grip = (steps: number[][], hand: 'right' | 'left' = 'right') =>
  fingerSteps(steps, hand).map((f) => (f ? f.join('') : null))

describe('holding a chord', () => {
  it('checks every pair of fingers, not just the neighbours', () => {
    // 1-2 and 2-3 can each be comfortable while 1-3 is impossible, which is
    // why the check cannot walk the chord in order and stop there.
    expect(holdable([60, 64, 67], [1, 3, 5], 'right')).toBe(true)
    expect(holdable([60, 72, 84], [1, 3, 5], 'right')).toBe(false)
  })

  it('will not put one finger on two keys', () => {
    expect(holdable([60, 64], [3, 3], 'right')).toBe(false)
  })

  it('reads the left hand upside down', () => {
    // The little finger takes the lowest note, so the same grip is the same
    // shape with the fingers in the other order.
    expect(holdable([48, 52, 55], [5, 3, 1], 'left')).toBe(true)
    expect(holdable([48, 52, 55], [1, 3, 5], 'left')).toBe(false)
  })

  it('charges nothing for a grip that is relaxed at every pair', () => {
    // A C major triad on 1 3 5 stretches nothing; only the little finger costs
    // anything, and that is the weak-finger rule rather than the span.
    expect(chordCost([60, 64, 67], [1, 3, 5], 'right')).toBe(1)
  })
})

/**
 * The published triad fingerings, which the hand model cannot reach on its own.
 *
 * `1 3 5` and `1 2 4` cost a C major triad exactly the same — relaxed at every
 * pair, one weak finger each — so physics leaves the choice open and the book
 * settles it. That is the whole reason for consulting one.
 */
describe('chords the method books print', () => {
  it('fingers a triad by its inversion, in both hands', () => {
    expect(grip([[60, 64, 67]])).toEqual(['135']) // root
    expect(grip([[64, 67, 72]])).toEqual(['125']) // 1st
    expect(grip([[67, 72, 76]])).toEqual(['135']) // 2nd
    expect(grip([[48, 52, 55]], 'left')).toEqual(['531'])
    expect(grip([[52, 55, 60]], 'left')).toEqual(['531'])
    expect(grip([[55, 60, 64]], 'left')).toEqual(['521'])
  })

  it('does not care which triad it is', () => {
    // Page 88 runs major, minor, diminished and augmented on the same root and
    // fingers all four alike.
    const qualities: [string, number, number][] = [
      ['major', 4, 7],
      ['minor', 3, 7],
      ['diminished', 3, 6],
      ['augmented', 4, 8],
    ]
    for (const [name, third, fifth] of qualities) {
      expect(grip([[60, 60 + third, 60 + fifth]]), name).toEqual(['135'])
      expect(grip([[48, 48 + third, 48 + fifth]], 'left'), name).toEqual(['531'])
    }
  })

  it('takes an octave on the thumb and the little finger', () => {
    expect(grip([[60, 72]])).toEqual(['15'])
    expect(grip([[48, 60]], 'left')).toEqual(['51'])
  })
})

describe('a part that is not all chords or all melody', () => {
  it('is the melodic model exactly where every step is one note', () => {
    // The one part of this that was independently validated, kept from
    // drifting: a two-octave C major scale still comes out as the book's.
    const scale = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84]
    expect(grip(scale.map((n) => [n])).join('')).toBe('123123412312345')
  })

  it('threads a melody between chords without breaking the run', () => {
    const mixed = [[60, 64, 67], [69], [71], [60, 64, 67], [72]]
    expect(grip(mixed).every((f) => f !== null)).toBe(true)
  })

  it('leaves a blank where no hand reaches, and carries on after it', () => {
    const withGap = [[60], [62], [36, 84], [72], [74]]
    const result = grip(withGap)
    expect(result[2]).toBeNull()
    expect(result[0]).not.toBeNull()
    expect(result[4]).not.toBeNull()
  })

  it('never puts one finger on two notes of the same step', () => {
    const chords = [
      [60, 64, 67],
      [62, 65, 69],
      [64, 67, 71],
      [65, 69, 72],
    ]
    for (const fingers of fingerSteps(chords, 'right')) {
      expect(fingers).not.toBeNull()
      expect(new Set(fingers!).size).toBe(fingers!.length)
    }
  })
})
