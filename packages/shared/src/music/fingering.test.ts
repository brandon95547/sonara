import { describe, expect, it } from 'vitest'
import { scaleFingering } from './fingering.js'
import {
  DEFAULT_FINGERING_SYSTEM,
  FINGERING_SYSTEM_IDS,
  fingeringSystem,
} from './fingering-system.js'
import { fourthFingerAnchors } from './theory.js'
import { buildScaleExercise } from '../learning/scale-exercise.js'
import { SCALE_TYPES, findScaleType, octaveNotes, spellScale } from './scales.js'

const digits = (fingers: readonly number[]) => fingers.join('')

const scale = (rootName: string, scaleTypeId: string, hand: 'right' | 'left', octaves = 1) =>
  scaleFingering({ rootName, scaleTypeId, hand, octaves, notes: [] })

describe('standard fingerings', () => {
  it('knows the one-octave majors every method book opens with', () => {
    expect(digits(scale('C', 'major', 'right').fingers)).toBe('12312345')
    expect(digits(scale('C', 'major', 'left').fingers)).toBe('54321321')
    expect(digits(scale('F', 'major', 'right').fingers)).toBe('12341234')
    // The book opens B♭ on the 2nd finger; the 4th arrives an octave up.
    expect(digits(scale('B♭', 'major', 'right').fingers)).toBe('21231234')
    expect(digits(scale('B', 'major', 'left').fingers)).toBe('43214321')
  })

  it('never puts a thumb on a black key in a standard fingering', () => {
    // The rule the whole system rests on. If a stored pattern breaks it, the
    // fingering is unplayable and no other test would notice.
    const roots = ['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'D♭', 'A♭', 'E♭', 'B♭', 'F']
    for (const root of roots) {
      for (const hand of ['right', 'left'] as const) {
        const exercise = buildScaleExercise({
          kind: 'scale',
          rootPitchClass: pitchClassOf(root),
          scaleTypeId: 'major',
          hand,
          octaves: 1,
          direction: 'up',
        })
        exercise.steps.forEach((step) => {
          if (step.fingers[0]!.finger !== 1) return
          expect(isBlack(step.notes[0]!), `${root} ${hand} thumb on ${step.label}`).toBe(false)
        })
      }
    }
  })

  it('marks a stored pattern as standard and a computed one as derived', () => {
    expect(scale('C', 'major', 'right').source).toBe('standard')
    expect(scale('C', 'major', 'right').fingers.length).toBe(8)
    // Lydian has no stored table; it is derived, and says so.
    expect(scale('C', 'lydian', 'right').source).toBe('derived')
  })
})

describe('extending across octaves', () => {
  it('keeps the right hand’s little finger for the very last note only', () => {
    // 5 is a terminal finger: it has nowhere to go after itself, so a 5 in the
    // middle of an ascending scale is a hand that has run out of fingers.
    const fingers = scale('C', 'major', 'right', 2).fingers
    expect(digits(fingers)).toBe('123123412312345')
    expect(fingers.indexOf(5)).toBe(fingers.length - 1)
  })

  it('keeps the left hand’s little finger for the very first note only', () => {
    const fingers = scale('C', 'major', 'left', 2).fingers
    expect(digits(fingers)).toBe('543213214321321')
    expect(fingers.lastIndexOf(5)).toBe(0)
  })

  it('produces one finger per note', () => {
    for (const octaves of [1, 2, 3, 4]) {
      expect(scale('C', 'major', 'right', octaves).fingers.length).toBe(7 * octaves + 1)
      expect(scale('C', 'major', 'left', octaves).fingers.length).toBe(7 * octaves + 1)
    }
  })

  it('opens a black-key scale as the page does, at any length', () => {
    // 2 on the first B♭ only. Every B♭ after it takes the 4th finger.
    expect(digits(scale('B♭', 'major', 'right', 2).fingers)).toBe('212312341231234')
    expect(digits(scale('B♭', 'major', 'right', 3).fingers)).toBe('2123123412312341231234')
  })

  it('turns at the top as the page does, at any length', () => {
    // F♯ major's left hand takes F♯ with the 4th finger, except the last one.
    expect(digits(scale('F♯', 'major', 'left', 1).fingers)).toBe('43213212')
    expect(digits(scale('F♯', 'major', 'left', 3).fingers)).toBe('4321321432132143213212')
  })
})

describe('crossings', () => {
  it('finds the thumb passing under in the right hand', () => {
    // C major RH: 1 2 3 | 1 2 3 4 5 — the thumb goes under at F, index 3.
    expect(scale('C', 'major', 'right').crossings).toEqual([3])
  })

  it('finds the hand crossing over in the left hand', () => {
    // C major LH ascending: 5 4 3 2 1 | 3 2 1 — the cross is after the thumb.
    expect(scale('C', 'major', 'left').crossings).toEqual([5])
  })

  it('finds every crossing in a two-octave scale', () => {
    // 1 2 3 [1] 2 3 4 [1] 2 3 [1] 2 3 4 5 — three thumb-unders, and the final
    // 5 is not one: the hand stops there rather than passing under again.
    expect(scale('C', 'major', 'right', 2).crossings).toEqual([3, 7, 10])
  })
})

function pitchClassOf(root: string): number {
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
  const letter = base[root[0]!]!
  const accidental = root.includes('♯') ? 1 : root.includes('♭') ? -1 : 0
  return (letter + accidental + 12) % 12
}

function isBlack(note: number): boolean {
  return [1, 3, 6, 8, 10].includes(((note % 12) + 12) % 12)
}

/**
 * The Traditional system, checked line by line against the page.
 *
 * Every string below is one hand of one line of *The Brown Scale Book* —
 * "Similar motion in octaves", two octaves — read off the printed digits and
 * filled in between them the only way consecutive fingers allow. Typed out
 * here rather than generated, so that a slip in the tables shows up as a
 * disagreement instead of agreeing with itself.
 *
 * What these pin above all is the ends of each run. The book opens and turns
 * several scales on a finger the same note never takes again, and it is exactly
 * those digits that a tidier fingering smooths away.
 */
describe('the Brown Scale Book, as printed', () => {
  const WHITE_RH = '123123412312345'
  const WHITE_LH = '543213214321321'

  const run = (root: string, type: string, hand: 'right' | 'left') =>
    digits(scale(root, type, hand, 2).fingers)

  // [tonic, right hand, left hand] — ascending, bottom note first.
  it.each([
    ['C', WHITE_RH, WHITE_LH],
    ['G', WHITE_RH, WHITE_LH],
    ['D', WHITE_RH, WHITE_LH],
    ['A', WHITE_RH, WHITE_LH],
    ['E', WHITE_RH, WHITE_LH],
    ['B', WHITE_RH, '432143213214321'],
    ['F♯', '234123123412312', '432132143213212'],
    ['F', '123412312341234', WHITE_LH],
    ['B♭', '212312341231234', '321432132143213'],
    ['E♭', '212341231234123', '321432132143212'],
    ['A♭', '231231234123123', '321432132143212'],
    ['D♭', '231234123123412', '321432132143212'],
  ])('%s major', (tonic, right, left) => {
    expect(run(tonic, 'major', 'right')).toBe(right)
    expect(run(tonic, 'major', 'left')).toBe(left)
  })

  it.each([
    ['A', WHITE_RH, WHITE_LH],
    ['E', WHITE_RH, WHITE_LH],
    ['B', WHITE_RH, '432143213214321'],
    ['F♯', '231231234123123', '432132143213212'],
    ['C♯', '231231234123123', '321432132143212'],
    ['G♯', '231231234123123', '321432132143212'],
    ['D♯', '212341231234123', '214321321432132'],
    ['D', WHITE_RH, WHITE_LH],
    ['G', WHITE_RH, WHITE_LH],
    ['C', WHITE_RH, WHITE_LH],
    ['F', '123412312341234', WHITE_LH],
    // The one left hand that opens a black-key scale on the little finger.
    ['B♭', '212312341231234', '543214321321432'],
  ])('%s minor, harmonic form', (tonic, right, left) => {
    expect(run(tonic, 'harmonic-minor', 'right')).toBe(right)
    expect(run(tonic, 'harmonic-minor', 'left')).toBe(left)
  })

  /** The whole melodic line as it is played: up, and back down from the top. */
  const melodic = (pitchClass: number, hand: 'right' | 'left') => {
    const fingers = buildScaleExercise({
      kind: 'scale',
      rootPitchClass: pitchClass,
      scaleTypeId: 'melodic-minor',
      hand,
      octaves: 2,
      direction: 'up-down',
    }).steps.map((step) => step.fingers[0]!.finger)
    return [digits(fingers.slice(0, 15)), digits(fingers.slice(14))]
  }

  const WHITE_RH_DOWN = '543213214321321'
  const WHITE_LH_DOWN = '123123412312345'

  // [tonic, pitch class, RH up, RH down, LH up, LH down] — down is read from
  // the top note, which the two halves share.
  it.each([
    ['A', 9, WHITE_RH, WHITE_RH_DOWN, WHITE_LH, WHITE_LH_DOWN],
    ['E', 4, WHITE_RH, WHITE_RH_DOWN, WHITE_LH, WHITE_LH_DOWN],
    ['B', 11, WHITE_RH, WHITE_RH_DOWN, '432143213214321', '123412312341234'],
    ['F♯', 6, '231234123123413', '321321432132132', '432132143213212', '212312341231234'],
    ['C♯', 1, '231234123123413', '321321432132132', '321432132143212', '212341231234123'],
    // Opens 3 4 where the harmonic form on the same page opens 2 3, and the
    // left hand comes off the top 2 3 1.
    ['G♯', 8, '341231234123123', '321321432132143', '321432132143212', '231231234123123'],
    ['D♯', 3, '212341231234123', '321432132143212', '214321321432132', '231234123123412'],
    ['D', 2, WHITE_RH, WHITE_RH_DOWN, WHITE_LH, WHITE_LH_DOWN],
    ['G', 7, WHITE_RH, WHITE_RH_DOWN, WHITE_LH, WHITE_LH_DOWN],
    ['C', 0, WHITE_RH, WHITE_RH_DOWN, WHITE_LH, WHITE_LH_DOWN],
    ['F', 5, '123412312341234', '432143213214321', WHITE_LH, WHITE_LH_DOWN],
    ['B♭', 10, '212312341231234', '432132143213212', '213214321321432', '234123123412312'],
  ])('%s minor, melodic form', (_tonic, pitchClass, rightUp, rightDown, leftUp, leftDown) => {
    expect(melodic(pitchClass, 'right')).toEqual([rightUp, rightDown])
    expect(melodic(pitchClass, 'left')).toEqual([leftUp, leftDown])
  })

  it('comes back down the way it went up, in every major and harmonic minor key', () => {
    // The book prints the descent and it is the ascent read backwards — the
    // closing finger included: A♭ major is printed ending 3 2.
    for (const scaleTypeId of ['major', 'harmonic-minor']) {
      for (let pitchClass = 0; pitchClass < 12; pitchClass++) {
        for (const hand of ['right', 'left'] as const) {
          const fingers = buildScaleExercise({
            kind: 'scale',
            rootPitchClass: pitchClass,
            scaleTypeId,
            hand,
            octaves: 2,
            direction: 'up-down',
          }).steps.map((step) => step.fingers[0]!.finger)
          expect(fingers.slice(14), `${scaleTypeId} pc ${pitchClass} ${hand}`).toEqual(
            fingers.slice(0, 15).reverse(),
          )
        }
      }
    }
    expect(digits(scale('A♭', 'major', 'right', 2).fingers.slice(0, 2))).toBe('23')
  })

  it('fingers a natural minor as the melodic form comes down', () => {
    // The book has no natural minor line of its own. The notes are the
    // melodic form's descent, and that is the fingering it prints for them.
    expect(digits(scale('G♯', 'natural-minor', 'left', 2).fingers)).toBe('321321432132132')
    expect(digits(scale('F♯', 'natural-minor', 'right', 2).fingers)).toBe('231231234123123')
  })

  it('says nothing about a scale the book does not print', () => {
    for (const scaleTypeId of ['dorian', 'lydian', 'blues', 'whole-tone', 'minor-pentatonic']) {
      const result = fingeringSystem('traditional').scale({
        tonic: 'C',
        scaleTypeId,
        hand: 'right',
        octaves: 1,
        notes: [60, 62, 64, 65, 67, 69, 71, 72],
      })
      expect(result, scaleTypeId).toBeNull()
    }
  })
})

/**
 * A key is its name, not its piano keys.
 *
 * The book prints D♯ minor. E♭ minor is the same seven keys and a different
 * key — six flats, every note renamed — so the tables hold D♯ minor under that
 * name and the step from E♭ minor to it is a stated one.
 */
describe('keys and their enharmonic twins', () => {
  it('prints D♯ minor, and plays E♭ minor from that page', () => {
    for (const form of ['natural-minor', 'harmonic-minor', 'melodic-minor']) {
      for (const hand of ['right', 'left'] as const) {
        const printed = scale('D♯', form, hand, 2)
        const borrowed = scale('E♭', form, hand, 2)
        expect(printed.source).toBe('standard')
        expect(borrowed.source).toBe('standard')
        expect(digits(borrowed.fingers), `${form} ${hand}`).toBe(digits(printed.fingers))
      }
    }
  })

  it('follows the book’s own two: F♯ major is G♭ major, D♭ major is C♯ major', () => {
    expect(digits(scale('G♭', 'major', 'right', 2).fingers)).toBe('234123123412312')
    expect(digits(scale('C♯', 'major', 'left', 2).fingers)).toBe('321432132143212')
  })

  it('does not find a key by its piano keys alone', () => {
    // D♭ minor is not a key the book prints or a twin it names. Pitch class 1
    // has a minor page — C♯ minor — and a lookup by pitch class would hand
    // that over; a lookup by name does not.
    expect(scale('D♭', 'harmonic-minor', 'right').source).toBe('derived')
    expect(scale('C♯', 'harmonic-minor', 'right').source).toBe('standard')
  })

  it('reads a tonic however it is typed', () => {
    expect(digits(scale('Bb', 'major', 'right').fingers)).toBe(
      digits(scale('B♭', 'major', 'right').fingers),
    )
  })
})

describe('fingering systems', () => {
  it('has one, and it is the default', () => {
    expect(FINGERING_SYSTEM_IDS).toEqual(['traditional'])
    expect(DEFAULT_FINGERING_SYSTEM).toBe('traditional')
    expect(fingeringSystem().name).toBe('Traditional / Orthodox')
    // Anything unrecognised — a setting saved by a later version — is the default.
    expect(fingeringSystem('no-such-system').id).toBe('traditional')
  })

  it('changes the fingers and never the notes', () => {
    // The spec says what is played; the system only says how it is fingered.
    for (const type of SCALE_TYPES) {
      for (let pitchClass = 0; pitchClass < 12; pitchClass++) {
        const spec = {
          kind: 'scale',
          rootPitchClass: pitchClass,
          scaleTypeId: type.id,
          hand: 'both',
          octaves: 2,
          direction: 'up-down',
        } as const
        const plain = buildScaleExercise(spec)
        const named = buildScaleExercise(spec, { fingering: 'traditional' })
        expect(named.notes, `${type.id} pc ${pitchClass}`).toEqual(plain.notes)
        expect(named.steps.map((step) => step.label)).toEqual(plain.steps.map((step) => step.label))
      }
    }
  })
})

/**
 * A sweep over everything the app can put in front of somebody.
 *
 * Only two of the fourteen scale types have a published fingering, so twelve of
 * them are worked out — and until this sweep existed, several were worked out
 * wrongly enough to be unplayable. Whole tone came out as `1 2 3 4 5 5 5`,
 * asking the little finger for three rising notes in a row, because the code
 * treated "the thumb avoids black keys" as a rule that could not be broken and
 * "the hand has five fingers" as one that could.
 */
describe('every scale the app can build', () => {
  // Genuinely slow rather than accidentally slow: it builds every one of the
  // 1,344 exercises. Under a full parallel run it has flaked past the default
  // five seconds more than once, which reads as a broken fingering engine and
  // is not one.
  const SWEEP_TIMEOUT = 30_000

  const combinations = SCALE_TYPES.flatMap((type) =>
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].flatMap((pitchClass) =>
      (['right', 'left'] as const).flatMap((hand) =>
        [1, 2, 3, 4].map((octaves) => {
          const exercise = buildScaleExercise({
            kind: 'scale',
            rootPitchClass: pitchClass,
            scaleTypeId: type.id,
            hand,
            octaves,
            direction: 'up',
          })
          return {
            where: `${type.id}/${spellScale(pitchClass, type).root.name}/${hand}/${octaves}oct`,
            hand,
            pitchClass,
            type,
            fingers: exercise.steps.map((step) => step.fingers[0]!.finger),
            notes: exercise.steps.map((step) => step.notes[0]!),
          }
        }),
      ),
    ),
  )

  it(
    'covers every scale type, key, hand and length',
    () => {
      expect(combinations).toHaveLength(SCALE_TYPES.length * 12 * 2 * 4)
    },
    SWEEP_TIMEOUT,
  )

  it(
    'never asks for a finger the hand does not have',
    () => {
      for (const { where, fingers } of combinations) {
        for (const finger of fingers) {
          expect(finger, `${where}: finger ${finger}`).toBeGreaterThanOrEqual(1)
          expect(finger, `${where}: finger ${finger}`).toBeLessThanOrEqual(5)
        }
      }
    },
    SWEEP_TIMEOUT,
  )

  it(
    'never asks one finger for two notes in a row',
    () => {
      // The exact shape of the old failure: a hand that has run out moves on
      // without moving its fingers.
      for (const { where, fingers } of combinations) {
        for (let i = 1; i < fingers.length; i++) {
          expect(fingers[i], `${where} at ${i}`).not.toBe(fingers[i - 1])
        }
      }
    },
    SWEEP_TIMEOUT,
  )

  it(
    'saves the little finger for the end of the scale',
    () => {
      // 5 has nowhere to go after itself, so in an ascending scale it belongs on
      // the last note in the right hand and the first in the left, and nowhere
      // else in either.
      for (const { where, hand, fingers } of combinations) {
        const inside = hand === 'right' ? fingers.slice(0, -1) : fingers.slice(1)
        expect(inside, `${where}`).not.toContain(5)
      }
    },
    SWEEP_TIMEOUT,
  )

  it(
    'keeps the thumb off black keys wherever the scale allows it',
    () => {
      // A preference, not a law — a scale with almost no white keys has to break
      // it, and breaking it is far better than running out of fingers. So the
      // rule is enforced only where it can be kept.
      for (const { where, pitchClass, type, fingers, notes } of combinations) {
        const whiteKeys = octaveNotes(pitchClass, type).filter((note) => !isBlack(note)).length
        if (whiteKeys < 3) continue
        fingers.forEach((finger, index) => {
          if (finger !== 1) return
          expect(isBlack(notes[index]!), `${where} thumb at ${index}`).toBe(false)
        })
      }
    },
    SWEEP_TIMEOUT,
  )

  it(
    'gives every note exactly one finger',
    () => {
      for (const { where, fingers, notes } of combinations) {
        expect(fingers.length, where).toBe(notes.length)
      }
    },
    SWEEP_TIMEOUT,
  )
})

/**
 * Where the 4th finger falls, which is the handle a scale is remembered by.
 *
 * Checking it as well as the digits catches a wrong pattern that happens to be
 * playable — which is what the minor scales once were, handed the parallel
 * major's shape.
 */
describe('where the 4th finger falls', () => {
  const anchorDegrees = (pitchClass: number, typeId: string, hand: 'right' | 'left') => {
    const type = findScaleType(typeId)!
    const fingering = scaleFingering({
      rootName: spellScale(pitchClass, type).root.name,
      scaleTypeId: typeId,
      hand,
      octaves: 1,
      notes: octaveNotes(pitchClass, type),
    })
    // Degrees 1-7, from the body of the run: the finger each note takes
    // mid-scale, clear of how one printed octave happens to open or turn.
    return fourthFingerAnchors(fingering, hand).map((degree) => degree + 1)
  }

  // [pitch class, left-hand degrees, right-hand degrees]
  it.each([
    [0, [2], [7]],
    [7, [2], [7]],
    [2, [2], [7]],
    [9, [2], [7]],
    [4, [2], [7]],
    [11, [5], [7]],
    [6, [1], [3]],
    [1, [4], [6]],
    [8, [4], [2]],
    [3, [4], [5]],
    [10, [4], [1]],
    [5, [2], [4]],
  ])('major pitch class %i anchors on %j and %j', (pitchClass, left, right) => {
    expect(anchorDegrees(pitchClass, 'major', 'left')).toEqual(left)
    expect(anchorDegrees(pitchClass, 'major', 'right')).toEqual(right)
  })

  it.each([
    [9, [2], [7]],
    [4, [2], [7]],
    [11, [5], [7]],
    [6, [1], [2]],
    [1, [4], [2]],
    [8, [4], [2]],
    [3, [3], [5]],
    [10, [6], [1]],
    [2, [2], [7]],
    [7, [2], [7]],
    [0, [2], [7]],
    [5, [2], [4]],
  ])('harmonic minor pitch class %i anchors on %j and %j', (pitchClass, left, right) => {
    expect(anchorDegrees(pitchClass, 'harmonic-minor', 'left')).toEqual(left)
    expect(anchorDegrees(pitchClass, 'harmonic-minor', 'right')).toEqual(right)
  })

  it('moves the melodic minor 4th finger onto the raised sixth', () => {
    // C♯ minor: the right hand's 4th finger is on A♯ going up and D♯ coming
    // down. F♯ minor: on D♯ going up and G♯ coming down. Everywhere else the
    // raised sixth lands where the harmonic fingering already puts a finger,
    // which is why only these two keys differ.
    expect(anchorDegrees(1, 'melodic-minor', 'right')).toEqual([6])
    expect(anchorDegrees(6, 'melodic-minor', 'right')).toEqual([6])
    expect(anchorDegrees(1, 'melodic-minor', 'left')).toEqual([4])
    expect(anchorDegrees(6, 'melodic-minor', 'left')).toEqual([1])
  })

  it('puts the melodic minor 4th finger back on the way down', () => {
    // Coming down, a melodic minor is a natural minor and is fingered as one.
    // Mirroring the ascending fingering would carry the raised sixth's hand
    // into a descent that does not have a raised sixth in it.
    // Pitch class 8 is G♯ minor in every form: the ascending 4th finger is
    // on C♯, the fourth degree. It used to be named A♭ melodic minor on the
    // way up and G♯ natural minor on the way down — one scale, two keys —
    // because the raised sixth's F𝄪 was counted against the G♯ spelling.
    for (const [pitchClass, hand, ascending, descending] of [
      [1, 'right', 'A♯', 'D♯'],
      [6, 'right', 'D♯', 'G♯'],
      [8, 'left', 'C♯', 'F♯'],
      [10, 'left', 'G', 'G♭'],
    ] as const) {
      const exercise = buildScaleExercise({
        kind: 'scale',
        rootPitchClass: pitchClass,
        scaleTypeId: 'melodic-minor',
        hand,
        // Two octaves: in one, the page's own opening covers the very notes
        // the 4th finger would otherwise be seen on.
        octaves: 2,
        direction: 'up-down',
      })
      const turn = exercise.steps.findIndex(
        (step, i) => i > 0 && step.notes[0]! < exercise.steps[i - 1]!.notes[0]!,
      )
      const fourths = (steps: typeof exercise.steps) =>
        steps.filter((step) => step.fingers[0]!.finger === 4).map((step) => step.label)
      expect(fourths(exercise.steps.slice(0, turn)), `${hand} up`).toContain(ascending)
      expect(fourths(exercise.steps.slice(turn)), `${hand} down`).toContain(descending)
    }
  })

  it('finds a key under either of its names', () => {
    // The book prints D♯ minor; E♭ minor is played from that page, and says
    // so. Neither falls through to a worked-out fingering.
    expect(scale('D♯', 'natural-minor', 'left').source).toBe('standard')
    expect(digits(scale('D♯', 'natural-minor', 'left').fingers)).toBe(
      digits(scale('E♭', 'natural-minor', 'left').fingers),
    )
    expect(scale('G♭', 'major', 'right').source).toBe('standard')
    expect(digits(scale('G♭', 'major', 'right').fingers)).toBe(
      digits(scale('F♯', 'major', 'right').fingers),
    )
  })
})

describe('working a fingering out', () => {
  it('reproduces the published scales it never has to touch', () => {
    // The strongest check available on the rules the worked-out path follows:
    // run it over the notes of the 24 scales the source prints, and see whether
    // it lands where the source landed. Where it differs it should differ only
    // at the outer notes, which is where the source itself prints a second
    // fingering in parentheses.
    const middleDifferences: string[] = []
    for (const typeId of ['major', 'harmonic-minor']) {
      const type = findScaleType(typeId)!
      for (let pitchClass = 0; pitchClass < 12; pitchClass++) {
        for (const hand of ['right', 'left'] as const) {
          const rootName = spellScale(pitchClass, type).root.name
          const notes = octaveNotes(pitchClass, type)
          const published = scaleFingering({
            rootName,
            scaleTypeId: typeId,
            hand,
            octaves: 1,
            notes,
          })
          const workedOut = scaleFingering({
            rootName,
            scaleTypeId: 'no-such-scale',
            hand,
            octaves: 1,
            notes,
          })
          expect(published.source).toBe('standard')
          expect(workedOut.source).toBe('derived')
          // The opening alternative can cover two notes ("A♭ major may begin
          // with 3 4") and the closing one covers the last, so the stretch that
          // has to agree is the third note through the seventh.
          for (const i of [2, 3, 4, 5, 6]) {
            if (published.fingers[i] !== workedOut.fingers[i]) {
              middleDifferences.push(
                `${typeId}/${rootName}/${hand}: ${digits(published.fingers)} vs ${digits(workedOut.fingers)}`,
              )
            }
          }
        }
      }
    }
    expect(middleDifferences).toEqual([])
  })

  it('fingers the chromatic scale the way the source does', () => {
    // Given rather than worked out: 3 on every black key, the thumb on every
    // white one, except where two white keys touch and one has to give way.
    const notes = Array.from({ length: 13 }, (_, i) => 60 + i)
    const right = scaleFingering({
      rootName: 'C',
      scaleTypeId: 'chromatic',
      hand: 'right',
      octaves: 1,
      notes,
    })
    const left = scaleFingering({
      rootName: 'C',
      scaleTypeId: 'chromatic',
      hand: 'left',
      octaves: 1,
      notes,
    })
    // RH takes 2 on C and F; LH takes 2 on E and B. And the right hand's
    // lowest note is a thumb even though it is a C: the page starts and ends
    // its chromatic line on 1 and plays the Cs above on 2.
    expect(digits(right.fingers)).toBe('1313123131312')
    expect(digits(left.fingers)).toBe('1313213131321')
    expect(right.source).toBe('standard')
  })
})

describe('the turn, and passages that are not scales', () => {
  it('never asks one finger for both notes either side of the turn', () => {
    // Up-and-down plays the top note once. The way up and the way down have to
    // agree about which finger holds it — a melodic minor is fingered as two
    // different scales, and when its ascent ended on a different finger from
    // the one its descent began on, the top note and its neighbour came out
    // with the same finger.
    const clashes: string[] = []
    for (const type of SCALE_TYPES) {
      for (let pitchClass = 0; pitchClass < 12; pitchClass++) {
        for (const hand of ['right', 'left'] as const) {
          for (const octaves of [1, 2, 3]) {
            const exercise = buildScaleExercise({
              kind: 'scale',
              rootPitchClass: pitchClass,
              scaleTypeId: type.id,
              hand,
              octaves,
              direction: 'up-down',
            })
            const fingers = exercise.steps.map((step) => step.fingers[0]!.finger)
            const notes = exercise.steps.map((step) => step.notes[0]!)
            for (let i = 1; i < fingers.length; i++) {
              if (fingers[i] === fingers[i - 1] && notes[i] !== notes[i - 1]) {
                clashes.push(`${type.id}/pc${pitchClass}/${hand}/${octaves}oct at ${i}`)
              }
            }
          }
        }
      }
    }
    expect(clashes).toEqual([])
  })

  it('fingers a fragment rather than insisting on a scale', () => {
    const fragment = (notes: number[], hand: 'right' | 'left' = 'right') =>
      scaleFingering({ rootName: 'C', scaleTypeId: 'not-a-scale', hand, octaves: 1, notes }).fingers

    expect(fragment([])).toEqual([])
    expect(fragment([60])).toEqual([1]) // middle C, so the thumb
    expect(fragment([61])).toEqual([2]) // a lone black key is nobody's thumb
    expect(fragment([61, 63])).toEqual([2, 3])
    // Six black keys in a row leave no white key to take the thumb, and the
    // hand needs it anyway. Preference yields; the fingering stays playable.
    expect(fragment([61, 63, 66, 68, 70, 73])).toEqual([2, 3, 1, 2, 3, 4])
  })

  it('does not claim a published fingering it did not use', () => {
    // Chromatic is applied by rule from the notes, so with no notes there is
    // no rule to apply and nothing published about the answer.
    const empty = scaleFingering({
      rootName: 'C',
      scaleTypeId: 'chromatic',
      hand: 'right',
      octaves: 1,
      notes: [],
    })
    expect(empty.fingers).toEqual([])
    expect(empty.source).toBe('derived')
  })
})
