import { describe, expect, it } from 'vitest'
import { noteName } from '../midi/notes.js'
import { buildScaleExercise, DEFAULT_SCALE_SPEC, type ScaleSpec } from './scale-exercise.js'
import { isInExercise } from './exercise.js'

const build = (spec: Partial<ScaleSpec> = {}) =>
  buildScaleExercise({ ...DEFAULT_SCALE_SPEC, ...spec })

describe('buildScaleExercise', () => {
  it('describes the scale the way the dashboard prints it', () => {
    const exercise = build()
    expect(exercise.title).toBe('A Natural Minor')
    expect(exercise.subtitle).toBe('Right Hand · 2 octaves · Up (Ascending)')
    expect(exercise.facts).toEqual([
      { label: 'Notes', value: 'A B C D E F G' },
      { label: 'Formula', value: 'W H W W H W W' },
      { label: 'Degrees', value: '1 2 ♭3 4 5 ♭6 ♭7' },
    ])
  })

  it('walks the right number of notes', () => {
    expect(build({ octaves: 1 }).steps).toHaveLength(8)
    expect(build({ octaves: 2 }).steps).toHaveLength(15)
    // Up then down does not play the turning note twice.
    expect(build({ octaves: 1, direction: 'up-down' }).steps).toHaveLength(15)
    expect(build({ octaves: 2, direction: 'up-down' }).steps).toHaveLength(29)
  })

  it('ascends by the scale’s own step pattern', () => {
    const notes = build({ octaves: 1 }).notes
    const steps = notes.slice(1).map((note, i) => note - notes[i]!)
    expect(steps).toEqual([2, 1, 2, 2, 1, 2, 2])
  })

  it('turns around at the top and comes back to where it started', () => {
    const exercise = build({ octaves: 1, direction: 'up-down' })
    expect(exercise.notes[0]).toBe(exercise.notes.at(-1))
    expect(Math.max(...exercise.notes)).toBe(exercise.notes[7])
  })

  it('descends when asked to', () => {
    const notes = build({ octaves: 1, direction: 'down' }).notes
    expect(notes[0]).toBeGreaterThan(notes.at(-1)!)
  })

  it('places the scale where a 61-key keyboard can reach it', () => {
    // The default view is C2-C7. A scale that starts below or ends above it is
    // an exercise the player cannot see themselves playing.
    for (let pitchClass = 0; pitchClass < 12; pitchClass++) {
      for (const octaves of [1, 2] as const) {
        const notes = build({ rootPitchClass: pitchClass, octaves }).notes
        expect(Math.min(...notes), `pc ${pitchClass}`).toBeGreaterThanOrEqual(36)
        expect(Math.max(...notes), `pc ${pitchClass}`).toBeLessThanOrEqual(96)
      }
    }
  })

  it('starts A minor on A3, where both hands are comfortable', () => {
    expect(noteName(build().notes[0]!)).toBe('A3')
  })

  it('names each step with its spelled note, not a MIDI number', () => {
    expect(build({ octaves: 1 }).steps.map((step) => step.label)).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
      'G',
      'A',
    ])
  })

  it('carries the degree of each note for reference', () => {
    expect(build({ octaves: 1 }).steps.map((step) => step.degree)).toEqual([
      '1',
      '2',
      '♭3',
      '4',
      '5',
      '♭6',
      '♭7',
      '1',
    ])
  })

  it('gives one recommended finger per step', () => {
    const exercise = build()
    for (const step of exercise.steps) {
      expect(step.fingers).toHaveLength(1)
      expect(step.fingers[0]!.finger).toBeGreaterThanOrEqual(1)
      expect(step.fingers[0]!.finger).toBeLessThanOrEqual(5)
      expect(step.fingers[0]!.hand).toBe('right')
    }
  })

  it('cues the thumb at the moment it has to move, not before', () => {
    // A minor right hand: 1 2 3 [1] 2 3 4 ... — the thumb passes under on D.
    const exercise = build({ octaves: 1 })
    const cued = exercise.steps.filter((step) => step.cue)
    expect(cued.map((step) => `${step.label}: ${step.cue}`)).toEqual(['D: Thumb under'])
  })

  it('cues the left hand crossing over instead of the thumb passing under', () => {
    const exercise = build({ octaves: 1, hand: 'left' })
    const cues = new Set(exercise.steps.map((step) => step.cue).filter(Boolean))
    expect(cues).toEqual(new Set(['Cross over']))
  })

  it('lights every octave of the scale, not just the two it walks', () => {
    const exercise = build()
    expect(exercise.pitchClasses.sort((a, b) => a - b)).toEqual([0, 2, 4, 5, 7, 9, 11])
    // Two octaves below anything the exercise plays, but still an A.
    expect(isInExercise(exercise, 33)).toBe(true)
    expect(isInExercise(exercise, 34)).toBe(false)
  })

  it('gives a different id to every distinct request', () => {
    const ids = new Set<string>()
    for (const hand of ['right', 'left'] as const) {
      for (const octaves of [1, 2] as const) {
        for (const direction of ['up', 'down', 'up-down'] as const) {
          ids.add(build({ hand, octaves, direction }).id)
        }
      }
    }
    expect(ids.size).toBe(12)
  })

  it('builds every scale type on every root without throwing', () => {
    for (let pitchClass = 0; pitchClass < 12; pitchClass++) {
      for (const scaleTypeId of ['major', 'harmonic-minor', 'blues', 'chromatic', 'whole-tone']) {
        const exercise = build({ rootPitchClass: pitchClass, scaleTypeId, octaves: 1 })
        expect(exercise.steps.length).toBeGreaterThan(2)
        expect(exercise.steps.length).toBe(exercise.fingering!.fingers.length)
      }
    }
  })
})

/**
 * The melodic minor is the one scale that is not the same coming back down: it
 * raises the sixth and seventh going up to smooth the leap the harmonic minor
 * leaves, and drops both again on the way down. Reversing the ascending notes
 * for it plays two wrong notes on every turn — and, worse, teaches them.
 */
describe('melodic minor descending', () => {
  const melodic = (direction: ScaleSpec['direction'], octaves = 1) =>
    build({ scaleTypeId: 'melodic-minor', rootPitchClass: 9, octaves, direction })

  const labels = (spec: Parameters<typeof melodic>[0]) =>
    melodic(spec).steps.map((step) => step.label)

  it('raises the sixth and seventh on the way up', () => {
    expect(labels('up')).toEqual(['A', 'B', 'C', 'D', 'E', 'F♯', 'G♯', 'A'])
  })

  it('drops them again on the way down', () => {
    expect(labels('down')).toEqual(['A', 'G', 'F', 'E', 'D', 'C', 'B', 'A'])
  })

  it('turns around onto the natural minor, without repeating the top note', () => {
    expect(labels('up-down')).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
      'F♯',
      'G♯',
      'A',
      'G',
      'F',
      'E',
      'D',
      'C',
      'B',
      'A',
    ])
  })

  it('lets the keyboard call the descending notes part of the scale', () => {
    // F and G only belong to the way down; if the exercise does not claim them
    // the keyboard greys out notes it is actively asking the player for.
    const exercise = melodic('up-down')
    for (const step of exercise.steps) {
      expect(isInExercise(exercise, step.notes[0]!)).toBe(true)
    }
    expect(exercise.facts.find((f) => f.label === 'Coming down')?.value).toBe('A G F E D C B')
  })

  it('leaves scales that climb down the way they came alone', () => {
    const natural = build({
      scaleTypeId: 'natural-minor',
      rootPitchClass: 9,
      octaves: 1,
      direction: 'up-down',
    })
    expect(natural.facts.some((f) => f.label === 'Coming down')).toBe(false)
    const up = natural.steps.slice(0, 8).map((s) => s.label)
    const down = natural.steps.slice(7).map((s) => s.label)
    expect([...down].reverse()).toEqual(up)
  })
})
