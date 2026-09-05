import { describe, expect, it } from 'vitest'
import { notesFromEvents, performanceLength, type PerformanceEvent } from './performance.js'
import { writeMidiFile } from './midi-file.js'
import { writeMusicXml } from './musicxml.js'

const on = (note: number, at: number, velocity = 90): PerformanceEvent => ({
  note,
  velocity,
  on: true,
  at,
})
const off = (note: number, at: number): PerformanceEvent => ({ note, velocity: 0, on: false, at })

describe('pairing events into notes', () => {
  it('pairs each note-on with its note-off', () => {
    const notes = notesFromEvents([on(60, 0), off(60, 500), on(62, 500), off(62, 900)])
    expect(notes).toEqual([
      { note: 60, velocity: 90, startMs: 0, durationMs: 500 },
      { note: 62, velocity: 90, startMs: 500, durationMs: 400 },
    ])
  })

  it('closes the earliest of two overlapping strikes of one pitch first', () => {
    // A repeated note under a held pedal. Closing the newest first would give
    // the repeat the long duration and the held note the short one.
    const notes = notesFromEvents([on(60, 0), on(60, 100), off(60, 400), off(60, 900)])
    expect(notes.map((note) => [note.startMs, note.durationMs])).toEqual([
      [0, 400],
      [100, 800],
    ])
  })

  it('ends a key that was still down when recording stopped', () => {
    const notes = notesFromEvents([on(60, 0)], 750)
    expect(notes).toEqual([{ note: 60, velocity: 90, startMs: 0, durationMs: 750 }])
  })

  it('ignores a note-off nothing started', () => {
    expect(notesFromEvents([off(60, 100)])).toEqual([])
  })

  it('measures the whole performance, not just the last attack', () => {
    // The longest note starts first here, so "when the last note began" is wrong.
    const notes = notesFromEvents([on(60, 0), on(64, 100), off(64, 200), off(60, 3000)])
    expect(performanceLength(notes)).toBe(3000)
  })
})

describe('MIDI file', () => {
  const bytes = writeMidiFile(
    notesFromEvents([on(60, 0), off(60, 500), on(64, 500), off(64, 1000)]),
  )
  const ascii = (from: number, length: number) =>
    String.fromCharCode(...bytes.slice(from, from + length))

  it('starts with a format 0 header of one track', () => {
    expect(ascii(0, 4)).toBe('MThd')
    expect([...bytes.slice(8, 12)]).toEqual([0, 0, 0, 1])
  })

  it('carries one track chunk whose declared length matches its body', () => {
    expect(ascii(14, 4)).toBe('MTrk')
    const declared = (bytes[18]! << 24) | (bytes[19]! << 16) | (bytes[20]! << 8) | bytes[21]!
    expect(declared).toBe(bytes.length - 22)
  })

  it('ends with the end-of-track meta event', () => {
    expect([...bytes.slice(-3)]).toEqual([0xff, 0x2f, 0x00])
  })

  it('writes a note-on and a note-off for every note', () => {
    const ons = [...bytes].filter((byte, index) => byte === 0x90 && bytes[index + 1]! < 128).length
    expect(ons).toBeGreaterThanOrEqual(2)
    expect([...bytes]).toContain(0x80)
  })

  it('encodes long gaps as multi-byte variable-length quantities', () => {
    // A ten-second rest is 8000 ticks, far past the 127 a single VLQ byte
    // holds. Mis-encoding it fails silently, as a file that plays at the wrong
    // time — and comparing file sizes would not catch it. So decode the track
    // and check the clock.
    const long = writeMidiFile(
      notesFromEvents([on(60, 0), off(60, 50), on(62, 10000), off(62, 10050)]),
      { bpm: 100 },
    )

    let at = 22
    let tick = 0
    const attacks: number[] = []
    while (at < long.length) {
      let delta = 0
      while (long[at]! & 0x80) delta = (delta << 7) | (long[at++]! & 0x7f)
      delta = (delta << 7) | long[at++]!
      tick += delta

      const status = long[at]!
      if (status === 0xff) {
        at += 2
        const length = long[at++]!
        at += length
        if (long[at - length - 1] === 0x2f) break
      } else {
        if ((status & 0xf0) === 0x90) attacks.push(tick)
        at += 3
      }
    }

    // 480 ticks a quarter at 100bpm is 0.8 ticks per millisecond.
    expect(attacks).toEqual([0, 8000])
  })
})

describe('MusicXML', () => {
  const xml = writeMusicXml(
    notesFromEvents([on(60, 0), off(60, 600), on(52, 600), off(52, 1200)]),
    {
      bpm: 100,
    },
  )

  it('is a partwise score with a grand staff', () => {
    expect(xml).toContain('<score-partwise version="4.0">')
    expect(xml).toContain('<staves>2</staves>')
    expect(xml).toContain('<sign>G</sign>')
    expect(xml).toContain('<sign>F</sign>')
  })

  it('puts middle C on the treble staff and the note below it on the bass', () => {
    const [treble, bass] = xml.split('<backup>')
    expect(treble).toContain('<step>C</step>')
    expect(bass).toContain('<step>E</step>')
  })

  it('fills the silence in each voice with rests', () => {
    expect(xml).toContain('<rest/>')
  })

  it('writes an accidental as an alter rather than its own staff position', () => {
    const sharp = writeMusicXml(notesFromEvents([on(61, 0), off(61, 500)]))
    expect(sharp).toContain('<step>C</step>')
    expect(sharp).toContain('<alter>1</alter>')
  })

  it('ties a span that cannot be written as one note', () => {
    // Five sixteenths is a quarter tied to a sixteenth, not a note.
    const tied = writeMusicXml(notesFromEvents([on(60, 0), off(60, 750)]), { bpm: 100 })
    expect(tied).toContain('<tie type="start"/>')
    expect(tied).toContain('<tied type="start"/>')
  })

  it('opens a new measure rather than overfilling one', () => {
    const long = writeMusicXml(notesFromEvents([on(60, 0), off(60, 9600)]), { bpm: 100 })
    expect(long).toContain('<measure number="4">')
  })

  it('fills every voice of every measure exactly', () => {
    // The invariant that decides whether notation renders or is rejected: at
    // 4/4 with sixteenth divisions each voice must total exactly 16 per bar.
    // Rests too short, a note clipped wrong, a tie that drops its remainder —
    // all of them show up here and nowhere else.
    const busy = writeMusicXml(
      notesFromEvents([
        on(60, 0),
        off(60, 620),
        on(64, 300),
        on(67, 300),
        off(64, 1500),
        off(67, 1500),
        on(48, 1900),
        off(48, 4100),
        on(72, 5000),
        off(72, 5150),
      ]),
      { bpm: 100 },
    )

    for (const measure of busy.split('<measure ').slice(1)) {
      const [treble, bass] = measure.split('<backup>')
      const total = (part: string) =>
        [...part.matchAll(/<note>(?:(?!<\/note>).)*?<duration>(\d+)<\/duration>/gs)]
          .filter((match) => !match[0].includes('<chord/>'))
          .reduce((sum, match) => sum + Number(match[1]), 0)
      expect(total(treble!)).toBe(16)
      expect(total(bass!.replace(/<\/measure>[\s\S]*$/, ''))).toBe(16)
    }
  })

  it('produces well-formed XML with balanced measure tags', () => {
    const opens = xml.match(/<measure /g)?.length ?? 0
    const closes = xml.match(/<\/measure>/g)?.length ?? 0
    expect(opens).toBe(closes)
    expect(opens).toBeGreaterThan(0)
  })
})
