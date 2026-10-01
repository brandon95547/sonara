import { describe, expect, it } from 'vitest'
import { noteName } from '../midi/notes.js'
import { buildScaleExercise, DEFAULT_SCALE_SPEC, type ScaleSpec } from './scale-exercise.js'
import { isInExercise } from './exercise.js'
import { SCALE_TYPES } from '../music/scales.js'

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
    for (const hand of ['right', 'left'] as const) {
      for (let pitchClass = 0; pitchClass < 12; pitchClass++) {
        for (const octaves of [1, 2, 3, 4] as const) {
          const notes = build({ rootPitchClass: pitchClass, octaves, hand }).notes
          const where = `${hand} pc ${pitchClass} x${octaves}`
          expect(Math.min(...notes), where).toBeGreaterThanOrEqual(36)
          expect(Math.max(...notes), where).toBeLessThanOrEqual(96)
        }
      }
    }
  })

  it('starts the right hand of A minor on A3', () => {
    expect(noteName(build().notes[0]!)).toBe('A3')
  })

  it('puts the left hand an octave below the right, as the scale books do', () => {
    // The regression: both hands were given the same keys. The Brown Scale
    // Book prints A minor "in octaves" with the right hand from A3 and the
    // left from A2.
    expect(noteName(build({ hand: 'left' }).notes[0]!)).toBe('A2')

    // Every scale type, in every key, at every width that leaves room for it,
    // whichever way it runs — not only the one that was noticed.
    for (const { id: scaleTypeId } of SCALE_TYPES) {
      for (let pitchClass = 0; pitchClass < 12; pitchClass++) {
        for (const octaves of [1, 2, 3] as const) {
          for (const direction of ['up', 'down', 'up-down'] as const) {
            const spec = { scaleTypeId, rootPitchClass: pitchClass, octaves, direction }
            const right = build({ ...spec, hand: 'right' }).notes
            const left = build({ ...spec, hand: 'left' }).notes
            expect(left, `${scaleTypeId} pc ${pitchClass} x${octaves} ${direction}`).toEqual(
              right.map((note) => note - 12),
            )
          }
        }
      }
    }
  })

  it('starts every major and minor key on the note the Brown Scale Book prints', () => {
    // Read off the "similar motion in octaves" line of each key's page. The
    // regression: E and E♭ major, and E, F, F♯ and D♯ minor, began an octave
    // under the page.
    const majors = {
      0: 60,
      7: 55,
      2: 62,
      9: 57,
      4: 64,
      11: 59,
      6: 54,
      5: 53,
      10: 58,
      3: 63,
      8: 56,
      1: 61,
    }
    const minors = {
      9: 57,
      4: 64,
      11: 59,
      6: 66,
      1: 61,
      8: 56,
      3: 63,
      2: 62,
      7: 55,
      0: 60,
      5: 65,
      10: 58,
    }
    const forms = [
      ['major', majors],
      ['natural-minor', minors],
      ['harmonic-minor', minors],
      ['melodic-minor', minors],
    ] as const
    for (const [scaleTypeId, starts] of forms) {
      for (const [pitchClass, right] of Object.entries(starts)) {
        const spec = {
          scaleTypeId,
          rootPitchClass: Number(pitchClass),
          direction: 'up-down',
        } as const
        const where = `${scaleTypeId} pc ${pitchClass}`
        expect(build({ ...spec, hand: 'right' }).notes[0], where).toBe(right)
        expect(build({ ...spec, hand: 'left' }).notes[0], where).toBe(right - 12)
        expect(build({ ...spec, hand: 'both' }).steps[0]!.notes, where).toEqual([right - 12, right])
      }
    }
  })

  it('shares the one place a four-octave scale fits rather than leave the keyboard', () => {
    // Db over four octaves runs Db2-Db6. An octave lower starts below C2, off
    // the bottom of a 61-key keyboard, so the left hand stays where it fits.
    const spec = { rootPitchClass: 1, octaves: 4 } as const
    expect(build({ ...spec, hand: 'left' }).notes).toEqual(build({ ...spec, hand: 'right' }).notes)
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
    for (const hand of ['right', 'left', 'both'] as const) {
      for (const octaves of [1, 2] as const) {
        for (const direction of ['up', 'down', 'up-down'] as const) {
          ids.add(build({ hand, octaves, direction }).id)
        }
      }
    }
    expect(ids.size).toBe(18)
  })

  it('builds every scale type on every root without throwing', () => {
    for (let pitchClass = 0; pitchClass < 12; pitchClass++) {
      for (const scaleTypeId of ['major', 'harmonic-minor', 'blues', 'chromatic', 'whole-tone']) {
        const exercise = build({ rootPitchClass: pitchClass, scaleTypeId, octaves: 1 })
        expect(exercise.steps.length).toBeGreaterThan(2)
        expect(exercise.steps.length).toBe(exercise.fingerings[0]!.fingers.length)
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

describe('the key the exercise is written in', () => {
  it('carries a signature the live staff can draw', () => {
    expect(
      buildScaleExercise({ ...DEFAULT_SCALE_SPEC, rootPitchClass: 3, scaleTypeId: 'major' })
        .keyFifths,
    ).toBe(-3)
    expect(
      buildScaleExercise({
        ...DEFAULT_SCALE_SPEC,
        rootPitchClass: 9,
        scaleTypeId: 'harmonic-minor',
      }).keyFifths,
    ).toBe(0)
    expect(
      buildScaleExercise({ ...DEFAULT_SCALE_SPEC, rootPitchClass: 0, scaleTypeId: 'chromatic' })
        .keyFifths,
    ).toBeNull()
  })

  it('spells the chromatic scale with flats on the way down', () => {
    const exercise = buildScaleExercise({
      ...DEFAULT_SCALE_SPEC,
      rootPitchClass: 0,
      scaleTypeId: 'chromatic',
      octaves: 1,
      direction: 'up-down',
    })
    const labels = exercise.steps.map((step) => step.label)
    expect(labels.slice(0, 13).join(' ')).toBe('C C♯ D D♯ E F F♯ G G♯ A A♯ B C')
    expect(labels.slice(13).join(' ')).toBe('B B♭ A A♭ G G♭ F E E♭ D D♭ C')
    expect(exercise.facts.find((fact) => fact.label === 'Coming down')?.value).toBe(
      'C B B♭ A A♭ G G♭ F E E♭ D D♭',
    )
  })
})

/**
 * Both hands at once: what the scale books print first, "similar motion in
 * octaves". It is the same exercise model — a step is every note that has to
 * sound — so the engine, the keys and the staff need nothing new. What has to
 * be right is here: each hand on its own keys, with its own fingers.
 */
describe('both hands together', () => {
  const both = (spec: Partial<ScaleSpec> = {}) => build({ hand: 'both', ...spec })

  it('says so', () => {
    expect(both().subtitle).toBe('Both Hands · 2 octaves · Up (Ascending)')
  })

  it('asks for two notes a step, an octave apart, the left hand below', () => {
    for (const step of both().steps) {
      expect(step.notes).toHaveLength(2)
      expect(step.notes[1]! - step.notes[0]!).toBe(12)
      expect(step.fingers.map((finger) => finger.hand)).toEqual(['left', 'right'])
    }
  })

  it('starts A minor where the book does: left on A2, right on A3', () => {
    expect(both().steps[0]!.notes.map(noteName)).toEqual(['A2', 'A3'])
  })

  it('is each hand playing exactly what it plays alone', () => {
    for (const { id: scaleTypeId } of SCALE_TYPES) {
      for (let pitchClass = 0; pitchClass < 12; pitchClass++) {
        for (const direction of ['up', 'down', 'up-down'] as const) {
          const spec = { scaleTypeId, rootPitchClass: pitchClass, direction }
          const together = both(spec)
          for (const [index, hand] of (['left', 'right'] as const).entries()) {
            const alone = build({ ...spec, hand })
            const where = `${scaleTypeId} pc ${pitchClass} ${direction} ${hand}`
            expect(
              together.steps.map((step) => step.notes[index]),
              where,
            ).toEqual(alone.notes)
            // The fingers too: the left hand is fingered as a left hand, not
            // given the right hand's numbers an octave down.
            expect(
              together.steps.map((step) => step.fingers[index]!.finger),
              where,
            ).toEqual(alone.steps.map((step) => step.fingers[0]!.finger))
          }
        }
      }
    }
  })

  it('fingers A minor the way the page does: 5 4 3 2 1 3 2 1 under 1 2 3 1 2 3 4 5', () => {
    const exercise = both({ octaves: 1 })
    expect(exercise.steps.map((step) => step.fingers[0]!.finger)).toEqual([5, 4, 3, 2, 1, 3, 2, 1])
    expect(exercise.steps.map((step) => step.fingers[1]!.finger)).toEqual([1, 2, 3, 1, 2, 3, 4, 5])
    expect(exercise.fingerings.map((fingering) => fingering.hand)).toEqual(['left', 'right'])
  })

  it('says which hand is moving, because they do not cross on the same note', () => {
    const exercise = both({ octaves: 1 })
    const cued = exercise.steps.filter((step) => step.cue)
    expect(cued.map((step) => `${step.label} — ${step.cue}`)).toEqual([
      'D — Right: Thumb under',
      'F — Left: Cross over',
    ])
    // And each cue sits on the finger of the hand it is about, so the keyboard
    // can draw it on that hand's key and not the other's.
    const [thumbUnder, crossOver] = cued
    expect(thumbUnder!.fingers.map((finger) => finger.cue)).toEqual([undefined, 'Thumb under'])
    expect(crossOver!.fingers.map((finger) => finger.cue)).toEqual(['Cross over', undefined])
  })

  it('stays on a 61-key keyboard at every width the controls offer', () => {
    for (const { id: scaleTypeId } of SCALE_TYPES) {
      for (let pitchClass = 0; pitchClass < 12; pitchClass++) {
        for (const octaves of [1, 2, 3] as const) {
          const notes = both({ scaleTypeId, rootPitchClass: pitchClass, octaves }).notes
          const where = `${scaleTypeId} pc ${pitchClass} x${octaves}`
          expect(Math.min(...notes), where).toBeGreaterThanOrEqual(36)
          expect(Math.max(...notes), where).toBeLessThanOrEqual(96)
        }
      }
    }
  })

  it('never puts the two hands on the same key, even with no room to spare', () => {
    // Four octaves of Db: a left hand alone shares the right hand's position,
    // but two hands cannot, so they keep their octave and run off a 61 instead.
    const exercise = both({ rootPitchClass: 1, octaves: 4 })
    for (const step of exercise.steps) expect(step.notes[1]! - step.notes[0]!).toBe(12)
  })
})

/**
 * The three forms of the minor, which is how the scale books file them: one
 * key, "A Minor", printed in a harmonic form and a melodic form, with the
 * natural minor as the melodic form's way back down.
 */
describe('the forms of the minor scale', () => {
  const semitones = (spec: Partial<ScaleSpec>) => {
    const notes = build({ octaves: 1, ...spec }).steps.map((step) => step.notes[0]!)
    return notes.map((note) => Math.abs(note - notes[0]!))
  }

  it('offers all three by name', () => {
    const names = SCALE_TYPES.filter((type) => type.family === 'minor').map((type) => type.name)
    expect(names).toEqual(['Natural Minor', 'Harmonic Minor', 'Melodic Minor'])
  })

  it('builds each form correctly in every key, for either hand', () => {
    for (const hand of ['right', 'left'] as const) {
      for (let rootPitchClass = 0; rootPitchClass < 12; rootPitchClass++) {
        const key = { rootPitchClass, hand }
        const where = `pc ${rootPitchClass} ${hand}`
        expect(semitones({ ...key, scaleTypeId: 'natural-minor' }), where).toEqual([
          0, 2, 3, 5, 7, 8, 10, 12,
        ])
        // The seventh raised, both ways.
        expect(semitones({ ...key, scaleTypeId: 'harmonic-minor' }), where).toEqual([
          0, 2, 3, 5, 7, 8, 11, 12,
        ])
        expect(
          semitones({ ...key, scaleTypeId: 'harmonic-minor', direction: 'down' }),
          where,
        ).toEqual([0, 1, 4, 5, 7, 9, 10, 12])
        // The sixth and seventh raised going up, and put back coming down.
        expect(semitones({ ...key, scaleTypeId: 'melodic-minor' }), where).toEqual([
          0, 2, 3, 5, 7, 9, 11, 12,
        ])
        expect(
          semitones({ ...key, scaleTypeId: 'melodic-minor', direction: 'down' }),
          where,
        ).toEqual([0, 2, 4, 5, 7, 9, 10, 12])
      }
    }
  })

  it('spells A harmonic and melodic minor as the book prints them', () => {
    const labels = (spec: Partial<ScaleSpec>) =>
      build({ octaves: 1, ...spec }).steps.map((step) => step.label)
    expect(labels({ scaleTypeId: 'harmonic-minor' }).join(' ')).toBe('A B C D E F G♯ A')
    expect(labels({ scaleTypeId: 'melodic-minor', direction: 'up-down' }).join(' ')).toBe(
      'A B C D E F♯ G♯ A G F E D C B A',
    )
  })
})
