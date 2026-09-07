import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Song } from '@sonara/shared'
import { readMscz, readMxl } from '@/features/songs/archive'
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
