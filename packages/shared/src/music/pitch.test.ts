import { describe, expect, it } from 'vitest'
import {
  accidentalFor,
  makePitch,
  parsePitch,
  pitchClassOfTpc,
  pitchToMidi,
  sharpSpelling,
  spellInKey,
  spellingFromTpc,
  spellingName,
  spellingsFor,
  tpcOf,
} from './pitch.js'

const name = (pitchClass: number, fifths: number, mode?: 'major' | 'minor') =>
  spellingName(spellInKey(pitchClass, fifths, mode))

describe('the line of fifths', () => {
  it('numbers the naturals the way MuseScore does', () => {
    expect(tpcOf({ letter: 0, accidental: 0 })).toBe(14) // C
    expect(tpcOf({ letter: 3, accidental: 0 })).toBe(13) // F
    expect(tpcOf({ letter: 3, accidental: 1 })).toBe(20) // F♯
    expect(tpcOf({ letter: 3, accidental: 2 })).toBe(27) // F𝄪
    expect(tpcOf({ letter: 6, accidental: -1 })).toBe(12) // B♭
  })

  it('reads a tonal pitch class back into a spelling', () => {
    for (let tpc = -1; tpc <= 33; tpc++) {
      const spelling = spellingFromTpc(tpc)!
      expect(tpcOf(spelling)).toBe(tpc)
      expect(pitchClassOfTpc(tpc)).toBe(makePitch(spelling.letter, spelling.accidental).pitchClass)
    }
    expect(spellingFromTpc(34)).toBeNull()
  })
})

describe('spelling a pitch in a key', () => {
  it('spells the notes of the key as its signature does', () => {
    // F major: B♭, not A♯.
    expect(name(10, -1)).toBe('B♭')
    // D major: F♯ and C♯.
    expect(name(6, 2)).toBe('F♯')
    expect(name(1, 2)).toBe('C♯')
    // E♭ major.
    expect([3, 8, 10].map((pc) => name(pc, -3))).toEqual(['E♭', 'A♭', 'B♭'])
  })

  it('spells the chromatic notes of C major the way a piece in C uses them', () => {
    expect([1, 3, 6, 8, 10].map((pc) => name(pc, 0))).toEqual(['C♯', 'E♭', 'F♯', 'A♭', 'B♭'])
  })

  it('gives a minor key its leading tone', () => {
    // A minor: G♯, never A♭. And F♯ for the raised sixth.
    expect(name(8, 0, 'minor')).toBe('G♯')
    expect(name(6, 0, 'minor')).toBe('F♯')
    // D minor: C♯.
    expect(name(1, -1, 'minor')).toBe('C♯')
  })

  it('lets the direction of a chromatic step decide a close call', () => {
    // C C♯ D going up; D D♭ C coming down.
    expect(spellingName(spellInKey(1, 0, 'major', 'up'))).toBe('C♯')
    expect(spellingName(spellInKey(1, 0, 'major', 'down'))).toBe('D♭')
    // But not a clear one: B♭ in C major stays B♭ whichever way the line goes.
    expect(spellingName(spellInKey(10, 0, 'major', 'up'))).toBe('B♭')
  })

  it('never writes a double accidental in a major key of six or fewer', () => {
    // B major borrows G♮, it does not raise F𝄪. Only the seven-accidental
    // keys reach for one: C♯ major's raised fourth really is F𝄪, and C♭
    // major's lowered seventh really is B𝄫.
    for (let fifths = -6; fifths <= 6; fifths++) {
      for (let pc = 0; pc < 12; pc++) {
        expect(Math.abs(spellInKey(pc, fifths, 'major').accidental)).toBeLessThanOrEqual(1)
      }
    }
    expect(name(7, 7)).toBe('F𝄪')
    expect(name(7, 6)).toBe('G')
  })

  it('writes the leading tone of a sharp minor key as the double sharp it is', () => {
    expect(name(7, 5, 'minor')).toBe('F𝄪') // G♯ minor
    expect(name(2, 6, 'minor')).toBe('C𝄪') // D♯ minor
    // And nothing else doubles: every other note of G♯ minor is single.
    for (let pc = 0; pc < 12; pc++) {
      if (pc === 7) continue
      expect(Math.abs(spellInKey(pc, 5, 'minor').accidental)).toBeLessThanOrEqual(1)
    }
  })

  it('falls back to sharps when nothing has spelled a note', () => {
    expect(spellingName(sharpSpelling(1))).toBe('C♯')
    expect(spellingName(sharpSpelling(10))).toBe('A♯')
    expect(spellingName(sharpSpelling(4))).toBe('E')
  })
})

describe('the older helpers', () => {
  it('turns a letter into a pitch class with the right accidental', () => {
    expect(accidentalFor(0, 11)).toBe(-1) // C♭
    expect(accidentalFor(6, 0)).toBe(1) // B♯
    expect(accidentalFor(0, 3)).toBeNull()
  })

  it('lists every single-accidental spelling of a pitch', () => {
    expect(spellingsFor(0).map((p) => p.name)).toEqual(['C', 'B♯'])
    expect(spellingsFor(1).map((p) => p.name)).toEqual(['C♯', 'D♭'])
  })

  it('parses names and puts them in an octave', () => {
    expect(pitchToMidi(parsePitch('B#')!, 3)).toBe(60)
    expect(pitchToMidi(parsePitch('Cb')!, 4)).toBe(59)
    expect(pitchToMidi(parsePitch('A')!, 4)).toBe(69)
  })
})
