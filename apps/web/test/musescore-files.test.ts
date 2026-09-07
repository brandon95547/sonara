import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Song } from '@sonara/shared'
import { readMscz, readMxl } from '@/features/songs/archive'
import { importMuseScore } from '@/features/songs/import-musescore'
import { readSong } from '@/features/songs/read-song'

/**
 * The two `.mscz` files MuseScore itself writes.
 *
 * Every other import test builds its own fixture, which proves the parser can
 * read what this repo writes and nothing more. These are real saves from
 * MuseScore 3.6.2 and 4.1.1 — the same two bars in both, so any difference in
 * the result is a difference in the format rather than in the music.
 *
 * Both contain a C major scale, C4 up to C5, in quarter notes at 4/4.
 */

const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(path.join(import.meta.dirname, 'fixtures', name)))

/**
 * A File the way the browser hands one to us. jsdom's own File has no
 * `arrayBuffer`, so the two members readSong actually touches are supplied
 * directly rather than testing jsdom's Blob implementation by accident.
 */
const upload = (name: string): File =>
  ({
    name,
    arrayBuffer: async () => {
      const bytes = fixture(name)
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    },
  }) as unknown as File

/** The song a file reads to, or a failure loud enough to name the file. */
async function imported(file: string): Promise<Song> {
  const result = await readSong(upload(file))
  if (!('song' in result)) throw new Error(`${file} failed to import: ${result.failure}`)
  return result.song
}

const versions = [
  { label: 'MuseScore 3', file: 'musescore-3.mscz' },
  { label: 'MuseScore 4', file: 'musescore-4.mscz' },
] as const

describe.each(versions)('$label', ({ file }) => {
  const bytes = fixture(file)

  it('finds the score inside the archive', () => {
    const entry = readMscz(bytes)
    expect(entry).not.toBeNull()
    expect(entry!.name).toMatch(/\.mscx$/)
    expect(entry!.text).toContain('<museScore')
  })

  it('reads the scale it contains', async () => {
    const song = await imported(file)

    expect(song.source).toBe('musescore')
    expect(song.title).toBe('test')
    expect(song.notes.map((note) => note.note)).toEqual([60, 62, 64, 65, 67, 69, 71, 72])
  })

  it('puts the notes one beat apart and keeps the bar length', async () => {
    const song = await imported(file)

    const beat = 60000 / song.bpm
    for (const [index, note] of song.notes.entries()) {
      expect(note.startMs).toBeCloseTo(index * beat, 0)
    }
    expect(song.beatsPerMeasure).toBe(4)
    expect(song.measureCount).toBe(2)
  })

  it('admits that a single-staff score has no hand information', async () => {
    const song = await imported(file)

    // One staff, so which hand plays what was inferred rather than read. The
    // score model has to say so — Learn shows a different card either way.
    expect(song.provides.staves).toBe(false)
    expect(song.provides.fingering).toBe(false)
    expect(song.provides.notes).toBe(true)
  })
})

it('reads both versions to the same music', async () => {
  const [three, four] = await Promise.all(versions.map(({ file }) => imported(file)))
  expect(three!.notes.map((note) => note.note)).toEqual(four!.notes.map((note) => note.note))
  expect(three!.bpm).toBe(four!.bpm)
})

it('does not mistake MuseScore 4 style data for the score', () => {
  // MuseScore 4 lists every file in the archive as a <rootfile>, style sheet
  // first. Following the container pointer the way .mxl requires would hand
  // back score_style.mss; the score is found by extension instead.
  const bytes = fixture('musescore-4.mscz')
  expect(readMxl(bytes)?.name ?? null).not.toMatch(/\.mscx$/)
  expect(readMscz(bytes)!.name).toMatch(/\.mscx$/)
})

/**
 * The shapes a real score has and a hand-written fixture does not.
 *
 * Distilled from a two-gralla arrangement that read wrongly in three separate
 * ways: a pickup bar, two single-staff parts rather than one part with two
 * staves, and a slur whose `<location>` elements sit nested inside it. The
 * music itself is not here — the structure is what broke, and the structure is
 * what this holds.
 */
describe('a score that is not a piano score', () => {
  const text = readFileSync(
    path.join(import.meta.dirname, 'fixtures', 'two-parts-pickup.mscx'),
    'utf8',
  )
  const song = importMuseScore(text, 'fallback')!

  it('gives the pickup bar its own length instead of padding it', () => {
    // One beat of pickup in 3/4. Padded to a full bar, every note after it
    // moves two beats later and stays there for the rest of the piece.
    const beat = 60000 / song.bpm
    const onsets = [...new Set(song.notes.map((note) => Math.round(note.startMs / beat)))].sort(
      (a, b) => a - b,
    )
    expect(onsets).toEqual([0, 1, 2, 3])
  })

  it('does not count a slur\'s own <location> as a beat of music', () => {
    // <Spanner> records where it reaches with nested <location> elements.
    // Read as though they were the bar's contents they advance the cursor
    // through music that is not there, and the drift accumulates.
    const beat = 60000 / song.bpm
    const slurred = [64, 69, 71, 72].map(
      (pitch) => song.notes.find((note) => note.note === pitch)!,
    )
    expect(slurred.map((note) => Math.round(note.startMs / beat))).toEqual([0, 1, 2, 3])
  })

  it('refuses to call two instruments two hands', () => {
    // Two single-staff parts, both oboe, both well above middle C. Reading the
    // second staff as a left hand puts a melody where no left hand plays, and
    // claims the score said so.
    expect(song.parts).toEqual(['Gralla1', 'Gralla2'])
    expect(song.handsInferred).toBe(true)
    expect(song.provides.staves).toBe(false)
  })

  it('still reads hands when one part owns two staves', () => {
    // The piano case, which is the one where a staff really is a hand.
    const piano = importMuseScore(
      text
        .replace(/<Part>[\s\S]*?<\/Part>\s*<Part>[\s\S]*?<\/Part>/, '<Part>' +
          '<Staff id="1"/><Staff id="2"/>' +
          '<Instrument id="piano"><longName>Piano</longName></Instrument></Part>'),
      'x',
    )!
    expect(piano.parts).toEqual(['Piano'])
    expect(piano.handsInferred).toBe(false)
    expect(piano.notes.find((note) => note.note === 64)?.hand).toBe('right')
    expect(piano.notes.find((note) => note.note === 76)?.hand).toBe('left')
  })
})
