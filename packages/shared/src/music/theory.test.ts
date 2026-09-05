import { describe, expect, it } from 'vitest'
import { scaleFingering } from './fingering.js'
import { findScaleType, spellScale } from './scales.js'
import { degreeNames, fourthFingerDegrees, ordinal, relativeKey, tetrachords } from './theory.js'

const anchor = (rootName: string, scaleTypeId: string, hand: 'right' | 'left', octaves = 1) =>
  fourthFingerDegrees(
    scaleFingering({ rootName, scaleTypeId, hand, octaves, notes: [] }).fingers,
    hand,
  ).map((index) => index + 1)

/**
 * The book states one 4th-finger anchor per hand per key, in the header of
 * every scale page, and builds its whole teaching around it. This pins our
 * derivation to all twenty-four of those answers.
 *
 * Extracted from PDF pages 20-79; the full table is kept in
 * sites/piano-content/fourth-finger-anchors.json. Repeated here rather than
 * read from there because a test may not reach outside the repository — and
 * because a pinned expectation is worth reading next to the thing it pins.
 */
const BOOK: [root: string, type: string, lh: number[], rh: number[]][] = [
  ['C', 'major', [2], [7]],
  ['G', 'major', [2], [7]],
  ['D', 'major', [2], [7]],
  ['A', 'major', [2], [7]],
  ['E', 'major', [2], [7]],
  // "LH: 4th finger on B and F# (1st and 5th degrees)" — twice in the octave.
  ['B', 'major', [1, 5], [7]],
  ['F♯', 'major', [1], [3]],
  ['D♭', 'major', [4], [6]],
  ['A♭', 'major', [4], [2]],
  ['E♭', 'major', [4], [5]],
  ['B♭', 'major', [4], [1]],
  // "RH: 4th finger on Bb (4th degree)" — the trailing 4 ends the scale and is
  // not an anchor, which is the rule the derivation has to get right.
  ['F', 'major', [2], [4]],

  ['A', 'natural-minor', [2], [7]],
  ['E', 'natural-minor', [2], [7]],
  ['B', 'natural-minor', [1, 5], [7]],
  ['F♯', 'natural-minor', [1], [2]],
  ['C♯', 'natural-minor', [4], [2]],
  // The natural-minor exception the book prints on the page itself: F♯, the
  // 7th degree, where the harmonic minor takes C♯, the 4th.
  ['G♯', 'natural-minor', [7], [2]],
  ['E♭', 'natural-minor', [3], [5]],
  ['B♭', 'natural-minor', [6], [1]],
  ['F', 'natural-minor', [2], [4]],
  ['C', 'natural-minor', [2], [7]],
  ['G', 'natural-minor', [2], [7]],
  ['D', 'natural-minor', [2], [7]],
]

describe('fourth-finger anchor', () => {
  it.each(BOOK)('%s %s lands where the book says', (root, type, lh, rh) => {
    expect(anchor(root, type, 'left')).toEqual(lh)
    expect(anchor(root, type, 'right')).toEqual(rh)
  })

  it('holds its place across octaves', () => {
    // The anchor is a fact about the hand shape, not about how far it travels.
    for (const [root, type, lh, rh] of BOOK) {
      for (const octaves of [1, 2, 3]) {
        expect(anchor(root, type, 'left', octaves)).toEqual(lh)
        expect(anchor(root, type, 'right', octaves)).toEqual(rh)
      }
    }
  })
})

describe('anchors we decline to claim', () => {
  it('has no standard fingering to anchor for a derived one', () => {
    // The dialog only prints an anchor for `source: 'standard'`. An anchor is a
    // rule; giving one to a fingering the app worked out for itself would dress
    // a guess up as a rule.
    for (const type of ['blues', 'whole-tone', 'major-pentatonic']) {
      expect(
        scaleFingering({
          rootName: 'C',
          scaleTypeId: type,
          hand: 'right',
          octaves: 1,
          notes: [60, 63, 65, 66, 67, 70, 72],
        }).source,
      ).toBe('derived')
    }
  })
})

describe('relative keys', () => {
  it('takes the relative minor from the 6th degree', () => {
    const cases: [pitchClass: number, expected: string][] = [
      [0, 'A'],
      [7, 'E'],
      [2, 'B'],
      [9, 'F♯'],
      [4, 'C♯'],
    ]
    for (const [pitchClass, expected] of cases) {
      const relative = relativeKey(pitchClass, findScaleType('major')!)
      expect(relative?.name).toBe(expected)
      expect(relative?.typeName).toBe('Natural Minor')
      expect(relative?.fromDegree).toBe(6)
    }
  })

  it('takes the relative major back from the ♭3rd', () => {
    const relative = relativeKey(9, findScaleType('natural-minor')!)
    expect(relative?.name).toBe('C')
    expect(relative?.typeName).toBe('Major')
  })

  it('round-trips: a major and its relative minor share their notes', () => {
    for (let pitchClass = 0; pitchClass < 12; pitchClass++) {
      const major = spellScale(pitchClass, findScaleType('major')!)
      const relative = relativeKey(pitchClass, findScaleType('major')!)!
      const minor = spellScale(
        spellScale(pitchClass, findScaleType('major')!).notes[5]!.pitchClass,
        findScaleType('natural-minor')!,
      )
      expect(relative.name).toBe(minor.root.name)
      expect([...minor.notes.map((n) => n.pitchClass)].sort()).toEqual(
        [...major.notes.map((n) => n.pitchClass)].sort(),
      )
    }
  })

  it('says nothing for scales that have no relative key', () => {
    expect(relativeKey(0, findScaleType('blues')!)).toBeNull()
    expect(relativeKey(0, findScaleType('whole-tone')!)).toBeNull()
  })
})

describe('tetrachords', () => {
  it('splits a major scale into two identical halves', () => {
    expect(tetrachords(findScaleType('major')!)).toEqual({
      lower: 'W W H',
      upper: 'W W H',
      join: 'W',
    })
  })

  it('declines to split the scales that are not built that way', () => {
    expect(tetrachords(findScaleType('natural-minor')!)).toBeNull()
    expect(tetrachords(findScaleType('harmonic-minor')!)).toBeNull()
    expect(tetrachords(findScaleType('blues')!)).toBeNull()
  })
})

describe('degree names', () => {
  it('calls the major seventh a leading tone and the natural minor’s a subtonic', () => {
    expect(degreeNames(findScaleType('major')!).at(-1)).toBe('Leading tone')
    expect(degreeNames(findScaleType('natural-minor')!).at(-1)).toBe('Subtonic')
    expect(degreeNames(findScaleType('harmonic-minor')!).at(-1)).toBe('Leading tone')
  })

  it('has no names for a scale that is not seven notes', () => {
    expect(degreeNames(findScaleType('blues')!)).toEqual([])
  })
})

describe('ordinal', () => {
  it('spells the ones the copy actually uses', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '5th',
      '6th',
      '7th',
    ])
  })
})
