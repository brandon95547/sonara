import { describe, expect, it } from 'vitest'
import {
  applyDynamics,
  dynamicEvents,
  playbackVelocity,
  readDynamic,
  swellOfWords,
  velocityForDynamic,
  type DynamicEvent,
} from './dynamics.js'

/**
 * What a score says about loudness, and what is done with it.
 *
 * The complaint these answer: a song that could not be heard in one passage
 * and was too loud in the next. Part of that was the reading — an accent left
 * everything after it loud, a hairpin did nothing until its far end, one hand
 * heard a marking the other did not — and part was the range the reading was
 * played over.
 */

const at = (...starts: number[]) => starts.map((startQ) => ({ startQ }))
const velocities = (notes: { startQ: number; line?: number | string }[], events: DynamicEvent[]) =>
  applyDynamics(notes, events).map((note) => note.velocity)

describe('reading a marking', () => {
  it('knows a level from an accent', () => {
    expect(readDynamic('pp')).toEqual({ kind: 'level', velocity: 33 })
    expect(readDynamic('ff')).toEqual({ kind: 'level', velocity: 112 })
    for (const accent of ['sf', 'sfz', 'fz', 'rf', 'rfz'])
      expect(readDynamic(accent)?.kind, accent).toBe('accent')
    expect(readDynamic('sffz')).toMatchObject({ kind: 'accent', boost: 48 })
  })

  it('reads fp as a note struck forte and a level left at piano', () => {
    expect(readDynamic('fp')).toEqual({ kind: 'accent', boost: 32, strike: 96, then: 49 })
    expect(readDynamic('sfpp')).toMatchObject({ kind: 'accent', then: 33 })
  })

  it('takes a word it does not know as saying nothing about loudness', () => {
    for (const word of ['dolce', 'simile', 'legato', 'z', '', undefined])
      expect(readDynamic(word), String(word)).toBeNull()
    // The old reading: anything unknown was mezzo-forte.
    expect(velocityForDynamic('dolce')).toBe(80)
  })

  it('hears cresc. and dim. however they are dressed', () => {
    expect(swellOfWords('cresc.')).toBe('louder')
    expect(swellOfWords('poco a poco cresc.')).toBe('louder')
    expect(swellOfWords('dim. molto')).toBe('softer')
    expect(swellOfWords('smorz.')).toBe('softer')
    expect(swellOfWords('dolce')).toBeNull()
  })
})

describe('the level through a piece', () => {
  it('is mezzo-forte until the score says, and holds each level until the next', () => {
    const events = [...dynamicEvents('p', 4), ...dynamicEvents('f', 8)]
    expect(velocities(at(0, 3, 4, 7, 8, 20), events)).toEqual([80, 80, 49, 49, 96, 96])
    expect(applyDynamics(at(0, 4), events).map((note) => note.dynamic)).toEqual([undefined, 'p'])
  })

  it('strikes an accent’s own note harder and leaves the level where it was', () => {
    const events = [...dynamicEvents('p', 0), ...dynamicEvents('sf', 4)]
    // Read as a level, the sforzando left every note after it at 112.
    expect(velocities(at(0, 4, 5, 6), events)).toEqual([49, 81, 49, 49])
  })

  it('accents the whole chord, in both hands', () => {
    const notes = [
      { startQ: 4, line: 1 },
      { startQ: 4, line: 2 },
      { startQ: 5, line: 2 },
    ]
    expect(velocities(notes, dynamicEvents('sfz', 4, 1))).toEqual([112, 112, 80])
  })

  it('drops to piano after the forte of an fp', () => {
    const events = [...dynamicEvents('mf', 0), ...dynamicEvents('fp', 4)]
    expect(velocities(at(3, 4, 5), events)).toEqual([80, 96, 49])
  })

  it('does nothing at a marking that is not about loudness', () => {
    const events = [...dynamicEvents('pp', 0), ...dynamicEvents('dolce', 4)]
    expect(velocities(at(0, 4, 8), events)).toEqual([33, 33, 33])
  })

  it('rises through a hairpin to the marking it closes on', () => {
    const events: DynamicEvent[] = [
      ...dynamicEvents('p', 0),
      { kind: 'swell', fromQ: 4, toQ: 8, direction: 'louder' },
      ...dynamicEvents('f', 8),
    ]
    // 49 to 96 over four beats, a step a beat, and no jump at the end.
    expect(velocities(at(3, 4, 5, 6, 7, 8, 9), events)).toEqual([49, 49, 61, 73, 84, 96, 96])
  })

  it('shapes the phrase when a hairpin closes on nothing, and begins the next where this did', () => {
    const events: DynamicEvent[] = [
      ...dynamicEvents('mf', 0),
      { kind: 'swell', fromQ: 4, toQ: 8, direction: 'softer' },
    ]
    expect(velocities(at(4, 6, 8, 9, 12), events)).toEqual([80, 72, 64, 80, 80])
  })

  it('comes back down a swell that rises and falls', () => {
    const events: DynamicEvent[] = [
      ...dynamicEvents('p', 0),
      { kind: 'swell', fromQ: 4, toQ: 6, direction: 'louder' },
      { kind: 'swell', fromQ: 6, toQ: 8, direction: 'softer' },
    ]
    expect(velocities(at(4, 5, 6, 7, 8, 9), events)).toEqual([49, 57, 65, 57, 49, 49])
  })

  it('does not walk off the scale through a page of hairpins', () => {
    // Seventy-odd of them and a handful of markings: left where each ended,
    // the level fell to nothing.
    const events: DynamicEvent[] = [...dynamicEvents('p', 0)]
    for (let bar = 0; bar < 40; bar++)
      events.push({ kind: 'swell', fromQ: 4 + bar * 4, toQ: 7 + bar * 4, direction: 'softer' })
    const struck = velocities(at(...Array.from({ length: 170 }, (_, i) => i)), events)
    expect(Math.min(...struck)).toBe(33)
    expect(struck.at(-1)).toBe(49)
  })

  it('keeps the level a written dim. arrives at', () => {
    const events: DynamicEvent[] = [
      ...dynamicEvents('mf', 0),
      { kind: 'swell', fromQ: 4, direction: 'softer' },
    ]
    expect(velocities(at(4, 6, 8, 12), events)).toEqual([80, 72, 64, 64])
  })

  it('still rises before a sudden piano', () => {
    const events: DynamicEvent[] = [
      ...dynamicEvents('mf', 0),
      { kind: 'swell', fromQ: 4, toQ: 8, direction: 'louder' },
      ...dynamicEvents('p', 8),
    ]
    expect(velocities(at(6, 7.9, 8), events)).toEqual([88, 96, 49])
  })

  it('follows a written cresc. to the next louder marking', () => {
    const events: DynamicEvent[] = [
      ...dynamicEvents('p', 0),
      { kind: 'swell', fromQ: 4, direction: 'louder' },
      ...dynamicEvents('ff', 12),
    ]
    expect(velocities(at(4, 8, 12), events)).toEqual([49, 81, 112])
  })
})

describe('the two hands', () => {
  const hands = [
    { startQ: 0, line: 1 },
    { startQ: 0, line: 2 },
    { startQ: 4, line: 1 },
    { startQ: 4, line: 2 },
  ]

  it('gives both a marking written on one staff, at the moment it is written', () => {
    // The file hangs a marking between the staves on the upper one.
    expect(velocities(hands, dynamicEvents('pp', 4, 1))).toEqual([80, 80, 33, 33])
    expect(velocities(hands, dynamicEvents('pp', 4, 2))).toEqual([80, 80, 33, 33])
  })

  it('keeps a hand its own level when each is given one', () => {
    const events = [...dynamicEvents('mf', 0, 1), ...dynamicEvents('p', 0, 2)]
    expect(velocities(hands, events)).toEqual([80, 49, 80, 49])
  })

  it('reaches the other hand of a piano written as a part a hand', () => {
    const parts = [
      { startQ: 0, line: 'P1' },
      { startQ: 0, line: 'P2' },
    ]
    expect(velocities(parts, dynamicEvents('p', 0, 'P1'))).toEqual([49, 49])
  })
})

describe('the range a song is played over', () => {
  it('leaves mezzo-forte where it is', () => {
    expect(playbackVelocity(80)).toBe(80)
  })

  it('brings the soft up and the loud down, in the order they were', () => {
    const written = [16, 33, 49, 64, 80, 96, 112, 126]
    const played = written.map(playbackVelocity)
    expect(played).toEqual([36, 51, 63, 72, 80, 88, 95, 100])
    expect([...played].sort((a, b) => a - b)).toEqual(played)
  })

  it('halves the distance from pianissimo to fortissimo, in decibels', () => {
    // An instrument's loudness goes by the square of the velocity.
    const decibels = (soft: number, loud: number) => 40 * Math.log10(loud / soft)
    expect(decibels(33, 112)).toBeCloseTo(21.2, 1)
    expect(decibels(playbackVelocity(33), playbackVelocity(112))).toBeCloseTo(10.8, 1)
  })
})
