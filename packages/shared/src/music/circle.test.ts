import { describe, expect, it } from 'vitest'
import { circleOfFifths } from './theory.js'

describe('the circle of fifths', () => {
  const circle = circleOfFifths()
  const majors = circle.map((key) => key.major.name)

  it('goes round in fifths from C, clockwise', () => {
    // Alfred, inside front cover: C G D A E B F♯ one way, C F B♭ E♭ A♭ D♭ the other.
    expect(majors.slice(0, 7)).toEqual(['C', 'G', 'D', 'A', 'E', 'B', 'F♯'])
    expect([...majors.slice(7)].reverse()).toEqual(['F', 'B♭', 'E♭', 'A♭', 'D♭'])
    for (const [index, key] of circle.entries()) {
      const next = circle[(index + 1) % 12]!
      expect((next.major.pitchClass - key.major.pitchClass + 12) % 12, key.major.name).toBe(7)
    }
  })

  it('adds a sharp at every step clockwise, in the order sharps are written', () => {
    expect(circle.slice(0, 7).map((key) => key.fifths)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(circle[3]!.signature).toBe('3 sharps')
    expect(circle[3]!.accidentals).toEqual(['F♯', 'C♯', 'G♯'])
    expect(circle[1]!.signature).toBe('1 sharp')
    expect(circle[0]!.signature).toBe('No sharps or flats')
  })

  it('and a flat at every step the other way', () => {
    expect([...circle.slice(7)].reverse().map((key) => key.fifths)).toEqual([-1, -2, -3, -4, -5])
    expect(circle[10]!.accidentals).toEqual(['B♭', 'E♭'])
  })

  it('pairs each major key with the minor that shares its signature', () => {
    // The same table: C–A, G–E, D–B, A–F♯, E–C♯, B–G♯, F–D, B♭–G, E♭–C, A♭–F, D♭–B♭.
    const pairs = Object.fromEntries(circle.map((key) => [key.major.name, key.minor.name]))
    expect(pairs).toMatchObject({
      C: 'A',
      G: 'E',
      D: 'B',
      A: 'F♯',
      E: 'C♯',
      B: 'G♯',
      F: 'D',
      'B♭': 'G',
      'E♭': 'C',
      'A♭': 'F',
      'D♭': 'B♭',
    })
    for (const key of circle) {
      expect((key.major.pitchClass - key.minor.pitchClass + 12) % 12, key.major.name).toBe(3)
    }
  })
})
