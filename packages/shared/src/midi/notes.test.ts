import { describe, expect, it } from 'vitest'
import {
  countWhiteKeys,
  isBlackKey,
  noteFrequency,
  noteName,
  octaveOf,
  pitchClass,
  snapRangeToWhiteKeys,
  whiteKeyIndex,
} from './notes.js'

describe('note naming', () => {
  it('places middle C at note 60', () => {
    expect(noteName(60)).toBe('C4')
    expect(octaveOf(60)).toBe(4)
  })

  it('names the ends of an 88-key piano', () => {
    expect(noteName(21)).toBe('A0')
    expect(noteName(108)).toBe('C8')
  })

  it('renders flats on request', () => {
    expect(noteName(61)).toBe('C#4')
    expect(noteName(61, 'flat')).toBe('Db4')
  })

  it('keeps pitch class non-negative below C-1', () => {
    expect(pitchClass(-1)).toBe(11)
  })
})

describe('key colour', () => {
  it('marks the five black keys of an octave', () => {
    const black = [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71].filter(isBlackKey)
    expect(black).toEqual([61, 63, 66, 68, 70])
  })
})

describe('frequency', () => {
  it('puts A4 at 440Hz', () => {
    expect(noteFrequency(69)).toBeCloseTo(440, 6)
  })

  it('doubles an octave up', () => {
    expect(noteFrequency(81)).toBeCloseTo(880, 6)
  })

  it('honours a different concert pitch', () => {
    expect(noteFrequency(69, 415)).toBeCloseTo(415, 6)
  })
})

describe('keyboard geometry', () => {
  it('counts 52 white keys on an 88-key piano', () => {
    expect(countWhiteKeys(21, 108)).toBe(52)
  })

  it('indexes white keys from the start of the range', () => {
    expect(whiteKeyIndex(60, 60)).toBe(0)
    expect(whiteKeyIndex(62, 60)).toBe(1)
    // A black key shares the index of the white key below it.
    expect(whiteKeyIndex(61, 60)).toBe(0)
  })

  it('snaps a range onto white keys at both ends', () => {
    expect(snapRangeToWhiteKeys(61, 70)).toEqual({ low: 60, high: 71 })
  })

  it('leaves an already-white range alone', () => {
    expect(snapRangeToWhiteKeys(21, 108)).toEqual({ low: 21, high: 108 })
  })
})
