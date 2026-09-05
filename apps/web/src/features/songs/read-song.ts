import type { Song } from '@sonara/shared'
import { isZip, readMscz, readMxl } from './archive'
import { importMidi } from './import-midi'
import { importMuseScore } from './import-musescore'
import { importMusicXml } from './import-musicxml'

/**
 * One way in, for every format.
 *
 * All four readers produce the same Song, so nothing downstream — playback,
 * the keyboard, Learn, the staff — knows or cares which file it came from.
 * That is the whole point of normalising on import rather than keeping a
 * player per format.
 *
 * Formats are identified by their first bytes, not their extension. A `.xml`
 * that is really MIDI and a `.mid` that is really XML both happen when files
 * come out of other programs, and the magic number settles it.
 */

export type ImportFailure = 'pdf' | 'empty' | 'unknown'

export type ImportResult = { song: Song } | { failure: ImportFailure; name: string }

export async function readSong(file: File): Promise<ImportResult> {
  const fallbackTitle = file.name.replace(/\.[^.]+$/, '')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const starts = (...magic: number[]) => magic.every((byte, index) => bytes[index] === byte)
  const fail = (failure: ImportFailure): ImportResult => ({ failure, name: file.name })
  const done = (song: Song | null) => (song ? { song } : fail('empty'))

  // "MThd" — the only thing a Standard MIDI File can begin with.
  if (starts(0x4d, 0x54, 0x68, 0x64)) return done(importMidi(bytes, fallbackTitle))

  // "%PDF" — deliberately unsupported, and worth saying so specifically.
  if (starts(0x25, 0x50, 0x44, 0x46)) return fail('pdf')

  if (isZip(bytes)) {
    // .mscz and .mxl are both zips. Which one it is depends on what is inside,
    // so the extension only decides which to try first.
    const preferMuseScore = /\.mscz$/i.test(file.name)
    const readers = preferMuseScore
      ? ([readMscz, readMxl] as const)
      : ([readMxl, readMscz] as const)

    for (const read of readers) {
      const entry = read(bytes)
      if (!entry) continue
      const song = /\.mscx$/i.test(entry.name)
        ? importMuseScore(entry.text, fallbackTitle)
        : importMusicXml(entry.text, fallbackTitle)
      if (song) return { song }
    }
    return fail('unknown')
  }

  const text = new TextDecoder().decode(bytes)
  if (/<museScore/i.test(text)) return done(importMuseScore(text, fallbackTitle))
  if (/<score-partwise/i.test(text)) return done(importMusicXml(text, fallbackTitle))

  return fail('unknown')
}
