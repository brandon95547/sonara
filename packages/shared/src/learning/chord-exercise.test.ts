import { describe, expect, it } from 'vitest'
import { isBlackKey, noteName } from '../midi/notes.js'
import { KEY_MODES, keyChord } from '../music/chords.js'
import {
  buildArpeggioExercise,
  buildChordExercise,
  DEFAULT_ARPEGGIO_SPEC,
  DEFAULT_CHORD_SPEC,
  type ArpeggioSpec,
  type ChordSpec,
} from './chord-exercise.js'

const chords = (spec: Partial<ChordSpec> = {}) =>
  buildChordExercise({ ...DEFAULT_CHORD_SPEC, ...spec })
const arpeggio = (spec: Partial<ArpeggioSpec> = {}) =>
  buildArpeggioExercise({ ...DEFAULT_ARPEGGIO_SPEC, direction: 'up', ...spec })

/** One hand's fingers, a group of digits per step. */
const fingersOf = (exercise: ReturnType<typeof chords>, hand: 'right' | 'left') =>
  exercise.steps.map((step) =>
    step.fingers
      .filter((finger) => finger.hand === hand)
      .map((finger) => finger.finger)
      .join(''),
  )

describe('the chords of a key', () => {
  const tones = (...args: Parameters<typeof keyChord>) =>
    keyChord(...args)
      .tones.map((tone) => tone.name)
      .join(' ')

  it('takes the triad from the key’s own scale', () => {
    expect(tones(0, 'major', 'triad')).toBe('C E G')
    expect(tones(9, 'minor', 'triad')).toBe('A C E')
    expect(tones(3, 'major', 'triad')).toBe('E♭ G B♭')
    expect(keyChord(9, 'minor', 'triad').symbol).toBe('Am')
  })

  it('builds the dominant seventh on the fifth of a major key', () => {
    expect(tones(0, 'major', 'seventh')).toBe('G B D F')
    expect(keyChord(0, 'major', 'seventh').symbol).toBe('G7')
    expect(tones(6, 'major', 'seventh')).toBe('C♯ E♯ G♯ B')
    expect(tones(1, 'major', 'seventh')).toBe('A♭ C E♭ G♭')
  })

  it('builds the diminished seventh on the raised seventh of a minor key', () => {
    expect(tones(9, 'minor', 'seventh')).toBe('G♯ B D F')
    expect(keyChord(9, 'minor', 'seventh').symbol).toBe('G♯°7')
    expect(tones(0, 'minor', 'seventh')).toBe('B D F A♭')
    // The book's D♯ minor, double sharp and all — and E♭ minor when asked.
    expect(tones(3, 'minor', 'seventh')).toBe('C𝄪 E♯ G♯ B')
    expect(tones(3, 'minor', 'seventh', 'E♭')).toBe('D F A♭ C♭')
  })
})

/**
 * Chords solid and broken, as the Brown Scale Book prints them under every
 * key — and fingers them, identically, in every key.
 */
describe('chords, solid and broken', () => {
  it('plays a triad in root position, both inversions, and root position again', () => {
    const exercise = chords()
    expect(exercise.title).toBe('C Major Triads')
    expect(exercise.subtitle).toBe('Right Hand · Solid')
    expect(exercise.steps.map((step) => step.notes.map(noteName).join(' '))).toEqual([
      'C4 E4 G4',
      'E4 G4 C5',
      'G4 C5 E5',
      'C5 E5 G5',
    ])
    expect(exercise.steps.map((step) => step.cue)).toEqual([
      'Root position',
      '1st inversion',
      '2nd inversion',
      'Root position',
    ])
    expect(exercise.steps[1]!.label).toBe('E G C')
  })

  it('fingers the triads as printed', () => {
    expect(fingersOf(chords(), 'right')).toEqual(['135', '125', '135', '135'])
    expect(fingersOf(chords({ hand: 'left' }), 'left')).toEqual(['531', '531', '521', '531'])
  })

  it('adds the octave for the four-note form, and fingers that as printed', () => {
    const exercise = chords({ chord: 'four-note' })
    expect(exercise.steps[0]!.notes.map(noteName).join(' ')).toBe('C4 E4 G4 C5')
    expect(fingersOf(exercise, 'right')).toEqual(['1235', '1245', '1245', '1235'])
    expect(fingersOf(chords({ chord: 'four-note', hand: 'left' }), 'left')).toEqual([
      '5421',
      '5421',
      '5321',
      '5421',
    ])
  })

  it('plays the dominant seventh of a major key through its three inversions', () => {
    const exercise = chords({ chord: 'seventh' })
    expect(exercise.title).toBe('Dominant Seventh of C Major')
    expect(exercise.steps.map((step) => step.label)).toEqual([
      'G B D F',
      'B D F G',
      'D F G B',
      'F G B D',
    ])
    expect(exercise.steps.map((step) => step.cue).at(-1)).toBe('3rd inversion')
    expect(fingersOf(exercise, 'right')).toEqual(['1245', '1245', '1235', '1245'])
    expect(fingersOf(chords({ chord: 'seventh', hand: 'left' }), 'left')).toEqual([
      '5421',
      '5421',
      '5321',
      '5421',
    ])
  })

  it('plays the diminished seventh of a minor key, every position fingered alike', () => {
    const exercise = chords({ rootPitchClass: 9, mode: 'minor', chord: 'seventh' })
    expect(exercise.title).toBe('Diminished Seventh of A Minor')
    expect(fingersOf(exercise, 'right')).toEqual(['1245', '1245', '1245', '1245'])
    for (const step of exercise.steps) {
      // Minor thirds all the way up.
      expect(step.notes.slice(1).map((note, i) => note - step.notes[i]!)).toEqual([3, 3, 3])
    }
  })

  it('breaks each position upward, then each one back down from the top', () => {
    const exercise = chords({ style: 'broken' })
    expect(exercise.steps).toHaveLength(24)
    expect(exercise.steps.map((step) => step.label).join(' ')).toBe(
      'C E G E G C G C E C E G G E C E C G C G E G E C',
    )
    // The top note ends the way up and begins the way down.
    expect(exercise.steps[11]!.notes).toEqual(exercise.steps[12]!.notes)
    expect(fingersOf(exercise, 'right').join('')).toBe('135125135135531531521531')
    expect(fingersOf(chords({ style: 'broken', hand: 'left' }), 'left').join('')).toBe(
      '531531521531135125135135',
    )
    // The position is named as each shape begins.
    expect(exercise.steps.filter((step) => step.cue).map((step) => step.cue)).toHaveLength(8)
  })

  it('puts the left hand an octave below the right, each hand fingered as itself', () => {
    const exercise = chords({ hand: 'both' })
    expect(exercise.steps[0]!.notes.map(noteName).join(' ')).toBe('C3 E3 G3 C4 E4 G4')
    expect(exercise.steps[0]!.fingers.map((finger) => `${finger.hand[0]}${finger.finger}`)).toEqual(
      ['l5', 'l3', 'l1', 'r1', 'r3', 'r5'],
    )
    expect(exercise.steps[0]!.noteLabels).toEqual(['C', 'E', 'G', 'C', 'E', 'G'])
    expect(exercise.fingerings.map((fingering) => fingering.source)).toEqual([
      'standard',
      'standard',
    ])
  })

  it('stays on a 61-key keyboard in every key', () => {
    for (const mode of KEY_MODES) {
      for (let rootPitchClass = 0; rootPitchClass < 12; rootPitchClass++) {
        for (const chord of ['triad', 'four-note', 'seventh'] as const) {
          const notes = chords({ rootPitchClass, mode, chord, hand: 'both' }).notes
          const where = `${mode} pc ${rootPitchClass} ${chord}`
          expect(Math.min(...notes), where).toBeGreaterThanOrEqual(36)
          expect(Math.max(...notes), where).toBeLessThanOrEqual(96)
        }
      }
    }
  })
})

/**
 * Arpeggios, two octaves. These are fingered differently in every key — where
 * the thumb goes depends on which notes are black — so the book's page is a
 * table, and what is checked is both particular lines and what must be true of
 * every one of them.
 */
describe('arpeggios', () => {
  const fingers = (spec: Partial<ArpeggioSpec>, index = 0) =>
    arpeggio(spec)
      .steps.map((step) => step.fingers[index]!.finger)
      .join('')

  it('runs the chord up two octaves from the chosen position', () => {
    const exercise = arpeggio()
    expect(exercise.title).toBe('C Major Arpeggio')
    expect(exercise.subtitle).toBe('Right Hand · Root position · Up (Ascending)')
    expect(exercise.steps.map((step) => step.notes.map(noteName).join(''))).toEqual([
      'C4',
      'E4',
      'G4',
      'C5',
      'E5',
      'G5',
      'C6',
    ])
    expect(arpeggio({ position: 1 }).steps[0]!.label).toBe('E')
    expect(arpeggio({ position: 2 }).subtitle).toContain('2nd inversion')
  })

  it('comes back down the way it went up, without repeating the top note', () => {
    const exercise = arpeggio({ direction: 'up-down' })
    expect(exercise.steps).toHaveLength(13)
    const notes = exercise.steps.map((step) => step.notes[0]!)
    expect(notes.slice(6)).toEqual(notes.slice(0, 7).reverse())
  })

  it('fingers the white-key arpeggios as printed', () => {
    expect(fingers({})).toBe('1231235')
    expect(fingers({ position: 1 })).toBe('1241245')
    expect(fingers({ position: 2 })).toBe('1241245')
    expect(fingers({ hand: 'left' })).toBe('5421421')
    expect(fingers({ hand: 'left', position: 2 })).toBe('5321321')
  })

  it('moves the thumb off the black keys, as the page does', () => {
    // E♭ major: E♭ 2, G 1 — the thumb waits for the first white key.
    expect(fingers({ rootPitchClass: 3 })).toBe('2124124')
    expect(fingers({ rootPitchClass: 3, hand: 'left' })).toBe('2142142')
    // D major's first inversion starts on F♯.
    expect(fingers({ rootPitchClass: 2, position: 1 })).toBe('2124124')
    // B♭ minor, where the 3rd finger does the work of the 4th.
    expect(fingers({ rootPitchClass: 10, mode: 'minor' })).toBe('2312312')
    expect(fingers({ rootPitchClass: 10, mode: 'minor', hand: 'left' })).toBe('3213212')
    // F♯ major is all black keys, so it is fingered like C major.
    expect(fingers({ rootPitchClass: 6 })).toBe('1231235')
  })

  it('fingers the seventh arpeggios as printed', () => {
    const seventh = (spec: Partial<ArpeggioSpec>, hand: 'right' | 'left' = 'right') =>
      fingers({ chord: 'seventh', hand, ...spec })

    expect(arpeggio({ chord: 'seventh' }).title).toBe('Dominant Seventh Arpeggio of C Major')
    expect(arpeggio({ chord: 'seventh' }).steps).toHaveLength(9)
    // G7 lies on white keys in every position.
    for (const position of [0, 1, 2, 3]) {
      expect(seventh({ position })).toBe('123412345')
      expect(seventh({ position }, 'left')).toBe('543214321')
    }
    // E major's B7: D♯ F♯ A B opens 2 3 and passes the thumb to A.
    expect(seventh({ rootPitchClass: 4, position: 1 })).toBe('231234123')
    // B major's F♯7, root position: three black keys, then the thumb on E.
    expect(seventh({ rootPitchClass: 11 })).toBe('234123412')
    expect(seventh({ rootPitchClass: 11 }, 'left')).toBe('432143212')
    // A minor's diminished seventh from G♯.
    expect(seventh({ rootPitchClass: 9, mode: 'minor' })).toBe('212341234')
    // F minor, third position: the one place the page prints 2 4 1.
    expect(seventh({ rootPitchClass: 5, mode: 'minor', position: 2 })).toBe('241234123')
  })

  it('names which hand is crossing when both play', () => {
    const exercise = arpeggio({ hand: 'both' })
    expect(exercise.steps[0]!.notes).toEqual([48, 60])
    expect(exercise.steps[3]!.cue).toBe('Right: Thumb under')
    expect(exercise.steps[4]!.cue).toBe('Left: Cross over')
  })

  /**
   * Every arpeggio the book prints: 24 keys, the triad in three positions and
   * the seventh in four, either hand. 336 lines, all transcribed by eye — so
   * these are the things that would be wrong if a digit had been misread.
   */
  describe('every printed line', () => {
    const lines = KEY_MODES.flatMap((mode) =>
      Array.from({ length: 12 }, (_, rootPitchClass) => rootPitchClass).flatMap((rootPitchClass) =>
        (['triad', 'seventh'] as const).flatMap((chord) =>
          (chord === 'triad' ? [0, 1, 2] : [0, 1, 2, 3]).flatMap((position) =>
            (['right', 'left'] as const).map((hand) => {
              const exercise = arpeggio({ rootPitchClass, mode, chord, position, hand })
              return {
                where: `${exercise.title} / ${position} / ${hand}`,
                hand,
                exercise,
                notes: exercise.steps.map((step) => step.notes[0]!),
                fingers: exercise.steps.map((step) => step.fingers[0]!.finger),
              }
            }),
          ),
        ),
      ),
    )

    it('is a page of the book, not a suggestion', () => {
      expect(lines).toHaveLength(2 * 12 * 7 * 2)
      for (const { where, exercise } of lines) {
        expect(exercise.fingerings[0]!.source, where).toBe('standard')
      }
    })

    it('never asks one finger for two notes in a row', () => {
      for (const { where, fingers: line } of lines) {
        for (let i = 1; i < line.length; i++)
          expect(line[i], `${where} at ${i}`).not.toBe(line[i - 1])
      }
    })

    it('keeps the thumb on a white key wherever the chord has one', () => {
      for (const { where, notes, fingers: line } of lines) {
        if (notes.every((note) => isBlackKey(note))) continue
        line.forEach((finger, index) => {
          if (finger === 1)
            expect(isBlackKey(notes[index]!), `${where} thumb at ${index}`).toBe(false)
        })
      }
    })

    it('saves the little finger for the outer note', () => {
      for (const { where, hand, fingers: line } of lines) {
        const inside = hand === 'right' ? line.slice(0, -1) : line.slice(1)
        expect(inside, where).not.toContain(5)
      }
    })

    it('only ever moves on by passing the thumb, never by a finger jumping back', () => {
      // Going up, the right hand's fingers rise until the thumb passes under;
      // the left hand's fall until the hand crosses over the thumb.
      for (const { where, hand, fingers: line } of lines) {
        for (let i = 1; i < line.length; i++) {
          const [from, to] = hand === 'right' ? [line[i - 1]!, line[i]!] : [line[i]!, line[i - 1]!]
          if (to < from) expect(to, `${where} at ${i}`).toBe(1)
        }
      }
    })
  })

  it('plays an enharmonic key from the page that lies under the same keys', () => {
    const sharp = arpeggio({ rootPitchClass: 3, mode: 'minor' })
    const flat = arpeggio({ rootPitchClass: 3, mode: 'minor', tonic: 'E♭' })
    expect(sharp.title).toBe('D♯ Minor Arpeggio')
    expect(flat.title).toBe('E♭ Minor Arpeggio')
    expect(flat.steps.map((step) => step.label).slice(0, 3)).toEqual(['E♭', 'G♭', 'B♭'])
    expect(flat.notes).toEqual(sharp.notes)
    expect(flat.fingerings[0]).toEqual(sharp.fingerings[0])
  })

  it('stays on a 61-key keyboard in every key and position', () => {
    for (const mode of KEY_MODES) {
      for (let rootPitchClass = 0; rootPitchClass < 12; rootPitchClass++) {
        for (const chord of ['triad', 'seventh'] as const) {
          for (const position of [0, 1, 2, 3]) {
            const notes = arpeggio({ rootPitchClass, mode, chord, position, hand: 'both' }).notes
            const where = `${mode} pc ${rootPitchClass} ${chord} ${position}`
            expect(Math.min(...notes), where).toBeGreaterThanOrEqual(36)
            expect(Math.max(...notes), where).toBeLessThanOrEqual(96)
          }
        }
      }
    }
  })
})
