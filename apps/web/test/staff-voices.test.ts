import { describe, expect, it } from 'vitest'
import { songSteps } from '@sonara/shared'
import { importMusicXml } from '@/features/songs/import-musicxml'
import { barLinesIn, barRestsIn, measureScore, place } from '@/features/staff/score'

/**
 * Two voices on one staff.
 *
 * A melody over held notes is two lines, and each is written as itself: its
 * own length and its own stem, the upper's up and the lower's down. Drawn as
 * one chord with one stem, the whole of it took one length, and a crotchet of
 * melody over a held minim was printed as a minim.
 */

const note = (step: string, octave: number, duration: number, type: string, voice: number) =>
  `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration><voice>${voice}</voice><type>${type}</type><staff>1</staff></note>`

const score = (bars: string[]) =>
  importMusicXml(
    `<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${bars
      .map(
        (body, index) =>
          `<measure number="${index + 1}">${index === 0 ? '<attributes><divisions>1</divisions><staves>2</staves><time><beats>4</beats><beat-type>4</beat-type></time></attributes>' : ''}${body}</measure>`,
      )
      .join('')}</part></score-partwise>`,
    'voices',
  )!

const measure = (bars: string[]) => {
  const song = score(bars)
  return measureScore(song, songSteps(song, 'both'))
}

describe('two voices on one staff', () => {
  // A melody in crotchets over a minim held under its first two notes.
  const melody = note('E', 5, 1, 'quarter', 1) + note('D', 5, 1, 'quarter', 1)
  const held = `<backup><duration>2</duration></backup>${note('C', 4, 2, 'half', 2)}`

  it('writes each voice as its own chord, with its own length', () => {
    const [first, second] = measure([melody + held])
    expect(first!.parts!.map((part) => [part.stem, part.value.value, part.notes.length])).toEqual([
      ['up', 'quarter', 1],
      ['down', 'half', 1],
    ])
    // The second crotchet is alone at its moment, and still the upper voice:
    // its stem stays up for as long as the bar has two voices.
    expect(second!.parts!.map((part) => [part.stem, part.value.value])).toEqual([['up', 'quarter']])
  })

  it('leaves a bar with one voice exactly as it was, stems and all', () => {
    const measured = measure([melody + held, note('C', 4, 4, 'whole', 1)])
    expect(measured.at(-1)!.parts).toBeUndefined()
  })

  it('steps the lower voice aside where its head would land on the upper one', () => {
    // A second apart: D over C.
    const close = measure([
      note('D', 4, 2, 'half', 1) +
        `<backup><duration>2</duration></backup>${note('C', 4, 2, 'half', 2)}`,
    ])[0]!
    expect(close.parts!.map((part) => part.dx > 0)).toEqual([false, true])
    // An octave apart: each has room where it is.
    const apart = measure([
      note('C', 5, 2, 'half', 1) +
        `<backup><duration>2</duration></backup>${note('C', 4, 2, 'half', 2)}`,
    ])[0]!
    expect(apart.parts!.map((part) => part.dx)).toEqual([0, 0])
    // And room is kept for the one that moved.
    expect(close.extent.right).toBeGreaterThan(apart.extent.right)
  })
})

/**
 * A tied note: struck once, written twice.
 *
 * The second notehead stands at its own moment, with whatever else is written
 * there, and a tie joins it to the first. It is on the page and not among the
 * notes to play.
 */
describe('a tied note', () => {
  const tied = (step: string, duration: number, type: string, tie: 'start' | 'stop') =>
    `<note><pitch><step>${step}</step><octave>5</octave></pitch><duration>${duration}</duration><tie type="${tie}"/><voice>1</voice><type>${type}</type><staff>1</staff></note>`
  const bass = (step: string) =>
    `<note><pitch><step>${step}</step><octave>3</octave></pitch><duration>4</duration><voice>5</voice><type>whole</type><staff>2</staff></note>`
  // C held from bar 1 into bar 2, over a left hand that moves at the bar line.
  const bars = [
    `${tied('C', 4, 'whole', 'start')}<backup><duration>4</duration></backup>${bass('C')}`,
    `${tied('C', 2, 'half', 'stop')}<backup><duration>2</duration></backup>${bass('G')}`,
  ]
  const song = score(bars)
  const steps = songSteps(song, 'both')
  const measured = measureScore(song, steps)

  it('is one note to play, and two noteheads on the page', () => {
    // Two moments, and the second asks only for the left hand's G.
    expect(steps.map((step) => step.notes.map((entry) => entry.note))).toEqual([[48, 72], [55]])
    expect(measured[1]!.notes.map((entry) => [entry.note, entry.held ?? false])).toEqual([
      [55, false],
      [72, true],
    ])
    // Written as the score writes it: a minim, where the first was a semibreve.
    expect(measured[1]!.value.treble.value).toBe('half')
  })

  it('is joined to the head before it, and says where that is', () => {
    expect(measured[0]!.tiesOut).toEqual([{ note: 72, toIndex: 1 }])
    expect(measured[1]!.ties).toEqual([{ note: 72, fromIndex: 0 }])
    const placed = place(measured, 100)
    expect(placed[1]!.arcs).toEqual([{ note: 72, fromX: placed[0]!.x }])
    expect(placed[0]!.arcsOut).toBeUndefined()
  })

  it('runs off the end of a line and arrives on the next, where a line breaks between', () => {
    const first = place(measured.slice(0, 1), 100)
    const second = place(measured.slice(1), 100)
    expect(first[0]!.arcsOut).toEqual([72])
    expect(second[0]!.arcs).toEqual([{ note: 72, fromX: null }])
  })
})

/**
 * Rests: a hand that is waiting.
 *
 * Shown where a hand has nothing to play, and not for every rest the score
 * writes — a voice resting while the same hand plays the other voice is
 * bookkeeping, and the hand is busy.
 */
describe('rests', () => {
  const pitched = (
    step: string,
    octave: number,
    duration: number,
    type: string,
    voice: number,
    staff: number,
  ) =>
    `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration><voice>${voice}</voice><type>${type}</type><staff>${staff}</staff></note>`
  const rest = (duration: number, type: string | null, voice: number, staff: number) =>
    `<note><rest${type ? '' : ' measure="yes"'}/><duration>${duration}</duration><voice>${voice}</voice>${type ? `<type>${type}</type>` : ''}<staff>${staff}</staff></note>`
  const back = (duration: number) => `<backup><duration>${duration}</duration></backup>`
  const measured = (bars: string[]) => {
    const song = score(bars)
    return measureScore(song, songSteps(song, 'both'))
  }

  it('stands a rest with the chord the other hand strikes at that moment', () => {
    // Right hand: a minim, then a minim rest. Left hand: two minims.
    const [, second] = measured([
      pitched('C', 5, 2, 'half', 1, 1) +
        rest(2, 'half', 1, 1) +
        back(4) +
        pitched('C', 3, 2, 'half', 5, 2) +
        pitched('G', 3, 2, 'half', 5, 2),
    ])
    expect(second!.rests).toEqual([{ staff: 'treble', value: 'half', dots: 0, back: 0, bar: 1 }])
  })

  it('says nothing of a voice resting while the same hand plays the other', () => {
    // The upper voice rests for the second half; the lower holds a semibreve.
    const all = measured([
      pitched('E', 5, 2, 'half', 1, 1) +
        rest(2, 'half', 1, 1) +
        back(4) +
        pitched('C', 4, 4, 'whole', 2, 1),
    ])
    expect(all.flatMap((entry) => entry.rests ?? [])).toEqual([])
  })

  it('puts a rest for the whole bar in the middle of its bar', () => {
    // The left hand rests for bar 1 and plays in bar 2.
    const all = measured([
      pitched('C', 5, 4, 'whole', 1, 1) + back(4) + rest(4, null, 5, 2),
      pitched('D', 5, 4, 'whole', 1, 1) + back(4) + pitched('G', 3, 4, 'whole', 5, 2),
    ])
    expect(all.map((entry) => entry.barRest)).toEqual([['bass'], undefined])
    const placed = place(all, 100)
    const lines = barLinesIn(placed)
    const [whole] = barRestsIn(placed, lines, 100, 900)
    expect(whole).toMatchObject({ staff: 'bass', bar: 1 })
    // Between where the bar starts and the line that ends it.
    expect(whole!.x).toBeCloseTo((100 + lines[0]!.x) / 2, 5)
  })

  it('stands a rest neither hand plays through in the room before the next chord, and makes that room', () => {
    // Both hands: a crotchet, a crotchet rest, then a minim.
    const hands = (withRest: boolean) =>
      measured([
        pitched('C', 5, 1, 'quarter', 1, 1) +
          (withRest ? rest(1, 'quarter', 1, 1) : pitched('D', 5, 1, 'quarter', 1, 1)) +
          pitched('E', 5, 2, 'half', 1, 1) +
          back(4) +
          pitched('C', 3, 1, 'quarter', 5, 2) +
          (withRest ? rest(1, 'quarter', 5, 2) : pitched('D', 3, 1, 'quarter', 5, 2)) +
          pitched('E', 3, 2, 'half', 5, 2),
      ])
    const resting = hands(true)
    expect(resting).toHaveLength(2)
    // One place in front of the chord, shared by both staves' rests.
    expect(resting[1]!.rests!.map((mark) => [mark.staff, mark.value, mark.back > 0])).toEqual([
      ['treble', 'quarter', true],
      ['bass', 'quarter', true],
    ])
    expect(resting[1]!.rests![0]!.back).toBe(resting[1]!.rests![1]!.back)
    const placed = place(resting, 100)
    const drawn = placed[1]!.restsAt![0]!
    // Clear of the chord before it and the chord after.
    expect(drawn.x).toBeGreaterThan(placed[0]!.x + placed[0]!.extent.right)
    expect(drawn.x).toBeLessThan(placed[1]!.x - placed[1]!.extent.left)
  })
})
