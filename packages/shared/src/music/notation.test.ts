import { describe, expect, it } from 'vitest'
import { keySignature, needsAccidental, stemDirection, writtenValue } from './notation.js'
import { staffPlacement } from './staff.js'

describe('written values', () => {
  const beat = 500 // a crotchet at 120bpm

  it('names the ordinary lengths', () => {
    expect(writtenValue(2000, beat)).toMatchObject({
      value: 'whole',
      filled: false,
      stemmed: false,
    })
    expect(writtenValue(1000, beat)).toMatchObject({ value: 'half', filled: false, flags: 0 })
    expect(writtenValue(500, beat)).toMatchObject({ value: 'quarter', filled: true, flags: 0 })
    expect(writtenValue(250, beat)).toMatchObject({ value: 'eighth', filled: true, flags: 1 })
    expect(writtenValue(125, beat)).toMatchObject({ value: 'sixteenth', filled: true, flags: 2 })
  })

  it('finds the dotted ones', () => {
    expect(writtenValue(750, beat)).toMatchObject({ value: 'quarter', dotted: true })
    expect(writtenValue(1500, beat)).toMatchObject({ value: 'half', dotted: true })
    expect(writtenValue(375, beat)).toMatchObject({ value: 'eighth', dotted: true })
  })

  it('matches a played length to the nearest written one', () => {
    // A performance is not a score. Somebody holding a crotchet for 92% of its
    // length has played a crotchet, and a file full of them should not come
    // back as a page of dotted quavers.
    expect(writtenValue(460, beat).value).toBe('quarter')
    expect(writtenValue(540, beat).value).toBe('quarter')
    expect(writtenValue(230, beat).value).toBe('eighth')
  })

  it('survives nonsense rather than drawing it', () => {
    expect(writtenValue(0, beat).value).toBe('quarter')
    expect(writtenValue(500, 0).value).toBe('quarter')
  })
})

describe('stems', () => {
  it('points away from the middle line', () => {
    // Treble's middle line is B4, bass's is D3.
    expect(stemDirection([staffPlacement(72)])).toBe('down') // C5, above
    expect(stemDirection([staffPlacement(60)])).toBe('up') // middle C, below
    expect(stemDirection([staffPlacement(48)])).toBe('up') // C3, below D3
    expect(stemDirection([staffPlacement(57)])).toBe('down') // A3, above D3
  })

  it('lets the note furthest from the line decide a chord', () => {
    // One stem serves a chord. A chord with a stem per note is not a chord.
    expect(stemDirection([72, 76, 79].map(staffPlacement))).toBe('down') // all above B4
    expect(stemDirection([60, 64, 67].map(staffPlacement))).toBe('up') // all below

    // And where a chord straddles the line it is the outer reach that decides,
    // not the count: C4 sits six steps under B4 and G5 only five over it, so
    // the stem goes up even though two of the three notes are high.
    expect(stemDirection([60, 76, 79].map(staffPlacement))).toBe('up')
  })
})

describe('key signatures', () => {
  it('writes sharps in the order they are always written', () => {
    // F♯ on the top line of the treble, then C♯ in the third space.
    expect(keySignature(2, 'treble').map((mark) => mark.steps)).toEqual([10, 7])
    expect(keySignature(2, 'treble').every((mark) => mark.sign === '♯')).toBe(true)
    // The bass writes the same signature seven letter-steps lower.
    expect(keySignature(2, 'bass').map((mark) => mark.steps)).toEqual([-4, -7])
  })

  it('writes flats in theirs', () => {
    expect(keySignature(-2, 'treble').map((mark) => mark.steps)).toEqual([6, 9])
    expect(keySignature(-2, 'bass').map((mark) => mark.steps)).toEqual([-8, -5])
    expect(keySignature(-1, 'treble')[0]!.sign).toBe('♭')
  })

  it('never writes more than seven', () => {
    expect(keySignature(9, 'treble')).toHaveLength(7)
    expect(keySignature(0, 'treble')).toHaveLength(0)
  })

  it('spares a note the accidental its key already carries', () => {
    // D major has F♯ and C♯ in the signature, so neither is written again.
    expect(needsAccidental(66, 2)).toBe(false) // F♯
    expect(needsAccidental(61, 2)).toBe(false) // C♯
    // G♯ is not in D major, so it carries its own.
    expect(needsAccidental(68, 2)).toBe(true)
    // And in C major everything black carries its own.
    expect(needsAccidental(66, 0)).toBe(true)
    expect(needsAccidental(60, 0)).toBe(false)
  })
})
