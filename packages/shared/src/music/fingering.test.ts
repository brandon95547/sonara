import { describe, expect, it } from 'vitest'
import { scaleFingering } from './fingering.js'
import { buildScaleExercise } from '../learning/scale-exercise.js'

const digits = (fingers: readonly number[]) => fingers.join('')

const scale = (rootName: string, scaleTypeId: string, hand: 'right' | 'left', octaves = 1) =>
  scaleFingering({ rootName, scaleTypeId, hand, octaves, notes: [] })

describe('standard fingerings', () => {
  it('knows the one-octave majors every method book opens with', () => {
    expect(digits(scale('C', 'major', 'right').fingers)).toBe('12312345')
    expect(digits(scale('C', 'major', 'left').fingers)).toBe('54321321')
    expect(digits(scale('F', 'major', 'right').fingers)).toBe('12341234')
    expect(digits(scale('B♭', 'major', 'right').fingers)).toBe('41231234')
    expect(digits(scale('B', 'major', 'left').fingers)).toBe('43214321')
  })

  it('never puts a thumb on a black key in a standard fingering', () => {
    // The rule the whole system rests on. If a stored pattern breaks it, the
    // fingering is unplayable and no other test would notice.
    const roots = ['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'D♭', 'A♭', 'E♭', 'B♭', 'F']
    for (const root of roots) {
      for (const hand of ['right', 'left'] as const) {
        const exercise = buildScaleExercise({
          kind: 'scale',
          rootPitchClass: pitchClassOf(root),
          scaleTypeId: 'major',
          hand,
          octaves: 1,
          direction: 'up',
        })
        exercise.steps.forEach((step) => {
          if (step.fingers[0]!.finger !== 1) return
          expect(isBlack(step.notes[0]!), `${root} ${hand} thumb on ${step.label}`).toBe(false)
        })
      }
    }
  })

  it('marks a stored pattern as standard and a computed one as derived', () => {
    expect(scale('C', 'major', 'right').source).toBe('standard')
    expect(scale('C', 'major', 'right').fingers.length).toBe(8)
    // Lydian has no stored table; it is derived, and says so.
    expect(scale('C', 'lydian', 'right').source).toBe('derived')
  })
})

describe('extending across octaves', () => {
  it('keeps the right hand’s little finger for the very last note only', () => {
    // 5 is a terminal finger: it has nowhere to go after itself, so a 5 in the
    // middle of an ascending scale is a hand that has run out of fingers.
    const fingers = scale('C', 'major', 'right', 2).fingers
    expect(digits(fingers)).toBe('123123412312345')
    expect(fingers.indexOf(5)).toBe(fingers.length - 1)
  })

  it('keeps the left hand’s little finger for the very first note only', () => {
    const fingers = scale('C', 'major', 'left', 2).fingers
    expect(digits(fingers)).toBe('543213214321321')
    expect(fingers.lastIndexOf(5)).toBe(0)
  })

  it('produces one finger per note', () => {
    for (const octaves of [1, 2, 3, 4]) {
      expect(scale('C', 'major', 'right', octaves).fingers.length).toBe(7 * octaves + 1)
      expect(scale('C', 'major', 'left', octaves).fingers.length).toBe(7 * octaves + 1)
    }
  })

  it('extends a black-key scale without dropping its opening finger', () => {
    expect(digits(scale('B♭', 'major', 'right', 2).fingers)).toBe('412312341231234')
  })
})

describe('crossings', () => {
  it('finds the thumb passing under in the right hand', () => {
    // C major RH: 1 2 3 | 1 2 3 4 5 — the thumb goes under at F, index 3.
    expect(scale('C', 'major', 'right').crossings).toEqual([3])
  })

  it('finds the hand crossing over in the left hand', () => {
    // C major LH ascending: 5 4 3 2 1 | 3 2 1 — the cross is after the thumb.
    expect(scale('C', 'major', 'left').crossings).toEqual([5])
  })

  it('finds every crossing in a two-octave scale', () => {
    // 1 2 3 [1] 2 3 4 [1] 2 3 [1] 2 3 4 5 — three thumb-unders, and the final
    // 5 is not one: the hand stops there rather than passing under again.
    expect(scale('C', 'major', 'right', 2).crossings).toEqual([3, 7, 10])
  })
})

function pitchClassOf(root: string): number {
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
  const letter = base[root[0]!]!
  const accidental = root.includes('♯') ? 1 : root.includes('♭') ? -1 : 0
  return (letter + accidental + 12) % 12
}

function isBlack(note: number): boolean {
  return [1, 3, 6, 8, 10].includes(((note % 12) + 12) % 12)
}

/**
 * Checked against The Complete Book of Scales, Chords, Arpeggios & Cadences
 * (Palmer, Manus & Lethco, Alfred, 1994) — its Guide to Fingering and its two
 * fingering charts. The extracted tables live in sites/piano-content.
 *
 * These are pinned by the degree the 4th finger falls on, which is how that
 * book indexes every scale, and it is the thing that was wrong: the two flat
 * minor left hands had been given their parallel major's shape, which puts the
 * 4th finger on the wrong note of the scale.
 */
describe('published fingerings', () => {
  /** Which degree of the octave the 4th finger lands on, 1-based. */
  const fourthOn = (root: string, type: string, hand: 'right' | 'left') =>
    scale(root, type, hand).fingers.indexOf(4) + 1

  it('places the left-hand 4th finger where the source does', () => {
    // Exceptions to "a major scale and its parallel harmonic minor are
    // fingered alike" — the source names exactly these two.
    expect(digits(scale('E♭', 'natural-minor', 'left').fingers)).toBe('21432132')
    expect(fourthOn('E♭', 'natural-minor', 'left')).toBe(3)

    expect(digits(scale('B♭', 'natural-minor', 'left').fingers)).toBe('21321432')
    expect(fourthOn('B♭', 'natural-minor', 'left')).toBe(6)
  })

  it('keeps G♯ minor on its own left hand', () => {
    // The one scale whose natural-minor LH differs from its harmonic minor:
    // the 4th finger sits on F♯, the 7th degree, not on C♯, the 4th.
    expect(digits(scale('G♯', 'natural-minor', 'left').fingers)).toBe('32132143')
    expect(fourthOn('G♯', 'natural-minor', 'left')).toBe(7)
  })

  it('agrees with the major chart', () => {
    expect(digits(scale('C', 'major', 'right').fingers)).toBe('12312345')
    expect(digits(scale('F', 'major', 'right').fingers)).toBe('12341234')
    expect(digits(scale('B', 'major', 'left').fingers)).toBe('43214321')
    expect(digits(scale('F♯', 'major', 'right').fingers)).toBe('23412312')
    expect(digits(scale('F♯', 'major', 'left').fingers)).toBe('43213214')
    expect(digits(scale('D♭', 'major', 'right').fingers)).toBe('23123412')
    expect(digits(scale('A♭', 'major', 'right').fingers)).toBe('34123123')
    expect(digits(scale('E♭', 'major', 'right').fingers)).toBe('31234123')
  })
})
