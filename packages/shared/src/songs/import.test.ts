import { describe, expect, it } from 'vitest'
import { writeMidiFile } from '../recording/midi-file.js'
import { writeMusicXml } from '../recording/musicxml.js'
import { importMidi } from './import-midi.js'
import { importMusicXml } from './import-musicxml.js'
import type { RecordedNote } from '../recording/performance.js'

const played = (note: number, startMs: number, durationMs: number): RecordedNote => ({
  note,
  velocity: 90,
  startMs,
  durationMs,
})

/**
 * The exporters and the importers are each other's best test: a song written
 * out and read back has to be the same song. It exercises variable-length
 * deltas, running status, chord handling and the measure cursor together, in
 * the shapes real files actually use.
 */
describe('MIDI import', () => {
  const notes = [played(60, 0, 500), played(64, 500, 500), played(67, 1000, 1000)]
  const song = importMidi(writeMidiFile(notes, { bpm: 120 }), 'Round trip')

  it('reads back what was written', () => {
    expect(song).not.toBeNull()
    expect(song!.notes).toHaveLength(3)
    expect(song!.notes.map((note) => note.note)).toEqual([60, 64, 67])
  })

  it('keeps the timing to within a tick', () => {
    for (const [index, expected] of [0, 500, 1000].entries()) {
      expect(song!.notes[index]!.startMs).toBeCloseTo(expected, 0)
    }
    expect(song!.notes[2]!.durationMs).toBeCloseTo(1000, 0)
  })

  it('reads the tempo the file declares', () => {
    expect(song!.bpm).toBeCloseTo(120, 1)
  })

  it('treats a note-on at velocity zero as a note-off', () => {
    // What most sequencers write, so that running status can cover a passage.
    // Read as a note-on it leaves every note hanging to the end of the file.
    const bytes = Uint8Array.from([
      0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 0x60, 0x4d, 0x54, 0x72, 0x6b, 0, 0, 0,
      0x0d, 0x00, 0x90, 60, 100, 0x60, 0x90, 60, 0x00, 0x00, 0xff, 0x2f, 0x00,
    ])
    const zero = importMidi(bytes, 'Zero velocity')
    expect(zero!.notes).toHaveLength(1)
    expect(zero!.notes[0]!.durationMs).toBeLessThan(2000)
  })

  it('follows running status instead of desynchronising', () => {
    // The second and third events omit their status byte. A parser that does
    // not carry it forward reads the data as commands and produces garbage.
    const bytes = Uint8Array.from([
      0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 0x60, 0x4d, 0x54, 0x72, 0x6b, 0, 0, 0,
      0x11, 0x00, 0x90, 60, 100, 0x00, 64, 100, 0x60, 60, 0x00, 0x00, 64, 0x00, 0x00, 0xff, 0x2f,
      0x00,
    ])
    const running = importMidi(bytes, 'Running status')
    expect(running!.notes.map((note) => note.note).sort()).toEqual([60, 64])
  })

  it('splits the hands by pitch when there is only one track to go on', () => {
    const single = importMidi(writeMidiFile([played(72, 0, 400), played(48, 0, 400)]), 'One track')
    expect(single!.handsInferred).toBe(true)
    expect(single!.notes.find((note) => note.note === 72)?.hand).toBe('right')
    expect(single!.notes.find((note) => note.note === 48)?.hand).toBe('left')
  })

  it('refuses a file that is not MIDI rather than inventing notes', () => {
    expect(importMidi(Uint8Array.from([1, 2, 3, 4]), 'Nope')).toBeNull()
  })
})

describe('MusicXML import', () => {
  const notes = [played(60, 0, 600), played(52, 0, 600), played(64, 600, 600)]
  const song = importMusicXml(writeMusicXml(notes, { bpm: 100, title: 'Read me back' }), 'Fallback')

  it('takes the title from the file, not the filename', () => {
    expect(song!.title).toBe('Read me back')
  })

  it('reads the staff each note is written on as the hand that plays it', () => {
    expect(song!.handsInferred).toBe(false)
    expect(song!.notes.find((note) => note.note === 60)?.hand).toBe('right')
    expect(song!.notes.find((note) => note.note === 52)?.hand).toBe('left')
  })

  it('keeps notes written together sounding together', () => {
    // The bass note is under the first treble note, not after it — which is
    // what <backup> is for, and what a scanner that ignores it gets wrong.
    const c = song!.notes.find((note) => note.note === 60)!
    const e = song!.notes.find((note) => note.note === 52)!
    expect(Math.abs(c.startMs - e.startMs)).toBeLessThan(30)
  })

  it('advances past the first bar rather than stacking everything at zero', () => {
    const later = song!.notes.find((note) => note.note === 64)!
    expect(later.startMs).toBeGreaterThan(300)
  })

  it('holds a tied note instead of striking it twice', () => {
    const tied = writeMusicXml([played(60, 0, 750)], { bpm: 100 })
    const held = importMusicXml(tied, 'Tied')
    expect(held!.notes).toHaveLength(1)
    expect(held!.notes[0]!.durationMs).toBeGreaterThan(600)
  })

  it('refuses anything that is not a partwise score', () => {
    expect(importMusicXml('<html><body>not music</body></html>', 'Nope')).toBeNull()
  })
})
