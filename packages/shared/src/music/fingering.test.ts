import { describe, expect, it } from 'vitest'
import { scaleFingering } from './fingering.js'
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
    expect(digits(scale('B♭', 'major', 'right').fingers)).toBe('41231234')
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

  it('extends a black-key scale without dropping its opening finger', () => {
    expect(digits(scale('B♭', 'major', 'right', 2).fingers)).toBe('412312341231234')
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
 * Checked against The Complete Book of Scales, Chords, Arpeggios & Cadences
 * (Palmer, Manus & Lethco, Alfred, 1994) — its Guide to Fingering and its two
 * fingering charts. The extracted tables live in sites/piano-content.
 *
 * These are pinned by the degree the 4th finger falls on, which is how that
 * book indexes every scale, and it is the thing that was wrong: the two flat
 * minor left hands had been given their parallel major's shape, which puts the
 * 4th finger on the wrong note of the scale.
 */
describe('published fingerings', () => {
  /** Which degree of the octave the 4th finger lands on, 1-based. */
  const fourthOn = (root: string, type: string, hand: 'right' | 'left') =>
    scale(root, type, hand).fingers.indexOf(4) + 1

  it('places the left-hand 4th finger where the source does', () => {
    // Exceptions to "a major scale and its parallel harmonic minor are
    // fingered alike" — the source names exactly these two.
    expect(digits(scale('E♭', 'natural-minor', 'left').fingers)).toBe('21432132')
    expect(fourthOn('E♭', 'natural-minor', 'left')).toBe(3)

    expect(digits(scale('B♭', 'natural-minor', 'left').fingers)).toBe('21321432')
    expect(fourthOn('B♭', 'natural-minor', 'left')).toBe(6)
  })

  it('keeps G♯ minor on its own left hand', () => {
    // The one scale whose natural-minor LH differs from its harmonic minor:
    // the 4th finger sits on F♯, the 7th degree, not on C♯, the 4th.
    expect(digits(scale('G♯', 'natural-minor', 'left').fingers)).toBe('32132143')
    expect(fourthOn('G♯', 'natural-minor', 'left')).toBe(7)
  })

  it('agrees with the major chart', () => {
    expect(digits(scale('C', 'major', 'right').fingers)).toBe('12312345')
    expect(digits(scale('F', 'major', 'right').fingers)).toBe('12341234')
    expect(digits(scale('B', 'major', 'left').fingers)).toBe('43214321')
    expect(digits(scale('F♯', 'major', 'right').fingers)).toBe('23412312')
    expect(digits(scale('F♯', 'major', 'left').fingers)).toBe('43213214')
    expect(digits(scale('D♭', 'major', 'right').fingers)).toBe('23123412')
    expect(digits(scale('A♭', 'major', 'right').fingers)).toBe('34123123')
    expect(digits(scale('E♭', 'major', 'right').fingers)).toBe('31234123')
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
 * The page headers, which is how the source itself indexes a scale.
 *
 * Every per-key page names the degree its 4th finger falls on, for each hand,
 * before it prints a note. Checking against that rather than against the digits
 * catches a wrong pattern that happens to be playable — which is what the minor
 * scales used to be, handed the parallel major's shape.
 */
describe('checked against the page headers', () => {
  const anchorDegrees = (pitchClass: number, typeId: string, hand: 'right' | 'left') => {
    const type = findScaleType(typeId)!
    const fingering = scaleFingering({
      rootName: spellScale(pitchClass, type).root.name,
      scaleTypeId: typeId,
      hand,
      octaves: 1,
      notes: octaveNotes(pitchClass, type),
    })
    // Degrees 1-7. The octave note carries whichever finger opens the next
    // octave, which is not an anchor — the source counts the 4th finger once
    // per octave, inside the scale.
    return fingering.fingers.slice(0, 7).flatMap((finger, i) => (finger === 4 ? [i + 1] : []))
  }

  // [pitch class, left-hand degrees, right-hand degrees]
  it.each([
    [0, [2], [7]],
    [7, [2], [7]],
    [2, [2], [7]],
    [9, [2], [7]],
    [4, [2], [7]],
    [11, [1, 5], [7]],
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
    [11, [1, 5], [7]],
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
    // "Melodic minor scale... RH 4th finger on A♯ ascending, D♯ descending"
    // (C♯ minor) and "on D♯ ascending, G♯ descending" (F♯ minor). Everywhere
    // else the raised sixth lands where the harmonic fingering already puts a
    // finger, which is why only these two keys differ.
    expect(anchorDegrees(1, 'melodic-minor', 'right')).toEqual([6])
    expect(anchorDegrees(6, 'melodic-minor', 'right')).toEqual([6])
    expect(anchorDegrees(1, 'melodic-minor', 'left')).toEqual([4])
    expect(anchorDegrees(6, 'melodic-minor', 'left')).toEqual([1])
  })

  it('puts the melodic minor 4th finger back on the way down', () => {
    // Coming down, a melodic minor is a natural minor and is fingered as one.
    // Mirroring the ascending fingering would carry the raised sixth's hand
    // into a descent that does not have a raised sixth in it.
    for (const [pitchClass, hand, ascending, descending] of [
      [1, 'right', 'A♯', 'D♯'],
      [6, 'right', 'D♯', 'G♯'],
      [8, 'left', 'D♭', 'F♯'],
      [10, 'left', 'G', 'G♭'],
    ] as const) {
      const exercise = buildScaleExercise({
        kind: 'scale',
        rootPitchClass: pitchClass,
        scaleTypeId: 'melodic-minor',
        hand,
        octaves: 1,
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
    // The speller writes pitch class 3 as D♯ in a minor key and E♭ in a major
    // one. Keyed by name, the minor lookup missed and the scale silently fell
    // through to a worked-out fingering; keyed by pitch class it cannot.
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
    // RH takes 2 on C and F; LH takes 2 on E and B.
    expect(digits(right.fingers)).toBe('2313123131312')
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
