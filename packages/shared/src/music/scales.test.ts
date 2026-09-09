import { describe, expect, it } from 'vitest'
import { parsePitch } from './pitch.js'
import {
  degreeNumber,
  findScaleType,
  keySignatureOf,
  scaleFormula,
  scaleOffsets,
  SCALE_TYPES,
  spellScale,
  spellScaleFrom,
} from './scales.js'

const names = (pitchClass: number, typeId: string) =>
  spellScale(pitchClass, findScaleType(typeId)!)
    .notes.map((note) => note.name)
    .join(' ')

describe('the scale table', () => {
  it('has step patterns that add up to an octave', () => {
    for (const type of SCALE_TYPES) {
      const total = type.steps.reduce((sum, step) => sum + step, 0)
      expect(total, type.name).toBe(12)
    }
  })

  it('has one degree label per note', () => {
    for (const type of SCALE_TYPES) {
      expect(type.degrees.length, type.name).toBe(type.steps.length)
    }
  })

  it('has degree labels that agree with the step pattern', () => {
    // The two describe the same scale from different directions. If they ever
    // disagree, the notes and the degrees printed under them are both wrong,
    // and nothing else in the app would notice.
    const MAJOR_OFFSETS = [0, 2, 4, 5, 7, 9, 11]
    for (const type of SCALE_TYPES) {
      const offsets = scaleOffsets(type)
      type.degrees.forEach((degree, i) => {
        const number = degreeNumber(degree)
        const flats = (degree.match(/♭/g) ?? []).length
        const sharps = (degree.match(/♯/g) ?? []).length
        const expected = MAJOR_OFFSETS[(number - 1) % 7]! + 12 * Math.floor((number - 1) / 7)
        expect(offsets[i], `${type.name} degree ${degree}`).toBe(expected - flats + sharps)
      })
    }
  })

  it('has unique ids', () => {
    const ids = SCALE_TYPES.map((type) => type.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('scaleFormula', () => {
  it('prints the W/H pattern a method book prints', () => {
    expect(scaleFormula(findScaleType('major')!)).toBe('W W H W W W H')
    expect(scaleFormula(findScaleType('natural-minor')!)).toBe('W H W W H W W')
  })

  it('names the augmented second in harmonic minor rather than calling it a whole step', () => {
    expect(scaleFormula(findScaleType('harmonic-minor')!)).toBe('W H W W H W+H H')
  })
})

describe('spelling', () => {
  it('spells the scales everyone knows', () => {
    expect(names(0, 'major')).toBe('C D E F G A B')
    expect(names(9, 'natural-minor')).toBe('A B C D E F G')
    expect(names(7, 'major')).toBe('G A B C D E F♯')
    expect(names(5, 'major')).toBe('F G A B♭ C D E')
  })

  it('runs the letters in order, never repeating or skipping one', () => {
    // The rule that separates real spelling from a pitch-class lookup: E♭ major
    // is E♭ F G A♭ B♭ C D, not D♯ F G G♯ A♯ C D.
    for (const typeId of ['major', 'natural-minor', 'harmonic-minor', 'dorian', 'lydian']) {
      for (let pitchClass = 0; pitchClass < 12; pitchClass++) {
        const letters = spellScale(pitchClass, findScaleType(typeId)!).notes.map((n) => n.letter)
        expect(new Set(letters).size, `${pitchClass} ${typeId}`).toBe(7)
      }
    }
  })

  it('picks the root a musician would write', () => {
    // Five flats beats seven sharps.
    expect(names(1, 'major')).toBe('D♭ E♭ F G♭ A♭ B♭ C')
    // Four sharps beats eight flats, so the same pitch class flips for minor.
    expect(names(1, 'natural-minor')).toBe('C♯ D♯ E F♯ G♯ A B')
    expect(names(10, 'natural-minor')).toBe('B♭ C D♭ E♭ F G♭ A♭')
    expect(names(3, 'major')).toBe('E♭ F G A♭ B♭ C D')
  })

  it('never needs more than a double accidental', () => {
    for (const type of SCALE_TYPES) {
      for (let pitchClass = 0; pitchClass < 12; pitchClass++) {
        for (const note of spellScale(pitchClass, type).notes) {
          expect(Math.abs(note.accidental), `${note.name} in ${type.name}`).toBeLessThanOrEqual(2)
        }
      }
    }
  })

  it('writes the double sharp harmonic minor actually needs', () => {
    // G♯ harmonic minor really is G♯ A♯ B C♯ D♯ E F𝄪. The seventh is a raised
    // seventh, so it takes the seventh letter — F — and raising F♯ gives F𝄪.
    // Calling it G♮ would be a flattened octave, which is a different degree.
    // A speller that avoids double accidentals on principle gets this wrong.
    expect(names(8, 'harmonic-minor')).toBe('G♯ A♯ B C♯ D♯ E F𝄪')
  })

  it('keeps every seven-note scale free of double accidentals where one is avoidable', () => {
    // Major and the modes never need one; only the raised degrees of harmonic
    // and melodic minor do, and only on the sharpest roots.
    for (const typeId of ['major', 'natural-minor', 'dorian', 'phrygian', 'lydian', 'mixolydian']) {
      for (let pitchClass = 0; pitchClass < 12; pitchClass++) {
        for (const note of spellScale(pitchClass, findScaleType(typeId)!).notes) {
          expect(Math.abs(note.accidental), `${note.name} in ${typeId}`).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('sounds the pitches the step pattern asks for, whatever it calls them', () => {
    for (const type of SCALE_TYPES) {
      for (let pitchClass = 0; pitchClass < 12; pitchClass++) {
        const scale = spellScale(pitchClass, type)
        const offsets = scaleOffsets(type)
        scale.notes.forEach((note, i) => {
          expect(note.pitchClass).toBe((pitchClass + offsets[i]!) % 12)
        })
      }
    }
  })

  it('spells the blues scale with its traditional repeated letter', () => {
    // C blues is C E♭ F G♭ G B♭: the ♭5 and the 5 share the letter G, which is
    // how it is written and what a naive pitch-class speller gets wrong.
    expect(names(0, 'blues')).toBe('C E♭ F G♭ G B♭')
  })

  it('keeps pentatonic degrees on their own letters', () => {
    expect(names(0, 'major-pentatonic')).toBe('C D E G A')
    expect(names(9, 'minor-pentatonic')).toBe('A C D E G')
  })

  it('agrees with parsePitch', () => {
    for (const name of ['C', 'F♯', 'B♭', 'E♭', 'A']) {
      expect(parsePitch(name)?.name).toBe(name)
    }
  })
})

describe('naming the enharmonic keys', () => {
  it('names the tied keys the way the reference books print them', () => {
    // Six sharps or six flats: F♯ major, and E♭ minor.
    expect(spellScale(6, findScaleType('major')!).root.name).toBe('F♯')
    expect(spellScale(3, findScaleType('natural-minor')!).root.name).toBe('E♭')
    expect(spellScale(3, findScaleType('harmonic-minor')!).root.name).toBe('E♭')
    // And the scales built on a minor follow the minor.
    expect(spellScale(3, findScaleType('blues')!).root.name).toBe('E♭')
    expect(spellScale(3, findScaleType('minor-pentatonic')!).root.name).toBe('E♭')
  })

  it('still names G♯ minor by its five sharps, double sharp and all', () => {
    expect(names(8, 'harmonic-minor')).toBe('G♯ A♯ B C♯ D♯ E F𝄪')
    expect(names(8, 'natural-minor')).toBe('G♯ A♯ B C♯ D♯ E F♯')
  })

  it('respells the blues scale’s flattened fifth off a double flat', () => {
    expect(names(3, 'blues')).toBe('E♭ G♭ A♭ A B♭ D♭')
    expect(names(1, 'blues')).toBe('C♯ E F♯ G G♯ B')
    expect(names(5, 'blues')).toBe('F A♭ B♭ C♭ C E♭')
  })

  it('spells the chromatic scale in flats on the way down', () => {
    const type = findScaleType('chromatic')!
    const down = spellScaleFrom(spellScale(0, type).root, type, type.descendingDegrees)!
    expect(down.notes.map((n) => n.name).join(' ')).toBe('C D♭ D E♭ E F G♭ G A♭ A B♭ B')
  })
})

describe('key signatures', () => {
  const fifths = (pitchClass: number, typeId: string) =>
    keySignatureOf(spellScale(pitchClass, findScaleType(typeId)!))

  it('reads the major keys off the circle of fifths', () => {
    expect([0, 7, 2, 9, 4, 11, 6].map((pc) => fifths(pc, 'major'))).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect([5, 10, 3, 8, 1].map((pc) => fifths(pc, 'major'))).toEqual([-1, -2, -3, -4, -5])
  })

  it('gives every minor its relative major’s signature', () => {
    expect(fifths(9, 'natural-minor')).toBe(0)
    expect(fifths(9, 'harmonic-minor')).toBe(0)
    expect(fifths(9, 'melodic-minor')).toBe(0)
    expect(fifths(8, 'harmonic-minor')).toBe(5) // G♯ minor
    expect(fifths(3, 'natural-minor')).toBe(-6) // E♭ minor
  })

  it('gives a mode the signature of its parent major', () => {
    expect(fifths(2, 'dorian')).toBe(0) // D dorian is C major's notes
    expect(fifths(4, 'phrygian')).toBe(0)
    expect(fifths(5, 'lydian')).toBe(0)
    expect(fifths(7, 'mixolydian')).toBe(0)
    expect(fifths(11, 'locrian')).toBe(0)
    expect(fifths(9, 'dorian')).toBe(1) // A dorian is G major's
  })

  it('has none for the scales no signature fits', () => {
    expect(fifths(0, 'chromatic')).toBeNull()
    expect(fifths(0, 'whole-tone')).toBeNull()
  })
})
