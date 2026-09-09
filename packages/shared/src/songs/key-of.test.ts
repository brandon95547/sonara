import { describe, expect, it } from 'vitest'
import { estimateKey, fifthsForKeyName, fifthsForTonic, keyName, tonicForFifths } from './key-of.js'

const hold = (note: number, durationMs = 500) => ({ note, durationMs })
/** A scale, held evenly — the clearest possible statement of a key. */
const scale = (tonic: number, steps: number[]) => steps.map((offset) => hold(60 + tonic + offset))

const MAJOR = [0, 2, 4, 5, 7, 9, 11]
const NATURAL_MINOR = [0, 2, 3, 5, 7, 8, 10]

describe('naming a key from its signature', () => {
  it('reads sharps and flats the way a score writes them', () => {
    expect(keyName({ pitchClass: 0, mode: 'major', fifths: 0, declared: true })).toBe('C major')
    expect(keyName({ pitchClass: 7, mode: 'major', fifths: 1, declared: true })).toBe('G major')
    expect(keyName({ pitchClass: 10, mode: 'major', fifths: -2, declared: true })).toBe('B♭ major')
    // The same signature, named from its relative minor.
    expect(keyName({ pitchClass: 9, mode: 'minor', fifths: 0, declared: true })).toBe('A minor')
    expect(keyName({ pitchClass: 4, mode: 'minor', fifths: 1, declared: true })).toBe('E minor')
  })

  it('writes a key with as few accidentals as it can', () => {
    for (let fifths = -7; fifths <= 7; fifths++) {
      const tonic = tonicForFifths(fifths, 'major')
      const written = fifthsForTonic(tonic, 'major')
      // Same sounding key...
      expect(tonicForFifths(written, 'major')).toBe(tonic)
      // ...spelled no worse than the signature it came from.
      expect(Math.abs(written)).toBeLessThanOrEqual(Math.abs(fifths))
    }
    // The specific case: C♭ major is B major, which nobody writes with seven flats.
    expect(fifthsForTonic(tonicForFifths(-7, 'major'), 'major')).toBe(5)
    expect(keyName({ pitchClass: 11, mode: 'major', fifths: 5, declared: true })).toBe('B major')
  })
})

describe('estimating a key from the notes', () => {
  it('hears a major scale as its own key', () => {
    for (const tonic of [0, 2, 5, 7, 10]) {
      const key = estimateKey(scale(tonic, MAJOR))!
      expect(key.pitchClass).toBe(tonic)
      expect(key.mode).toBe('major')
    }
  })

  it('tells a minor key from its relative major', () => {
    // The same seven notes. Only the weighting separates them, which is the
    // whole reason a profile is used instead of counting accidentals.
    const aMinor = estimateKey([...scale(9, NATURAL_MINOR), hold(57, 3000), hold(69, 2000)])!
    expect(aMinor.pitchClass).toBe(9)
    expect(aMinor.mode).toBe('minor')
  })

  it('weighs how long a note sounds, not how often it is struck', () => {
    // Eight quick Bs against one long C: the C is the tonic.
    const notes = [
      ...Array(8)
        .fill(0)
        .map(() => hold(71, 40)),
      hold(60, 4000),
      hold(64, 2000),
      hold(67, 2000),
    ]
    expect(estimateKey(notes)!.pitchClass).toBe(0)
  })

  it('says it is an estimate, so nothing can print it as fact', () => {
    expect(estimateKey(scale(0, MAJOR))!.declared).toBe(false)
  })

  it('returns nothing rather than guessing from silence', () => {
    expect(estimateKey([])).toBeNull()
  })

  it('gives a key it can write down', () => {
    for (const tonic of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
      const key = estimateKey(scale(tonic, MAJOR))!
      expect(key.fifths).toBeGreaterThanOrEqual(-7)
      expect(key.fifths).toBeLessThanOrEqual(7)
      expect(keyName(key)).toMatch(/major|minor/)
    }
  })
})

describe('the tied keys', () => {
  it('names them the way the scales do', () => {
    // Six of one: F♯ major on the sharp side, E♭ minor on the flat side, so a
    // song and a scale on the same pitch class print the same name.
    expect(
      keyName({ pitchClass: 6, mode: 'major', fifths: fifthsForTonic(6, 'major'), declared: true }),
    ).toBe('F♯ major')
    expect(
      keyName({ pitchClass: 3, mode: 'minor', fifths: fifthsForTonic(3, 'minor'), declared: true }),
    ).toBe('E♭ minor')
    // And the untied ones are untouched.
    expect(fifthsForTonic(1, 'major')).toBe(-5)
    expect(fifthsForTonic(1, 'minor')).toBe(4)
    expect(fifthsForTonic(8, 'minor')).toBe(5)
  })
})

describe('reading a key name from a MIDI file', () => {
  it('reads flats, sharps and both spellings of the symbols', () => {
    expect(fifthsForKeyName('Bb')).toBe(-2)
    expect(fifthsForKeyName('B♭')).toBe(-2)
    expect(fifthsForKeyName('F#')).toBe(6)
    expect(fifthsForKeyName('F♯')).toBe(6)
    expect(fifthsForKeyName('C')).toBe(0)
    expect(fifthsForKeyName('Cb')).toBe(-7)
    expect(fifthsForKeyName('H')).toBeNull()
  })

  it('turns a signature and a minor flag into the minor key, not the major’s', () => {
    // An SMF key signature of no sharps, minor, is A minor. Read as "C minor"
    // it would be three flats.
    expect(tonicForFifths(fifthsForKeyName('C')!, 'minor')).toBe(9)
    expect(tonicForFifths(fifthsForKeyName('Eb')!, 'minor')).toBe(0) // C minor
  })
})
