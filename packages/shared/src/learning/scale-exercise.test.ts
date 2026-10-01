import { describe, expect, it } from 'vitest'
import { noteName } from '../midi/notes.js'
import {
  buildScaleExercise,
  DEFAULT_PLAYABLE_RANGE,
  DEFAULT_SCALE_SPEC,
  inEvenNotes,
  scaleHasCadence,
  scaleMotionsFor,
  scaleTexturesFor,
  type ScaleExerciseOptions,
  type ScaleSpec,
} from './scale-exercise.js'
import { isInExercise, stepBeats } from './exercise.js'
import { SCALE_TYPES } from '../music/scales.js'

const build = (spec: Partial<ScaleSpec> = {}, options: ScaleExerciseOptions = {}) =>
  buildScaleExercise({ ...DEFAULT_SCALE_SPEC, ...spec }, options)

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

/**
 * The other lines of a key's page in the Brown Scale Book: contrary motion,
 * and the hands a third and a sixth apart. Every starting note and every
 * finger below was read off the page.
 */
describe('contrary motion, thirds and sixths', () => {
  /** A keyboard that reaches as far as the book goes. */
  const FULL = { low: 21, high: 108 }
  const two = (spec: Partial<ScaleSpec>, range = FULL) =>
    buildScaleExercise({ ...DEFAULT_SCALE_SPEC, hand: 'both', octaves: 2, ...spec }, { range })
  const hand = (exercise: ReturnType<typeof two>, index: number) =>
    exercise.steps.map((step) => step.fingers[index]!.finger).join('')

  it('offers each scale the motions it can take', () => {
    const motions = (id: string) => scaleMotionsFor(SCALE_TYPES.find((type) => type.id === id)!)
    expect(motions('major')).toEqual(['similar', 'contrary', 'third', 'sixth'])
    expect(motions('harmonic-minor')).toEqual(['similar', 'contrary', 'third', 'sixth'])
    // One hand would be on the raised sixth while the other is on the lowered.
    expect(motions('melodic-minor')).toEqual(['similar', 'third', 'sixth'])
    // Two steps along a pentatonic is not a third.
    expect(motions('major-pentatonic')).toEqual(['similar', 'contrary'])
  })

  it('is similar motion for one hand, and for a scale that cannot take the motion', () => {
    const plain = build({ hand: 'right' })
    expect(build({ hand: 'right', motion: 'contrary' }).notes).toEqual(plain.notes)
    expect(two({ scaleTypeId: 'melodic-minor', motion: 'contrary' }).notes).toEqual(
      two({ scaleTypeId: 'melodic-minor' }).notes,
    )
  })

  describe('contrary motion from unison', () => {
    it('starts both hands on the note the page does, in every key', () => {
      const majors = {
        0: 60,
        7: 55,
        2: 62,
        9: 57,
        4: 64,
        11: 59,
        6: 66,
        5: 65,
        10: 58,
        3: 63,
        8: 68,
        1: 61,
      }
      const minors = {
        9: 57,
        4: 64,
        11: 59,
        6: 66,
        1: 61,
        8: 68,
        3: 63,
        2: 62,
        7: 67,
        0: 60,
        5: 65,
        10: 58,
      }
      for (const [scaleTypeId, starts] of [
        ['major', majors],
        ['harmonic-minor', minors],
      ] as const) {
        for (const [pitchClass, unison] of Object.entries(starts)) {
          const exercise = two({
            scaleTypeId,
            rootPitchClass: Number(pitchClass),
            motion: 'contrary',
            direction: 'up-down',
          })
          const where = `${scaleTypeId} pc ${pitchClass}`
          expect(exercise.steps[0]!.notes, where).toEqual([unison, unison])
          // Two octaves out, each way, and back to meet.
          expect(exercise.steps[14]!.notes, where).toEqual([unison - 24, unison + 24])
          expect(exercise.steps.at(-1)!.notes, where).toEqual([unison, unison])
        }
      }
    })

    it('sends the left hand down the same scale the right hand goes up', () => {
      const exercise = two({ rootPitchClass: 0, scaleTypeId: 'major', motion: 'contrary' })
      expect(exercise.subtitle).toBe('Contrary Motion · 2 octaves · Apart')
      expect(exercise.steps.slice(0, 4).map((step) => step.label)).toEqual([
        'C',
        'B + D',
        'A + E',
        'G + F',
      ])
      expect(exercise.steps[1]!.noteLabels).toEqual(['B', 'D'])
      // Mirror images on the white keys: both hands 1 2 3 1 2 3 4 …
      expect(hand(exercise, 0)).toBe('123123412312345')
      expect(hand(exercise, 1)).toBe('123123412312345')
    })

    it('says the hands part, or meet, rather than go up or down', () => {
      const spec = { rootPitchClass: 0, scaleTypeId: 'major', motion: 'contrary' } as const
      expect(two({ ...spec, direction: 'down' }).subtitle).toContain('Together')
      expect(two({ ...spec, direction: 'up-down' }).subtitle).toContain('Apart and Back')
      // Coming together starts apart: left hand at the bottom, right at the top.
      expect(two({ ...spec, direction: 'down' }).steps[0]!.notes).toEqual([36, 84])
    })

    it('cues each hand by the way it is actually moving', () => {
      // The left hand going down passes its thumb under, as the right does going up.
      const exercise = two({
        rootPitchClass: 0,
        scaleTypeId: 'major',
        motion: 'contrary',
        octaves: 1,
      })
      expect(exercise.steps[3]!.cue).toBe('Left: Thumb under · Right: Thumb under')
    })

    it('fingers each hand as the page does', () => {
      const line = (rootPitchClass: number, scaleTypeId: string) =>
        two({ rootPitchClass, scaleTypeId, motion: 'contrary' })
      // F♯ major: the left hand opens at the top of its run, on 2.
      expect(hand(line(6, 'major'), 1)).toBe('234123123412312')
      expect(hand(line(6, 'major'), 0)).toBe('212312341231234')
      expect(hand(line(10, 'major'), 0)).toBe('212341231234123')
      // A♭ major opens 3 4 here, where its similar-motion line opens 2 3.
      expect(hand(line(8, 'major'), 1)).toBe('341231234123123')
      expect(hand(two({ rootPitchClass: 8, scaleTypeId: 'major' }), 1)).toBe('231231234123123')
      // So does F♯ minor.
      expect(hand(line(6, 'harmonic-minor'), 1)).toBe('341231234123123')
      // B♭ minor's left hand reaches the bottom on 4 5.
      expect(hand(line(10, 'harmonic-minor'), 0)).toBe('234123123412345')
    })

    it('closes G♯ minor on 4 3 though it opened on 2 3', () => {
      const fingers = hand(
        two({
          rootPitchClass: 8,
          scaleTypeId: 'harmonic-minor',
          motion: 'contrary',
          direction: 'up-down',
        }),
        1,
      )
      expect(fingers.slice(0, 3)).toBe('231')
      expect(fingers.slice(-3)).toBe('143')
    })

    it('moves up an octave rather than off the end of a 61-key keyboard', () => {
      // The page starts G major on G3 and takes the left hand down to G1.
      const spec = { rootPitchClass: 7, scaleTypeId: 'major', motion: 'contrary' } as const
      expect(two(spec).steps[0]!.notes).toEqual([55, 55])
      const fitted = two(spec, DEFAULT_PLAYABLE_RANGE)
      expect(fitted.steps[0]!.notes).toEqual([67, 67])
      expect(Math.min(...fitted.notes)).toBeGreaterThanOrEqual(36)
    })
  })

  describe('separated by a third, and by a sixth', () => {
    // The left hand's tonic in the thirds. The sixths start an octave higher
    // in the right hand, with the left on the note the right had in the thirds.
    const TONICS = {
      0: 48,
      7: 43,
      2: 50,
      9: 45,
      4: 52,
      11: 47,
      6: 54,
      5: 53,
      10: 46,
      3: 51,
      8: 44,
      1: 49,
    }

    it('starts each where the page does, in every major key', () => {
      for (const [pitchClass, tonic] of Object.entries(TONICS)) {
        const key = { rootPitchClass: Number(pitchClass), scaleTypeId: 'major' }
        expect(two({ ...key, motion: 'third' }).steps[0]!.notes, `third pc ${pitchClass}`).toEqual([
          tonic,
          tonic + 4,
        ])
        expect(two({ ...key, motion: 'sixth' }).steps[0]!.notes, `sixth pc ${pitchClass}`).toEqual([
          tonic + 4,
          tonic + 12,
        ])
      }
    })

    it('keeps the hands a third, or a sixth, of the scale apart throughout', () => {
      const third = two({
        rootPitchClass: 0,
        scaleTypeId: 'major',
        motion: 'third',
        direction: 'up-down',
      })
      expect(third.subtitle).toBe('A Third Apart · 2 octaves · Up then Down')
      expect(third.steps.slice(0, 3).map((step) => step.label)).toEqual(['C + E', 'D + F', 'E + G'])
      // Major and minor thirds, as the scale has them — never anything else.
      for (const step of third.steps) expect([3, 4]).toContain(step.notes[1]! - step.notes[0]!)

      const sixth = two({
        rootPitchClass: 0,
        scaleTypeId: 'major',
        motion: 'sixth',
        direction: 'up-down',
      })
      expect(sixth.steps[0]!.label).toBe('E + C')
      for (const step of sixth.steps) expect([8, 9]).toContain(step.notes[1]! - step.notes[0]!)
    })

    it('gives the hand on the tonic its usual fingering', () => {
      for (let rootPitchClass = 0; rootPitchClass < 12; rootPitchClass++) {
        const key = { rootPitchClass, scaleTypeId: 'major' }
        const similar = two(key)
        expect(hand(two({ ...key, motion: 'third' }), 0), `pc ${rootPitchClass}`).toBe(
          hand(similar, 0),
        )
        expect(hand(two({ ...key, motion: 'sixth' }), 1), `pc ${rootPitchClass}`).toBe(
          hand(similar, 1),
        )
      }
    })

    it('fingers the hand that starts on the third as the page does', () => {
      const third = (rootPitchClass: number) =>
        hand(two({ rootPitchClass, scaleTypeId: 'major', motion: 'third' }), 1)
      const sixth = (rootPitchClass: number) =>
        hand(two({ rootPitchClass, scaleTypeId: 'major', motion: 'sixth' }), 0)

      // The same fingers those notes always take: C major from E is 3 1 2 3 4 …
      expect(third(0)).toBe('312341231234123')
      expect(third(10)).toBe('231234123123412')
      // … except F♯ major, which opens on 3 where A♯ is otherwise a 4.
      expect(third(6)).toBe('312312341231234')

      expect(sixth(7)).toBe('321321432132143')
      expect(sixth(11)).toBe('214321321432132')
      // C major turns at the top on 3 2.
      expect(sixth(0)).toBe('321321432132132')
      // The four flat keys start the left hand on 5 and walk down to the thumb.
      for (const flat of [10, 3, 8, 1]) expect(sixth(flat), `pc ${flat}`).toBe('543213214321321')
    })

    it('calls a line the book does not print a suggestion', () => {
      // The book prints thirds and sixths for the major keys only. A minor key
      // takes the fingers its notes already have, and says it is suggesting.
      const exercise = two({ rootPitchClass: 9, scaleTypeId: 'harmonic-minor', motion: 'third' })
      expect(exercise.fingerings.map((fingering) => fingering.source)).toEqual([
        'standard',
        'derived',
      ])
      // A minor from C: the fingers C D E F take in the scale — 3 1 2 3.
      expect(hand(exercise, 1).slice(0, 4)).toBe('3123')
    })

    it('stays on a 61-key keyboard at every width the controls offer', () => {
      for (const motion of ['third', 'sixth'] as const) {
        for (let rootPitchClass = 0; rootPitchClass < 12; rootPitchClass++) {
          for (const octaves of [1, 2, 3] as const) {
            const notes = two(
              { rootPitchClass, scaleTypeId: 'major', motion, octaves },
              DEFAULT_PLAYABLE_RANGE,
            ).notes
            const where = `${motion} pc ${rootPitchClass} x${octaves}`
            expect(Math.min(...notes), where).toBeGreaterThanOrEqual(36)
            expect(Math.max(...notes), where).toBeLessThanOrEqual(96)
          }
        }
      }
    })
  })
})

/**
 * The last line of a major key's page: each hand playing the scale in thirds.
 * A hand can hold a third three ways — 1 3, 2 4 or 3 5 — and the fingering is
 * which of them each note takes. Read off the page for all twelve keys.
 */
describe('double thirds', () => {
  const thirds = (spec: Partial<ScaleSpec>) =>
    build({ scaleTypeId: 'major', texture: 'double-thirds', octaves: 2, ...spec })
  /** One hand's fingers, a pair per third, lower note first. */
  const pairs = (exercise: ReturnType<typeof build>, hand: 'right' | 'left') =>
    exercise.steps
      .map((step) =>
        step.fingers
          .filter((finger) => finger.hand === hand)
          .map((finger) => finger.finger)
          .join(''),
      )
      .join(' ')

  it('plays each note of the scale with the third above it, in one hand', () => {
    const exercise = thirds({ rootPitchClass: 0, hand: 'right', octaves: 1 })
    expect(exercise.subtitle).toBe('Right Hand · Double Thirds · 1 octave · Up (Ascending)')
    expect(exercise.steps.map((step) => step.label)).toEqual([
      'C + E',
      'D + F',
      'E + G',
      'F + A',
      'G + B',
      'A + C',
      'B + D',
      'C + E',
    ])
    expect(exercise.steps[0]!.notes.map(noteName)).toEqual(['C4', 'E4'])
    expect(exercise.steps[0]!.noteLabels).toEqual(['C', 'E'])
    expect(exercise.fingerings[0]).toMatchObject({ source: 'standard', perStep: 2 })
  })

  it('puts the left hand an octave below, as in single notes', () => {
    const exercise = thirds({ rootPitchClass: 0, hand: 'both' })
    expect(exercise.steps[0]!.notes.map(noteName)).toEqual(['C3', 'E3', 'C4', 'E4'])
    // And it starts where the single-note scale does, in every key.
    for (let rootPitchClass = 0; rootPitchClass < 12; rootPitchClass++) {
      const single = build({ scaleTypeId: 'major', rootPitchClass, hand: 'both' })
      const double = thirds({ rootPitchClass, hand: 'both' })
      expect(double.steps[0]!.notes[2], `pc ${rootPitchClass}`).toBe(single.steps[0]!.notes[1])
    }
  })

  // [pitch class, right hand, left hand] — two octaves, ascending.
  const UP: [number, string, string][] = [
    [
      0,
      '13 24 35 13 24 13 24 13 24 35 13 24 13 24 35',
      '53 42 31 42 31 42 31 53 42 31 42 31 42 31 53',
    ],
    // G, D, A, E and B are C's shape, but turn the left hand at the top on 2 4.
    [
      7,
      '13 24 35 13 24 13 24 13 24 35 13 24 13 24 35',
      '53 42 31 42 31 42 31 53 42 31 42 31 42 31 42',
    ],
    [
      11,
      '13 24 35 13 24 13 24 13 24 35 13 24 13 24 35',
      '53 42 31 42 31 42 31 53 42 31 42 31 42 31 42',
    ],
    [
      6,
      '24 13 24 13 24 35 13 24 13 24 13 24 35 13 24',
      '53 42 31 53 42 31 42 31 42 31 53 42 31 42 31',
    ],
    [
      5,
      '13 24 13 24 13 24 35 13 24 13 24 13 24 35 13',
      '42 31 42 31 53 42 31 42 31 42 31 53 42 31 42',
    ],
    [
      10,
      '24 13 24 35 13 24 13 24 13 24 35 13 24 13 24',
      '31 53 42 31 42 31 42 31 53 42 31 42 31 42 31',
    ],
    [
      3,
      '35 13 24 13 24 13 24 35 13 24 13 24 13 24 35',
      '31 42 31 42 31 53 42 31 42 31 42 31 53 42 31',
    ],
    [
      8,
      '13 24 13 24 35 13 24 13 24 13 24 35 13 24 35',
      '42 31 53 42 31 42 31 42 31 53 42 31 42 31 42',
    ],
    [
      1,
      '13 24 13 24 35 13 24 13 24 13 24 35 13 24 13',
      '42 31 53 42 31 42 31 42 31 53 42 31 42 31 42',
    ],
  ]

  it.each(UP)('fingers major pitch class %i as printed', (rootPitchClass, right, left) => {
    expect(pairs(thirds({ rootPitchClass, hand: 'right' }), 'right')).toBe(right)
    expect(pairs(thirds({ rootPitchClass, hand: 'left' }), 'left')).toBe(left)
  })

  it('gives D, A and E the white-key shape too', () => {
    const [, right, left] = UP[1]!
    for (const rootPitchClass of [2, 9, 4]) {
      expect(pairs(thirds({ rootPitchClass, hand: 'right' }), 'right')).toBe(right)
      expect(pairs(thirds({ rootPitchClass, hand: 'left' }), 'left')).toBe(left)
    }
  })

  it('comes home on the fingers the page does', () => {
    const last = (rootPitchClass: number, hand: 'right' | 'left') =>
      pairs(thirds({ rootPitchClass, hand, direction: 'up-down' }), hand)
        .split(' ')
        .at(-1)
    // Nearly always the ones it set out on.
    expect(last(0, 'left')).toBe('53')
    expect(last(8, 'right')).toBe('13')
    // E♭ sets out on 3 5 and 1 3 and comes home on 2 4 and 3 5.
    expect(last(3, 'right')).toBe('24')
    expect(last(3, 'left')).toBe('53')
    // And D's left hand, alone among the white keys, comes home on 2 4.
    expect(last(2, 'left')).toBe('42')
  })

  it('only ever holds a third one of the three ways, and never the same way twice running', () => {
    // What would be wrong if a letter of the table had been mistyped. (Not
    // "the thumb stays off the black keys": the page opens D♭ and A♭ major
    // with the thumb on the tonic, and that is what is recorded.)
    for (let rootPitchClass = 0; rootPitchClass < 12; rootPitchClass++) {
      for (const hand of ['right', 'left'] as const) {
        const held = pairs(thirds({ rootPitchClass, hand, direction: 'up-down' }), hand).split(' ')
        const ways = hand === 'right' ? ['13', '24', '35'] : ['31', '42', '53']
        held.forEach((pair, index) => {
          const where = `pc ${rootPitchClass} ${hand} at ${index}`
          expect(ways, where).toContain(pair)
          // D major's left hand is printed coming home on 2 4, straight after
          // the 2 4 the pattern gives the note before. It is what the page says.
          const printedTwice = rootPitchClass === 2 && hand === 'left' && index === held.length - 1
          if (index > 0 && !printedTwice) expect(pair, where).not.toBe(held[index - 1])
        })
      }
    }
  })

  it('is offered for the major scales only, and is single notes anywhere else', () => {
    const textures = (id: string) => scaleTexturesFor(SCALE_TYPES.find((type) => type.id === id)!)
    expect(textures('major')).toContain('double-thirds')
    expect(textures('harmonic-minor')).not.toContain('double-thirds')
    const minor = build({ scaleTypeId: 'harmonic-minor', texture: 'double-thirds' })
    expect(minor.notes).toEqual(build({ scaleTypeId: 'harmonic-minor' }).notes)
  })

  it('moves the hands together whatever motion was left selected', () => {
    const exercise = thirds({ rootPitchClass: 0, hand: 'both', motion: 'contrary' })
    expect(exercise.subtitle).toContain('Both Hands · Double Thirds')
    expect(exercise.steps[1]!.label).toBe('D + F')
  })
})

/**
 * Octaves, from the page after the chromatic scale: each hand playing every
 * note with its octave. Staccato is the thumb and little finger throughout;
 * legato takes the 4th finger on the black keys so the hand can join them.
 */
describe('scales in octaves', () => {
  const octaves = (spec: Partial<ScaleSpec>) => build({ octaves: 1, ...spec })
  const outer = (exercise: ReturnType<typeof build>, hand: 'right' | 'left') =>
    exercise.steps
      .map((step) => {
        const fingers = step.fingers.filter((finger) => finger.hand === hand)
        // The thumb is on the inside; the finger that changes is the other one.
        expect(fingers.map((finger) => finger.finger)).toContain(1)
        return fingers.find((finger) => finger.finger !== 1)!.finger
      })
      .join('')

  it('doubles every note at the octave', () => {
    const exercise = octaves({
      scaleTypeId: 'major',
      rootPitchClass: 4,
      texture: 'staccato-octaves',
    })
    expect(exercise.subtitle).toBe('Right Hand · Staccato Octaves · 1 octave · Up (Ascending)')
    for (const step of exercise.steps) expect(step.notes[1]! - step.notes[0]!).toBe(12)
    // One name for both notes, so the step is called by it.
    expect(exercise.steps.map((step) => step.label).join(' ')).toBe('E F♯ G♯ A B C♯ D♯ E')
    expect(exercise.steps[0]!.noteLabels).toBeUndefined()
  })

  it('gives the left hand an octave of its own beneath the right hand’s', () => {
    // The book's example: E major, left hand E2-E3 under right hand E4-E5.
    const exercise = build(
      {
        scaleTypeId: 'major',
        rootPitchClass: 4,
        texture: 'staccato-octaves',
        hand: 'both',
        octaves: 2,
      },
      { range: { low: 21, high: 108 } },
    )
    expect(exercise.steps[0]!.notes.map(noteName)).toEqual(['E2', 'E3', 'E4', 'E5'])
    expect(new Set(exercise.steps[0]!.notes).size).toBe(4)
  })

  it('plays staccato octaves with the thumb and little finger throughout', () => {
    const spec = { scaleTypeId: 'major', rootPitchClass: 4, texture: 'staccato-octaves' } as const
    expect(outer(octaves({ ...spec, hand: 'right' }), 'right')).toBe('55555555')
    expect(outer(octaves({ ...spec, hand: 'left' }), 'left')).toBe('55555555')
    expect(octaves(spec).staccato).toBe(true)
  })

  it('plays legato octaves with the 4th finger on the black keys', () => {
    // The book's two examples. B major: B C♯ D♯ E F♯ G♯ A♯ B.
    const b = { scaleTypeId: 'major', rootPitchClass: 11, texture: 'legato-octaves' } as const
    expect(outer(octaves({ ...b, hand: 'right', direction: 'up-down' }), 'right')).toBe(
      '544544454445445',
    )
    expect(outer(octaves({ ...b, hand: 'left' }), 'left')).toBe('54454445')
    // C minor harmonic: C D E♭ F G A♭ B C.
    const c = {
      scaleTypeId: 'harmonic-minor',
      rootPitchClass: 0,
      texture: 'legato-octaves',
    } as const
    expect(outer(octaves({ ...c, hand: 'right' }), 'right')).toBe('55455455')
    expect(octaves(c).staccato).toBeUndefined()
  })

  it('is there for any scale', () => {
    for (const type of SCALE_TYPES) {
      expect(scaleTexturesFor(type), type.id).toEqual(
        expect.arrayContaining(['single', 'staccato-octaves', 'legato-octaves']),
      )
    }
  })
})

/**
 * I – IV – V – I, which closes the similar-motion line of every key in the
 * book: three chords in the right hand over a bass note in the left.
 */
describe('the closing cadence', () => {
  const closing = (spec: Partial<ScaleSpec>) =>
    build({ cadence: true, direction: 'up-down', octaves: 1, ...spec }).steps.slice(-4)
  const chord = (step: ReturnType<typeof closing>[number]) => step.notes.map(noteName).join(' ')

  it('follows the scale with the four chords, as C major is printed', () => {
    const exercise = build({
      scaleTypeId: 'major',
      rootPitchClass: 0,
      hand: 'both',
      cadence: true,
      direction: 'up-down',
      octaves: 1,
    })
    expect(exercise.subtitle).toBe('Both Hands · 1 octave · Up then Down · Cadence')
    // Fifteen notes of scale, then the four chords.
    expect(exercise.steps).toHaveLength(19)
    const steps = exercise.steps.slice(-4)
    expect(steps.map((step) => step.cue)).toEqual(['I', 'IV', 'V', 'I'])
    expect(steps.map(chord)).toEqual(['C3 E4 G4 C5', 'F3 F4 A4 C5', 'G3 D4 G4 B4', 'C3 E4 G4 C5'])
    expect(steps.map((step) => step.label)).toEqual(['E G C', 'F A C', 'D G B', 'E G C'])
    expect(steps.map((step) => step.fingers.map((finger) => finger.finger).join(''))).toEqual([
      '5125',
      '2135',
      '1124',
      '5125',
    ])
  })

  it('takes a minor key’s dominant from its harmonic form, whichever form was played', () => {
    for (const scaleTypeId of ['natural-minor', 'harmonic-minor', 'melodic-minor']) {
      const steps = closing({ scaleTypeId, rootPitchClass: 9, hand: 'right' })
      expect(
        steps.map((step) => step.label),
        scaleTypeId,
      ).toEqual(['C E A', 'D F A', 'B E G♯', 'C E A'])
    }
    // The raised seventh is named for the staff, and is still not in the scale.
    const natural = build({ scaleTypeId: 'natural-minor', cadence: true, direction: 'up-down' })
    expect(natural.pitchNames[8]).toBe('G♯')
    expect(natural.pitchClasses).not.toContain(8)
  })

  it('gives one hand alone its own part of it', () => {
    const left = closing({ scaleTypeId: 'major', rootPitchClass: 7, hand: 'left' })
    expect(left.map(chord)).toEqual(['G2', 'C3', 'D3', 'G2'])
    expect(left.map((step) => step.fingers[0]!.finger)).toEqual([5, 2, 1, 5])
  })

  it('prints A major’s last chord 1 3 5, where every other key has 1 2 5', () => {
    const last = (rootPitchClass: number) =>
      closing({ scaleTypeId: 'major', rootPitchClass, hand: 'right' })
        .at(-1)!
        .fingers.map((finger) => finger.finger)
        .join('')
    expect(last(9)).toBe('135')
    for (const other of [0, 7, 2, 4, 11, 6, 5, 10, 3, 8, 1])
      expect(last(other), `pc ${other}`).toBe('125')
  })

  it('closes only a scale that has come back down to its tonic', () => {
    const plain = (spec: Partial<ScaleSpec>) => build({ ...spec, cadence: false }).steps.length
    const closed = (spec: Partial<ScaleSpec>) => build({ ...spec, cadence: true }).steps.length
    const major = { scaleTypeId: 'major', rootPitchClass: 0 }
    expect(closed({ ...major, direction: 'up-down' })).toBe(
      plain({ ...major, direction: 'up-down' }) + 4,
    )
    expect(closed({ ...major, direction: 'down' })).toBe(plain({ ...major, direction: 'down' }) + 4)
    // Ascending ends at the top, where there is nothing to close.
    expect(closed({ ...major, direction: 'up' })).toBe(plain({ ...major, direction: 'up' }))
    // Not in contrary motion, not in double thirds, and not for a mode.
    const down = { direction: 'up-down' } as const
    expect(closed({ ...major, ...down, hand: 'both', motion: 'contrary' })).toBe(
      plain({ ...major, ...down, hand: 'both', motion: 'contrary' }),
    )
    expect(closed({ ...major, ...down, texture: 'double-thirds' })).toBe(
      plain({ ...major, ...down, texture: 'double-thirds' }),
    )
    expect(closed({ scaleTypeId: 'dorian', ...down })).toBe(
      plain({ scaleTypeId: 'dorian', ...down }),
    )
    expect(scaleHasCadence(SCALE_TYPES.find((type) => type.id === 'dorian')!)).toBe(false)
  })
})

describe('a scale that divides the beat', () => {
  const lengths = (spec: Partial<ScaleSpec>) =>
    build({ rootPitchClass: 0, scaleTypeId: 'major', direction: 'up-down', ...spec }).steps.map(
      stepBeats,
    )

  it('is one note a beat, with no metre to state, unless asked', () => {
    const exercise = build()
    expect(exercise.steps.every((step) => step.beats === undefined)).toBe(true)
    expect(exercise.meter).toBeUndefined()
  })

  it('in quavers ends on a minim, as the page ends it', () => {
    // Alfred p. 18: two octaves up and back is 28 quavers and a half note,
    // four bars of 4/4.
    const beats = lengths({ octaves: 2, notesPerBeat: 2 })
    expect(beats).toHaveLength(29)
    expect(new Set(beats.slice(0, 28))).toEqual(new Set([0.5]))
    expect(beats[28]).toBe(2)
    expect(beats.reduce((sum, length) => sum + length, 0)).toBe(16)
  })

  it('in semiquavers ends on a crotchet', () => {
    const beats = lengths({ octaves: 2, notesPerBeat: 4 })
    expect(new Set(beats.slice(0, 28))).toEqual(new Set([0.25]))
    expect(beats[28]).toBe(1)
    expect(beats.reduce((sum, length) => sum + length, 0)).toBe(8)
  })

  it('holds a last note that lands between beats to the next beat', () => {
    // One octave up and back in semiquavers: the fifteenth note falls half-way
    // through a beat, and a quaver finishes it.
    expect(lengths({ octaves: 1, notesPerBeat: 4 }).at(-1)).toBe(0.5)
  })

  it('in triplets ends on a triplet where it stops mid-beat', () => {
    // No plain note is two thirds of a beat long, so there is nothing to hold
    // it to the next beat with.
    expect(lengths({ octaves: 2, notesPerBeat: 3 }).at(-1)).toBeCloseTo(1 / 3, 9)
    expect(lengths({ octaves: 1, direction: 'up', notesPerBeat: 3 }).at(-1)).toBeCloseTo(1 / 3, 9)
  })

  it('states common time, says what it is in, and is a different exercise', () => {
    const plain = build({ rootPitchClass: 0, scaleTypeId: 'major' })
    const divided = build({ rootPitchClass: 0, scaleTypeId: 'major', notesPerBeat: 2 })
    expect(divided.meter).toEqual({ beats: 4, beatType: 4 })
    expect(divided.subtitle).toBe('Right Hand · 2 octaves · Up (Ascending) · Eighth Notes')
    expect(divided.id).not.toBe(plain.id)
    // The same notes and the same fingers: only how long each lasts.
    expect(divided.notes).toEqual(plain.notes)
    expect(divided.fingerings).toEqual(plain.fingerings)
  })

  it('leaves the closing cadence in whole beats', () => {
    const exercise = build({
      rootPitchClass: 0,
      scaleTypeId: 'major',
      direction: 'up-down',
      cadence: true,
      notesPerBeat: 2,
    })
    expect(exercise.steps.slice(-4).map(stepBeats)).toEqual([1, 1, 1, 1])
  })

  it('fills the bar from a note that lands on a beat, whatever the metre', () => {
    const steps = Array.from({ length: 5 }, (_, index) => ({
      id: String(index),
      notes: [60 + index],
      fingers: [],
      label: '',
    }))
    // Four quavers and a fifth note on beat three of a bar of three: one beat left.
    expect(inEvenNotes(steps, 2, { beats: 3, beatType: 4 }).at(-1)!.beats).toBe(1)
    expect(inEvenNotes(steps, 1).every((step) => step.beats === undefined)).toBe(true)
  })
})
