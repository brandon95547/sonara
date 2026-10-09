import { describe, expect, it } from 'vitest'
import { songSteps } from '@sonara/shared'
import { importMusicXml } from '@/features/songs/import-musicxml'
import { measureScore } from '@/features/staff/score'

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
