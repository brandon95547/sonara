import { describe, expect, it } from 'vitest'
import { writeMidiFile, writeMusicXml, type RecordedNote } from '@sonara/shared'
import { importMidi } from '@/features/songs/import-midi'
import { importMusicXml } from '@/features/songs/import-musicxml'

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

/**
 * A real arrangement is not a piano part. It has a drummer on channel 10, a
 * bass on another channel, and a program change deciding what each one is.
 * Playing any of that on a piano keyboard is not a poor sound — on the drum
 * channel a note number names an instrument, not a pitch, so it is the wrong
 * question entirely.
 */
describe('parts in a full arrangement', () => {
  const vlq = (value: number) => {
    const out = [value & 0x7f]
    let rest = value >> 7
    while (rest > 0) {
      out.unshift((rest & 0x7f) | 0x80)
      rest >>= 7
    }
    return out
  }
  const chunk = (id: string, body: number[]) => [
    ...[...id].map((character) => character.charCodeAt(0)),
    (body.length >> 24) & 255,
    (body.length >> 16) & 255,
    (body.length >> 8) & 255,
    body.length & 255,
    ...body,
  ]

  /** One track: a program change, then a note, on the given channel. */
  const part = (channel: number, program: number, note: number) =>
    chunk('MTrk', [
      ...vlq(0),
      0xc0 | channel,
      program,
      ...vlq(0),
      0x90 | channel,
      note,
      100,
      ...vlq(240),
      0x80 | channel,
      note,
      0,
      ...vlq(0),
      0xff,
      0x2f,
      0x00,
    ])

  const file = Uint8Array.from([
    ...chunk('MThd', [0, 1, 0, 4, 0x01, 0xe0]),
    ...part(0, 0, 72), // channel 1, acoustic grand — the part to learn
    ...part(1, 33, 40), // channel 2, fingered bass — accompaniment
    ...part(9, 0, 38), // channel 10, drums — a snare, whatever the program says
    ...part(2, 48, 64), // channel 3, strings — accompaniment
  ])
  const song = importMidi(file, 'Arrangement')!

  it('sends the drum channel to percussion whatever program is set on it', () => {
    // Program 0 is acoustic grand. On channel 10 it is still a drum kit, which
    // is the one thing General MIDI is unambiguous about.
    expect(song.notes.find((note) => note.note === 38)?.role).toBe('percussion')
  })

  it('keeps the piano as the part to learn and demotes the rest', () => {
    expect(song.notes.find((note) => note.note === 72)?.role).toBe('keyboard')
    expect(song.notes.find((note) => note.note === 40)?.role).toBe('accompaniment')
    expect(song.notes.find((note) => note.note === 64)?.role).toBe('accompaniment')
  })

  it('does not hand the left hand to the bass player', () => {
    // Only one keyboard track here, so hands come from pitch. Counting the
    // bass or drum track as "the second track" would put the left hand on it.
    expect(song.handsInferred).toBe(true)
  })

  it('names what is in the file', () => {
    expect(song.parts).toContain('Piano')
    expect(song.parts).toContain('Bass')
    expect(song.parts).toContain('Drums')
    expect(song.parts).toContain('Ensemble')
  })

  it('still splits hands across two piano tracks when that is what it has', () => {
    const twoHands = Uint8Array.from([
      ...chunk('MThd', [0, 1, 0, 3, 0x01, 0xe0]),
      ...part(0, 0, 72),
      ...part(1, 0, 48),
      ...part(9, 0, 36),
    ])
    const piano = importMidi(twoHands, 'Two hands')!
    expect(piano.handsInferred).toBe(false)
    expect(piano.notes.find((note) => note.note === 72)?.hand).toBe('right')
    expect(piano.notes.find((note) => note.note === 48)?.hand).toBe('left')
    // The drum track must not have been counted as a third hand.
    expect(piano.notes.find((note) => note.note === 36)?.role).toBe('percussion')
  })
})

/**
 * Fingering and key are the two things notation carries that a performance
 * cannot. Reading them is the whole reason to prefer MusicXML for learning.
 */
describe('what notation knows that MIDI cannot', () => {
  const fingered = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
 <work><work-title>Fingered</work-title></work>
 <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
 <part id="P1"><measure number="1">
  <attributes><divisions>4</divisions><key><fifths>-1</fifths><mode>major</mode></key>
   <time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves></attributes>
  <note><pitch><step>F</step><octave>4</octave></pitch><duration>8</duration><staff>1</staff>
   <notations><technical><fingering>1</fingering></technical></notations></note>
  <note><pitch><step>A</step><octave>4</octave></pitch><duration>8</duration><staff>1</staff>
   <notations><technical><fingering>3</fingering></technical></notations></note>
  <backup><duration>16</duration></backup>
  <note><pitch><step>F</step><octave>2</octave></pitch><duration>16</duration><staff>2</staff>
   <notations><technical><fingering>5</fingering></technical></notations></note>
 </measure></part>
</score-partwise>`

  it('reads the finger the score asks for', () => {
    const song = importMusicXml(fingered, 'x')!
    expect(song.hasFingering).toBe(true)
    expect(song.notes.find((note) => note.note === 65)?.finger).toBe(1)
    expect(song.notes.find((note) => note.note === 69)?.finger).toBe(3)
    expect(song.notes.find((note) => note.note === 41)?.finger).toBe(5)
  })

  it('reads the key the score declares, rather than working it out', () => {
    const song = importMusicXml(fingered, 'x')!
    expect(song.key).toMatchObject({ fifths: -1, mode: 'major', declared: true })
  })

  it('says a score has no fingering when it has none', () => {
    const plain = fingered.replace(/<notations>[\s\S]*?<\/notations>/g, '')
    expect(importMusicXml(plain, 'x')!.hasFingering).toBe(false)
  })

  it('leaves MIDI without fingering, because the format has no field for it', () => {
    const song = importMidi(writeMidiFile([played(60, 0, 500)]), 'x')!
    expect(song.hasFingering).toBe(false)
    expect(song.notes.every((note) => note.finger === undefined)).toBe(true)
  })

  it('still gives a MIDI file a key, marked as an estimate when undeclared', () => {
    // Our own writer emits no key signature, so this exercises the fallback.
    const cMajor = [0, 2, 4, 5, 7, 9, 11].map((step, index) => played(60 + step, index * 500, 480))
    const song = importMidi(writeMidiFile(cMajor), 'x')!
    expect(song.key?.declared).toBe(false)
    expect(song.key?.pitchClass).toBe(0)
  })
})
