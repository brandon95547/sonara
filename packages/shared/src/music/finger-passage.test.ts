import { describe, expect, it } from 'vitest'
import { fingerPassage } from './finger-passage.js'
import { noteCost, pairCost, reachable } from './hand-model.js'
import { scaleFingering } from './fingering.js'
import { findScaleType, octaveNotes, spellScale } from './scales.js'

const fingers = (notes: number[], hand: 'right' | 'left' = 'right') =>
  fingerPassage(notes, hand).fingers.join('')

/**
 * The published model, checked against the numbers it publishes.
 *
 * Parncutt, Sloboda, Clarke, Raekallio & Desain, *Music Perception* 14(4),
 * 1997. The point of using a measured model rather than an invented one is
 * that its weights can be checked, so they are.
 */
describe('the hand model', () => {
  it('knows how far each pair of fingers reaches', () => {
    // Table 1: 1-2 spans -5 to 10 semitones in the right hand.
    expect(reachable(1, 2, 10, 'right')).toBe(true)
    expect(reachable(1, 2, 11, 'right')).toBe(false)
    expect(reachable(1, 2, -5, 'right')).toBe(true)
    expect(reachable(1, 2, -6, 'right')).toBe(false)
    // 3-4 barely moves: 1 to 4 semitones.
    expect(reachable(3, 4, 4, 'right')).toBe(true)
    expect(reachable(3, 4, 5, 'right')).toBe(false)
    // The left hand is the mirror, so the same spans run the other way.
    expect(reachable(1, 2, -10, 'left')).toBe(true)
    expect(reachable(1, 2, -11, 'left')).toBe(false)
  })

  it('will not step from one note to the next on the same finger', () => {
    for (const f of [1, 2, 3, 4, 5] as const) expect(reachable(f, f, 2, 'right')).toBe(false)
  })

  it('charges the stretch rule two points a semitone past comfortable', () => {
    // The paper's own example: D4-C5 is 10 semitones, MaxComf for 2-5 is 8, so
    // 2 x 2 = 4 points. E4-C5 at 9 semitones costs 2.
    const tally: Record<string, number> = {}
    pairCost(62, 72, 2, 5, 'right', tally)
    expect(tally['stretch']).toBe(4)

    // The paper's second example prints "E4-C5 (9 semitones)", but E4 to C5 is
    // 8 — a minor sixth. Nine semitones is what gives its stated 2 points, so
    // that is the interval meant and the interval checked.
    const closer: Record<string, number> = {}
    pairCost(63, 72, 2, 5, 'right', closer)
    expect(closer['stretch']).toBe(2)

    // Exactly comfortable costs nothing, which is what makes the boundary real.
    const comfortable: Record<string, number> = {}
    pairCost(64, 72, 2, 5, 'right', comfortable)
    expect(comfortable['stretch']).toBeUndefined()
  })

  it('charges the weak fingers and the thumb on a black key', () => {
    expect(noteCost(60, 4)).toBe(1)
    expect(noteCost(60, 5)).toBe(1)
    expect(noteCost(60, 3)).toBe(0)
    // Rule 10's flat point, before anything the neighbours add.
    expect(noteCost(61, 1)).toBe(1)
    expect(noteCost(60, 1)).toBe(0)
  })
})

describe('fingering a passage', () => {
  it('takes five notes under the hand with five fingers', () => {
    expect(fingers([60, 62, 64, 65, 67])).toBe('12345')
  })

  it('reproduces the two-octave C major scale from ergonomics alone', () => {
    // Nothing here knows what a scale is. The fingering every method book
    // prints falls out of the difficulty model on its own, which is the best
    // evidence available that the model is wired up correctly.
    expect(fingers([60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84])).toBe(
      '123123412312345',
    )
  })

  it('reproduces the C major arpeggio the source prints', () => {
    expect(fingers([60, 64, 67, 72])).toBe('1235')
  })

  it('keeps one finger on a repeated note', () => {
    // The model excludes note repetitions; a repeated note is the one place
    // the same finger twice is what everybody actually does.
    expect(fingers([60, 60, 67, 67, 69, 69, 67])).toBe('1122332')
  })

  it('agrees with the published scale fingerings about half the time', () => {
    // Not a target — a boundary. The model fingers isolated fragments and has
    // no notion of a scale that has to loop into its next octave, so it puts
    // the thumb on black keys where a method book will not. This is why the
    // tables win for scales and the model is only asked about everything else.
    let exact = 0
    for (const typeId of ['major', 'harmonic-minor']) {
      const type = findScaleType(typeId)!
      for (let pc = 0; pc < 12; pc++) {
        for (const hand of ['right', 'left'] as const) {
          const notes = octaveNotes(pc, type)
          const book = scaleFingering({
            rootName: spellScale(pc, type).root.name,
            scaleTypeId: typeId,
            hand,
            octaves: 1,
            notes,
          })
          if (book.fingers.join('') === fingerPassage(notes, hand).fingers.join('')) exact++
        }
      }
    }
    expect(exact).toBeGreaterThanOrEqual(20)
    expect(exact).toBeLessThan(48)
  })

  it('never returns a finger outside the hand, or the same one twice running', () => {
    const passages = [
      [60, 62, 64, 65, 67, 69, 71, 72],
      [61, 63, 66, 68, 70, 73],
      [60, 72, 62, 74, 64, 76],
      [72, 71, 69, 67, 65, 64, 62, 60],
      [60, 61, 62, 63, 64, 65, 66, 67],
    ]
    for (const notes of passages) {
      for (const hand of ['right', 'left'] as const) {
        const result = fingerPassage(notes, hand)
        expect(result.fingers).toHaveLength(notes.length)
        for (const finger of result.fingers) {
          expect(finger).toBeGreaterThanOrEqual(1)
          expect(finger).toBeLessThanOrEqual(5)
        }
        for (let i = 1; i < result.fingers.length; i++) {
          if (notes[i] !== notes[i - 1]) expect(result.fingers[i]).not.toBe(result.fingers[i - 1])
        }
      }
    }
  })

  it('gives up rather than inventing something unplayable', () => {
    // Two notes further apart than any pair of fingers can reach.
    expect(fingerPassage([40, 100], 'right').fingers).toEqual([])
    expect(fingerPassage([], 'right').fingers).toEqual([])
    expect(fingerPassage([60], 'right').fingers).toEqual([1])
  })
})
