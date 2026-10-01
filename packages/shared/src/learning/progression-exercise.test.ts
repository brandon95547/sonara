import { describe, expect, it } from 'vitest'
import { noteName } from '../midi/notes.js'
import { cadenceFingers } from '../music/cadences.js'
import { KEY_MODES } from '../music/chords.js'
import {
  buildProgressionExercise,
  DEFAULT_PROGRESSION_SPEC,
  type ProgressionSpec,
} from './progression-exercise.js'

const cadence = (spec: Partial<ProgressionSpec> = {}) =>
  buildProgressionExercise({ ...DEFAULT_PROGRESSION_SPEC, ...spec })

/** A step's notes for one hand, as note names. */
const played = (exercise: ReturnType<typeof cadence>, step: number, hand: 'left' | 'right') =>
  exercise.steps[step]!.notes.filter(
    (_, index) => exercise.steps[step]!.fingers[index]!.hand === hand,
  ).map((note) => noteName(note))

/** One hand's fingers through the exercise, a group per chord, lowest note first. */
const fingersOf = (exercise: ReturnType<typeof cadence>, hand: 'left' | 'right') =>
  exercise.steps.map((step) =>
    step.fingers
      .filter((finger) => finger.hand === hand)
      .map((finger) => finger.finger)
      .join(''),
  )

describe('the cadence in three positions', () => {
  it('plays I – IV – I – V7 – I from each position of the tonic, as the page prints it', () => {
    // Alfred p. 19, "C Major Cadences — Three Positions".
    const exercise = cadence({ hand: 'right' })
    expect(exercise.title).toBe('C Major Cadence')
    expect(exercise.steps.map((step) => step.label).slice(0, 5)).toEqual(['C', 'F', 'C', 'G7', 'C'])
    expect(exercise.steps.map((step) => step.degree).slice(0, 5)).toEqual([
      'I',
      'IV',
      'I',
      'V7',
      'I',
    ])
    expect([0, 1, 3].map((step) => played(exercise, step, 'right'))).toEqual([
      ['C4', 'E4', 'G4'],
      ['C4', 'F4', 'A4'],
      ['B3', 'F4', 'G4'],
    ])
    expect([5, 6, 8].map((step) => played(exercise, step, 'right'))).toEqual([
      ['E4', 'G4', 'C5'],
      ['F4', 'A4', 'C5'],
      ['F4', 'G4', 'B4'],
    ])
    expect([10, 11, 13].map((step) => played(exercise, step, 'right'))).toEqual([
      ['G4', 'C5', 'E5'],
      ['A4', 'C5', 'F5'],
      ['G4', 'B4', 'F5'],
    ])
  })

  it('takes the dominant triad where the seventh is not asked for', () => {
    const exercise = cadence({ hand: 'right', dominant: 'V' })
    expect(exercise.steps[3]!.label).toBe('G')
    expect([3, 8, 13].map((step) => played(exercise, step, 'right'))).toEqual([
      ['B3', 'D4', 'G4'],
      ['D4', 'G4', 'B4'],
      ['G4', 'B4', 'D5'],
    ])
  })

  it('keeps a note in place from each chord to the next', () => {
    // The reason for the positions: no chord is reached by a leap.
    for (const mode of KEY_MODES) {
      for (const dominant of ['V', 'V7'] as const) {
        const { steps } = cadence({ hand: 'right', mode, dominant })
        for (let index = 1; index < steps.length; index++) {
          if (index % 5 === 0) continue // a new position starts somewhere else
          const shared = steps[index]!.notes.filter((note) =>
            steps[index - 1]!.notes.includes(note),
          )
          expect(shared.length, `${mode} ${dominant} step ${index}`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('puts the left hand an octave below the right, on the same chords', () => {
    const exercise = cadence()
    for (const step of exercise.steps) {
      expect(step.notes.slice(3).map((note) => note - 12)).toEqual(step.notes.slice(0, 3))
    }
  })

  it('names the position each cadence starts from, when it plays all three', () => {
    expect(cadence().steps.flatMap((step) => step.cue ?? [])).toEqual([
      'Root position',
      '1st inversion',
      '2nd inversion',
    ])
    const one = cadence({ position: 1 })
    expect(one.steps).toHaveLength(5)
    expect(one.steps.every((step) => step.cue === undefined)).toBe(true)
    expect(one.subtitle).toBe('Both Hands · 1st inversion · I – IV – I – V7 – I')
  })

  it('takes a minor key’s chords from the harmonic minor: i and iv minor, V major', () => {
    // Alfred p. 49.
    const exercise = cadence({ rootPitchClass: 9, mode: 'minor', hand: 'right', dominant: 'V' })
    expect(exercise.steps.map((step) => step.label).slice(0, 5)).toEqual([
      'Am',
      'Dm',
      'Am',
      'E',
      'Am',
    ])
    expect(exercise.steps.map((step) => step.degree).slice(0, 5)).toEqual([
      'i',
      'iv',
      'i',
      'V',
      'i',
    ])
    expect(played(exercise, 3, 'right')).toEqual(['G#3', 'B3', 'E4'])
    expect(exercise.steps[3]!.noteLabels).toEqual(['G♯', 'B', 'E'])
  })
})

describe('the cadence’s fingering', () => {
  it('is what the page prints for nearly every key', () => {
    // Read off all thirty pages; twenty-eight print exactly this.
    const exercise = cadence({ rootPitchClass: 7 })
    expect(fingersOf(exercise, 'right')).toEqual([
      '135',
      '135',
      '135',
      '145',
      '135',
      '125',
      '135',
      '125',
      '124',
      '125',
      '135',
      '125',
      '135',
      '125',
      '135',
    ])
    expect(fingersOf(exercise, 'left')).toEqual([
      '531',
      '521',
      '531',
      '521',
      '531',
      '531',
      '421',
      '531',
      '431',
      '531',
      '521',
      '421',
      '521',
      '531',
      '521',
    ])
    expect(exercise.fingerings.map((fingering) => fingering.source)).toEqual(['alfred', 'alfred'])
  })

  it('differs on the two pages that differ', () => {
    const fingers = (
      pitchClass: number,
      mode: 'major' | 'minor',
      position: number,
      chord: 'I' | 'V',
    ) => cadenceFingers({ pitchClass, mode, hand: 'right', position, chord }).join('')
    // C major keeps the open hand for its all-white dominant.
    expect(fingers(0, 'major', 1, 'V')).toBe('135')
    expect(fingers(0, 'major', 2, 'V')).toBe('135')
    expect(fingers(7, 'major', 1, 'V')).toBe('124')
    // D minor's third position opens on 4 2 1.
    expect(fingers(2, 'minor', 2, 'I')).toBe('124')
    expect(fingers(9, 'minor', 2, 'I')).toBe('135')
  })
})

describe('the cadence with one hand on the roots', () => {
  it('plays I – IV – I – V – V7 – I, the left hand under the chords', () => {
    // Alfred p. 86, "Root in bass".
    const exercise = cadence({ form: 'root-in-bass' })
    expect(exercise.steps.map((step) => step.label)).toEqual(['C', 'F', 'C', 'G', 'G7', 'C'])
    expect(
      exercise.steps.map((step) => played(exercise, exercise.steps.indexOf(step), 'left')),
    ).toEqual([['C3'], ['F3'], ['C3'], ['G3'], ['G3'], ['C3']])
    expect(fingersOf(exercise, 'left')).toEqual(['5', '2', '5', '1', '1', '5'])
    expect(fingersOf(exercise, 'right')).toEqual(['135', '135', '135', '125', '145', '135'])
    expect(exercise.subtitle).toBe('Root in the Bass · I – IV – I – V – V7 – I')
  })

  it('or the right hand over them', () => {
    // Alfred p. 86, "Root in treble".
    const exercise = cadence({ form: 'root-in-treble' })
    expect(
      exercise.steps.map((step) => played(exercise, exercise.steps.indexOf(step), 'right')),
    ).toEqual([['C4'], ['F4'], ['C4'], ['G4'], ['G4'], ['C4']])
    expect(fingersOf(exercise, 'right')).toEqual(['1', '4', '1', '5', '5', '1'])
    expect(fingersOf(exercise, 'left')).toEqual(['531', '521', '531', '531', '521', '531'])
  })

  it('is two-handed whatever the hand setting says', () => {
    const exercise = cadence({ form: 'root-in-bass', hand: 'right' })
    expect(exercise.fingerings.map((fingering) => fingering.hand)).toEqual(['left', 'right'])
  })
})

describe('every key’s cadence', () => {
  it('stays on a 61-key keyboard', () => {
    for (const mode of KEY_MODES) {
      for (let rootPitchClass = 0; rootPitchClass < 12; rootPitchClass++) {
        for (const form of ['positions', 'root-in-bass', 'root-in-treble'] as const) {
          const notes = cadence({ rootPitchClass, mode, form }).notes
          const where = `${mode} pc ${rootPitchClass} ${form}`
          expect(Math.min(...notes), where).toBeGreaterThanOrEqual(36)
          expect(Math.max(...notes), where).toBeLessThanOrEqual(96)
        }
      }
    }
  })

  it('is written under the name it was asked for', () => {
    expect(cadence({ rootPitchClass: 3, mode: 'minor' }).title).toBe('D♯ Minor Cadence')
    expect(cadence({ rootPitchClass: 3, mode: 'minor', tonic: 'E♭' }).title).toBe(
      'E♭ Minor Cadence',
    )
  })
})
