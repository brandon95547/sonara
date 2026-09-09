import { describe, expect, it } from 'vitest'
import {
  AccidentalMemory,
  accidentalToShow,
  keyAccidental,
  keySignature,
  needsAccidental,
  splitRest,
  splitSpan,
  stemDirection,
  writtenFromQuarters,
  writtenValue,
} from './notation.js'
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

  it('points down from the middle line itself', () => {
    // B4 on the treble and D3 on the bass: the convention every manual gives.
    expect(stemDirection([staffPlacement(71)])).toBe('down')
    expect(stemDirection([staffPlacement(50)])).toBe('down')
    // And a chord reaching equally far both ways.
    expect(stemDirection([69, 74].map((n) => staffPlacement(n)))).toBe('down')
  })

  it('lets the note furthest from the line decide a chord', () => {
    // One stem serves a chord. A chord with a stem per note is not a chord.
    expect(stemDirection([72, 76, 79].map((n) => staffPlacement(n)))).toBe('down') // all above B4
    expect(stemDirection([60, 64, 67].map((n) => staffPlacement(n)))).toBe('up') // all below

    // And where a chord straddles the line it is the outer reach that decides,
    // not the count: C4 sits six steps under B4 and G5 only five over it, so
    // the stem goes up even though two of the three notes are high.
    expect(stemDirection([60, 76, 79].map((n) => staffPlacement(n)))).toBe('up')
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

describe('accidentals in a key', () => {
  it('knows what the signature already says', () => {
    expect(keyAccidental(3, 2)).toBe(1) // F in D major
    expect(keyAccidental(6, -1)).toBe(-1) // B in F major
    expect(keyAccidental(6, 2)).toBe(0) // B in D major
  })

  it('prints a flat as a flat and a natural as a natural', () => {
    // B♭ in C major needs its flat; in F major the signature covers it.
    const bFlat = staffPlacement(70, { letter: 6, accidental: -1 })
    expect(accidentalToShow(bFlat, 0)).toBe(-1)
    expect(accidentalToShow(bFlat, -1)).toBeNull()
    // F♮ in D major has to say so, or it reads as the F♯ the signature gives.
    const fNatural = staffPlacement(65, { letter: 3, accidental: 0 })
    expect(accidentalToShow(fNatural, 2)).toBe(0)
    expect(accidentalToShow(fNatural, 0)).toBeNull()
  })

  it('remembers an accidental for the rest of the bar, and no further', () => {
    const memory = new AccidentalMemory(0)
    const fSharp = staffPlacement(66, { letter: 3, accidental: 1 })
    const fNatural = staffPlacement(65, { letter: 3, accidental: 0 })
    memory.startBar()
    expect(memory.printFor(fSharp)).toBe(1) // first F♯ prints its sharp
    expect(memory.printFor(fSharp)).toBeNull() // second one is covered
    expect(memory.printFor(fNatural)).toBe(0) // back to natural has to say so
    memory.startBar()
    expect(memory.printFor(fSharp)).toBe(1) // a new bar forgets
  })

  it('keeps the memory per octave', () => {
    const memory = new AccidentalMemory(0)
    memory.startBar()
    expect(memory.printFor(staffPlacement(66, { letter: 3, accidental: 1 }))).toBe(1)
    // The F♯ an octave up is a different note and prints its own.
    expect(memory.printFor(staffPlacement(78, { letter: 3, accidental: 1 }))).toBe(1)
  })

  it('starts each bar from the signature', () => {
    const memory = new AccidentalMemory(2) // D major
    memory.startBar()
    expect(memory.printFor(staffPlacement(66, { letter: 3, accidental: 1 }))).toBeNull()
    expect(memory.printFor(staffPlacement(65, { letter: 3, accidental: 0 }))).toBe(0)
    expect(memory.printFor(staffPlacement(66, { letter: 3, accidental: 1 }))).toBe(1)
  })
})

describe('writing durations', () => {
  const pieces = (startQ: number, quarters: number, beatQ = 1, barQ = 4) =>
    splitSpan(startQ, quarters, beatQ, barQ).map(
      (piece) => `${piece.value}${'.'.repeat(piece.dots)}`,
    )

  it('writes a length one value can write as that value', () => {
    expect(writtenFromQuarters(1)).toMatchObject({ value: 'quarter', dots: 0 })
    expect(writtenFromQuarters(1.5)).toMatchObject({ value: 'quarter', dots: 1 })
    expect(writtenFromQuarters(1.75)).toMatchObject({ value: 'quarter', dots: 2 })
    expect(writtenFromQuarters(1.25)).toBeNull()
    expect(pieces(0, 2)).toEqual(['half'])
    expect(pieces(1, 2)).toEqual(['half'])
    expect(pieces(0, 3)).toEqual(['half.'])
  })

  it('allows a syncopation inside the half bar and ties across it', () => {
    // A crotchet from the second quaver of 4/4 is an ordinary syncopation.
    expect(pieces(0.5, 1)).toEqual(['quarter'])
    // The same crotchet from the quaver before the half bar crosses it, and
    // is written quaver tied to quaver so the half bar stays visible.
    expect(pieces(1.5, 1)).toEqual(['eighth', 'eighth'])
    // A minim from the second quaver: quaver, then a dotted crotchet.
    expect(pieces(0.5, 2)).toEqual(['eighth', 'quarter.'])
  })

  it('ties across the beat in compound time', () => {
    // 6/8: a crotchet from the third quaver crosses the dotted-crotchet beat.
    expect(splitSpan(1, 1, 1.5, 3).map((p) => p.value)).toEqual(['eighth', 'eighth'])
    // From the second quaver it stays inside the beat and is a crotchet.
    expect(splitSpan(0.5, 1, 1.5, 3).map((p) => p.value)).toEqual(['quarter'])
  })

  it('writes what one value cannot as tied values, longest first', () => {
    // Five crotchets: a semibreve tied to a crotchet.
    expect(pieces(0, 5)).toEqual(['whole', 'quarter'])
    // A crotchet and a semiquaver.
    expect(pieces(0, 1.25)).toEqual(['quarter', 'sixteenth'])
  })

  it('snaps a played length to the demisemiquaver grid', () => {
    expect(pieces(0, 0.98)).toEqual(['quarter'])
    expect(pieces(0, 0.51)).toEqual(['eighth'])
  })

  it('writes a whole bar of silence as one rest', () => {
    expect(splitRest(0, 3, 1, 3).map((p) => p.value)).toEqual(['whole'])
    expect(splitRest(0, 4, 1, 4).map((p) => p.value)).toEqual(['whole'])
  })

  it('keeps rests on the beat', () => {
    const rests = (startQ: number, quarters: number) =>
      splitRest(startQ, quarters, 1, 4).map((piece) => `${piece.value}${'.'.repeat(piece.dots)}`)
    // Beats two and three of 4/4 empty: two crotchet rests, not a minim rest
    // hiding where beat three fell.
    expect(rests(1, 2)).toEqual(['quarter', 'quarter'])
    // Beats one and two empty: a minim rest is conventional.
    expect(rests(0, 2)).toEqual(['half'])
    // Off the beat: fill to the beat, then by the beat.
    expect(rests(0.5, 1.5)).toEqual(['eighth', 'quarter'])
  })
})
