import { describe, expect, it } from 'vitest'
import { noteName } from '../midi/notes.js'
import { KEY_MODES } from '../music/chords.js'
import { stepBeats, type Exercise } from './exercise.js'
import {
  buildRoutineExercise,
  DEFAULT_ROUTINE_SPEC,
  routineHands,
  ROUTINES,
  type RoutineSpec,
} from './routine-exercise.js'

const routine = (spec: Partial<RoutineSpec>, options = {}) =>
  buildRoutineExercise({ ...DEFAULT_ROUTINE_SPEC, ...spec }, options)

type Side = 'left' | 'right'

/** One hand's notes at each step, as names joined by `+`; `-` where it rests. */
const notesOf = (exercise: Exercise, hand: Side) =>
  exercise.steps.map((step) => {
    const mine = step.notes.filter((_, index) => step.fingers[index]!.hand === hand)
    return mine.length > 0 ? mine.map((note) => noteName(note)).join('+') : '-'
  })

/** One hand's fingers at each step, as digits; `-` where it rests. */
const fingersOf = (exercise: Exercise, hand: Side) =>
  exercise.steps.map((step) => {
    const mine = step.fingers.filter((finger) => finger.hand === hand)
    return mine.length > 0 ? mine.map((finger) => finger.finger).join('') : '-'
  })

const beatsOf = (exercise: Exercise) =>
  Math.round(exercise.steps.reduce((sum, step) => sum + stepBeats(step), 0) * 1000) / 1000

/** The section names a routine announces, leaving out the thumb-under cues. */
const sections = (exercise: Exercise) =>
  exercise.steps.flatMap((step) =>
    step.cue && !/Thumb under|Cross over/.test(step.cue) ? [step.cue] : [],
  )

/*
 * Each routine is checked against the page it comes from: Alfred, The Complete
 * Book of Scales, Chords, Arpeggios & Cadences, pp. 80–86, where every one of
 * them is printed in C. These are the notes and the finger numbers on those
 * pages, read off the page.
 */

describe('the blocked scale (p. 81)', () => {
  const both = routine({ routine: 'blocked', hand: 'both' })

  it('plays each thumb note alone and the fingers between thumbs together', () => {
    expect(fingersOf(both, 'right').join(' ')).toBe('1 23 1 234 1 23 1 234 5 234 1 23 1 234 1 23 1')
    expect(fingersOf(both, 'left').join(' ')).toBe('5 432 1 32 1 432 1 32 1 32 1 432 1 32 1 432 5')
    expect(notesOf(both, 'right').slice(0, 5)).toEqual(['C4', 'D4+E4', 'F4', 'G4+A4+B4', 'C5'])
    expect(notesOf(both, 'left').slice(0, 5)).toEqual(['C3', 'D3+E3+F3', 'G3', 'A3+B3', 'C4'])
  })

  it('is in half notes and ends on a whole one: nine bars of four', () => {
    expect(both.meter).toEqual({ beats: 4, beatType: 4 })
    expect(new Set(both.steps.slice(0, -1).map(stepBeats))).toEqual(new Set([2]))
    expect(stepBeats(both.steps.at(-1)!)).toBe(4)
    expect(beatsOf(both)).toBe(36)
  })

  it('keeps the two hands block against block in every key', () => {
    for (const mode of KEY_MODES) {
      for (let rootPitchClass = 0; rootPitchClass < 12; rootPitchClass++) {
        const exercise = routine({ routine: 'blocked', hand: 'both', mode, rootPitchClass })
        const resting = [...fingersOf(exercise, 'left'), ...fingersOf(exercise, 'right')].filter(
          (fingers) => fingers === '-',
        )
        expect(resting, `${mode} pc ${rootPitchClass}`).toHaveLength(0)
      }
    }
  })
})

describe('expanding scale no. 1 (p. 82)', () => {
  const both = routine({ routine: 'expanding-1', hand: 'both' })

  it('reaches a note further each time, and comes back to the 2nd', () => {
    expect(notesOf(both, 'right').slice(0, 18).join(' ')).toBe(
      'C4 D4 E4 D4 C4 D4 E4 F4 E4 D4 C4 D4 E4 F4 G4 F4 E4 D4',
    )
    expect(sections(both)).toEqual([
      '3rd degree',
      '4th degree',
      '5th degree',
      '6th degree',
      '7th degree',
      'Full scale',
    ])
  })

  it('takes the scale’s own finger on every note', () => {
    expect(fingersOf(both, 'right').slice(0, 18).join('')).toBe('123212313212312132')
    expect(fingersOf(both, 'left').slice(0, 18).join('')).toBe('543454323454321234')
    // The full scale at the end, up and back.
    expect(fingersOf(both, 'right').slice(-15).join('')).toBe('123123454321321')
    expect(fingersOf(both, 'left').slice(-15).join('')).toBe('543213212312345')
  })

  it('is 28 bars of two, closing on a half note', () => {
    expect(both.meter).toEqual({ beats: 2, beatType: 4 })
    expect(stepBeats(both.steps.at(-1)!)).toBe(2)
    expect(beatsOf(both)).toBe(56)
  })
})

describe('expanding scale no. 2 (p. 82)', () => {
  const both = routine({ routine: 'expanding-2', hand: 'both' })

  it('opens out from the middle, a note further each way', () => {
    expect(notesOf(both, 'right').slice(0, 24).join(' ')).toBe(
      'C5 D5 C5 B4 C5 D5 E5 D5 C5 B4 A4 B4 C5 D5 E5 F5 E5 D5 C5 B4 A4 G4 A4 B4',
    )
    expect(sections(both)).toEqual([
      '2nd degree',
      '3rd degree',
      '4th degree',
      '5th degree',
      '6th degree',
      '7th degree',
    ])
  })

  it('begins on the finger that starts the second octave', () => {
    expect(fingersOf(both, 'right').slice(0, 12).join('')).toBe('121412321434')
    expect(fingersOf(both, 'left').slice(0, 12).join('')).toBe('141214341232')
  })

  it('ends on the finger that ends an octave: the 5th, as printed', () => {
    expect(fingersOf(both, 'right').slice(-3).join('')).toBe('345')
    expect(fingersOf(both, 'left').slice(-3).join('')).toBe('321')
    expect(beatsOf(both)).toBe(86)
  })
})

describe('the accelerating scale (p. 81)', () => {
  const both = routine({ routine: 'accelerating', hand: 'both' })
  const lengths = both.steps.map(stepBeats)

  it('runs quarters, eighths, triplets and sixteenths straight through', () => {
    expect(sections(both)).toEqual(['Quarters', 'Eighths', 'Triplets', 'Sixteenths'])
    expect(
      both.steps
        .map((step, index) => (step.cue === undefined ? -1 : index))
        .filter((index) => index >= 0 && sections(both).includes(both.steps[index]!.cue!)),
    ).toEqual([0, 14, 42, 72])
    expect(new Set(lengths.slice(0, 14))).toEqual(new Set([1]))
    expect(new Set(lengths.slice(14, 42))).toEqual(new Set([0.5]))
    expect(new Set(lengths.slice(72, 100))).toEqual(new Set([0.25]))
    expect(lengths[100]).toBe(1)
    // 7 + 7 + 5 + 4 bars of two.
    expect(beatsOf(both)).toBe(46)
  })

  it('goes one octave in quarters and two after that', () => {
    expect(notesOf(both, 'right').slice(0, 14).join(' ')).toBe(
      'C4 D4 E4 F4 G4 A4 B4 C5 B4 A4 G4 F4 E4 D4',
    )
    expect(notesOf(both, 'right')[14 + 14]).toBe('C6')
    expect(fingersOf(both, 'right').slice(0, 14).join('')).toBe('12312345432132')
    expect(fingersOf(both, 'left').slice(0, 14).join('')).toBe('54321321231234')
  })

  it('dips a note under the tonic to fill the last triplet', () => {
    expect(notesOf(both, 'right').slice(69, 72)).toEqual(['D4', 'C4', 'B3'])
    // The 2nd finger reaches over the thumb for the one note; the left hand
    // passes through the tonic on its thumb, as it would in mid-scale.
    expect(fingersOf(both, 'right').slice(69, 72).join('')).toBe('212')
    expect(fingersOf(both, 'left').slice(69, 72).join('')).toBe('412')
    // And so the sixteenths set off from the thumb, and end on the 5th.
    expect(fingersOf(both, 'left').slice(72, 74).join('')).toBe('14')
    expect(fingersOf(both, 'left').at(-1)).toBe('5')
  })
})

describe('the grand form (p. 84)', () => {
  const page = routine({ routine: 'grand-form' })
  const leg = (exercise: Exercise, index: number, size: number, hand: Side) =>
    notesOf(exercise, hand).slice(index * size, index * size + 2)

  it('is eight legs and a last note: together, apart, together, and back', () => {
    expect(sections(page)).toEqual([
      'Similar motion, up',
      'Contrary motion, apart',
      'Contrary motion, together',
      'Similar motion, up',
      'Similar motion, down',
      'Contrary motion, apart',
      'Contrary motion, together',
      'Similar motion, down',
    ])
    expect(page.steps).toHaveLength(8 * 14 + 1)
  })

  it('starts each leg where the page starts it', () => {
    const starts = (hand: Side) => [0, 1, 2, 3, 4, 5, 6, 7].map((at) => leg(page, at, 14, hand)[0])
    expect(starts('right')).toEqual(['C3', 'C5', 'C7', 'C5', 'C7', 'C5', 'C7', 'C5'])
    expect(starts('left')).toEqual(['C2', 'C4', 'C2', 'C4', 'C6', 'C4', 'C2', 'C4'])
    expect(leg(page, 1, 14, 'left')).toEqual(['C4', 'B3'])
    expect(notesOf(page, 'right').at(-1)).toBe('C3')
    expect(notesOf(page, 'left').at(-1)).toBe('C2')
  })

  it('is an eighth and two sixteenths, then four sixteenths, to every octave', () => {
    expect(page.steps.slice(0, 7).map(stepBeats)).toEqual([0.5, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25])
    expect(stepBeats(page.steps.at(-1)!)).toBe(4)
    // Eight bars of four and a whole note.
    expect(beatsOf(page)).toBe(36)
  })

  it('fingers each hand as one long scale, turning on whatever finger it is on', () => {
    expect(fingersOf(page, 'right').slice(0, 15).join('')).toBe('123123412312341')
    expect(fingersOf(page, 'left').slice(0, 15).join('')).toBe('543213214321321')
    expect(fingersOf(page, 'right')[28]).toBe('5')
    expect(fingersOf(page, 'right').at(-1)).toBe('1')
    expect(fingersOf(page, 'left').at(-1)).toBe('5')
  })

  it('takes two-octave legs only where five octaves fit, and one-octave legs otherwise', () => {
    // C is the one key a 61-key keyboard holds the printed routine in.
    expect(page.subtitle).toBe('Both Hands · 2 octaves a leg')
    const g = routine({ routine: 'grand-form', rootPitchClass: 7 })
    expect(g.subtitle).toBe('Both Hands · 1 octave a leg')
    expect(g.steps).toHaveLength(8 * 7 + 1)
    const wide = routine(
      { routine: 'grand-form', rootPitchClass: 7 },
      { range: { low: 21, high: 108 } },
    )
    expect(wide.subtitle).toBe('Both Hands · 2 octaves a leg')
  })
})

describe('the harmonized scale (p. 80)', () => {
  const bass = routine({ routine: 'harmonized-bass' })
  const chords = (exercise: Exercise) => exercise.steps.flatMap((step) => step.degree ?? [])

  it('puts one chord under each bar: up through I IV V, back through I V V', () => {
    expect(chords(bass)).toEqual([
      'I',
      'IV',
      'V',
      'I',
      'IV',
      'V7',
      'I',
      'I',
      'V',
      'V',
      'I',
      'V',
      'V7',
      'I',
    ])
  })

  it('holds the chord through the bar while the scale moves over it', () => {
    const first = bass.steps[0]!
    expect(notesOf(bass, 'left')[0]).toBe('C3+E3+G3')
    expect(notesOf(bass, 'right').slice(0, 4)).toEqual(['C4', 'D4', 'E4', 'F4'])
    expect(first.holds).toEqual([3, 3, 3, 1])
    expect(stepBeats(first)).toBe(1)
    // The fourth degree is held for its whole bar, with its chord.
    expect(stepBeats(bass.steps[3]!)).toBe(3)
    expect(notesOf(bass, 'left')[3]).toBe('C3+F3+A3')
    expect(bass.meter).toEqual({ beats: 3, beatType: 4 })
    expect(beatsOf(bass)).toBe(42)
  })

  it('fingers the chords as the page does, and the scale as itself', () => {
    expect(
      fingersOf(bass, 'left')
        .filter((fingers) => fingers !== '-')
        .slice(0, 6),
    ).toEqual(['531', '521', '531', '531', '521', '521'])
    expect(fingersOf(bass, 'right').slice(0, 15).join('')).toBe('123123412312345')
    expect(bass.fingerings.map((fingering) => fingering.source)).toEqual(['alfred', 'standard'])
  })

  it('turns over for chords in the treble', () => {
    const treble = routine({ routine: 'harmonized-treble' })
    expect(notesOf(treble, 'right')[0]).toBe('C4+E4+G4')
    expect(notesOf(treble, 'left').slice(0, 4)).toEqual(['C2', 'D2', 'E2', 'F2'])
    expect(fingersOf(treble, 'left').slice(0, 15).join('')).toBe('543213214321321')
    expect(fingersOf(treble, 'right')[0]).toBe('135')
    expect(chords(treble)).toEqual(chords(bass))
  })

  it('takes a minor key from its harmonic form, so the dominant fits the scale', () => {
    const minor = routine({ routine: 'harmonized-bass', rootPitchClass: 9, mode: 'minor' })
    expect(chords(minor).slice(0, 7)).toEqual(['i', 'iv', 'V', 'i', 'iv', 'V7', 'i'])
    expect(minor.pitchNames[8]).toBe('G♯')
  })
})

describe('the triad chain (p. 86)', () => {
  const chain = routine({ routine: 'triad-chain' })

  it('changes one note a half step at a time, on one root', () => {
    expect(sections(chain).slice(0, 7)).toEqual([
      'Major · C',
      'Minor · Cm',
      'Diminished · C°',
      'Minor · Cm',
      'Major · C',
      'Augmented · C+',
      'Major · C',
    ])
    expect(chain.steps.slice(-7).map((step) => step.label)).toEqual([
      'C',
      'Cm',
      'C°',
      'Cm',
      'C',
      'C+',
      'C',
    ])
  })

  it('is broken by the left hand and answered by the right, then struck as chords', () => {
    expect(notesOf(chain, 'left').slice(0, 6)).toEqual(['C3', 'E3', 'G3', '-', '-', '-'])
    expect(notesOf(chain, 'right').slice(0, 6)).toEqual(['-', '-', '-', 'C4', 'E4', 'G4'])
    expect(fingersOf(chain, 'left').slice(0, 3).join('')).toBe('531')
    expect(fingersOf(chain, 'right').slice(3, 6).join('')).toBe('135')
    expect(chain.steps).toHaveLength(7 * 6 + 7)
    expect(chain.steps.slice(-7).every((step) => step.notes.length === 6)).toBe(true)
    expect(beatsOf(chain)).toBe(63)
  })

  it('keeps the third and the fifth on their own letters', () => {
    expect(chain.pitchNames).toEqual({ 0: 'C', 3: 'E♭', 4: 'E', 6: 'G♭', 7: 'G', 8: 'G♯' })
    // And from a root where that takes a double sharp or a double flat.
    expect(routine({ routine: 'triad-chain', rootPitchClass: 6 }).pitchNames[2]).toBe('C𝄪')
    expect(routine({ routine: 'triad-chain', rootPitchClass: 1 }).pitchNames[7]).toBe('A𝄫')
  })

  it('is built on a note: major or minor makes no difference', () => {
    expect(routine({ routine: 'triad-chain', mode: 'minor' }).notes).toEqual(chain.notes)
    expect(chain.title).toBe('Triad Chain on C')
  })
})

describe('every routine, in every key', () => {
  it('stays on a 61-key keyboard, with a real finger on every note', () => {
    // Gathered and asserted once: an `expect` per note is a few hundred
    // thousand of them, and the test spent its time counting rather than checking.
    const wrong: string[] = []
    for (const name of ROUTINES) {
      for (const mode of KEY_MODES) {
        for (let rootPitchClass = 0; rootPitchClass < 12; rootPitchClass++) {
          for (const hand of routineHands(name)) {
            const exercise = routine({ routine: name, mode, rootPitchClass, hand })
            const where = `${name} ${mode} pc ${rootPitchClass} ${hand}`
            if (Math.min(...exercise.notes) < 36 || Math.max(...exercise.notes) > 96)
              wrong.push(`${where}: off the keyboard`)
            const fingered = exercise.steps.every(
              (step) =>
                step.fingers.length === step.notes.length &&
                step.fingers.every(({ finger }) => finger >= 1 && finger <= 5),
            )
            if (!fingered) wrong.push(`${where}: a note without a finger`)
          }
        }
      }
    }
    expect(wrong).toEqual([])
  })

  it('plays a two-handed routine with two hands whatever hand is asked for', () => {
    const exercise = routine({ routine: 'grand-form', hand: 'right' })
    expect(exercise.fingerings.map((fingering) => fingering.hand)).toEqual(['left', 'right'])
  })

  it('is written under the name it was asked for', () => {
    expect(routine({ routine: 'blocked', rootPitchClass: 3, mode: 'minor' }).title).toBe(
      'D♯ Minor Blocked Scale',
    )
    expect(
      routine({ routine: 'blocked', rootPitchClass: 3, mode: 'minor', tonic: 'E♭' }).title,
    ).toBe('E♭ Minor Blocked Scale')
  })
})
