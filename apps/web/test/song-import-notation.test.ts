import { describe, expect, it } from 'vitest'
import { keyName, spellingName } from '@sonara/shared'
import { importMidi } from '@/features/songs/import-midi'
import { importMuseScore } from '@/features/songs/import-musescore'
import { importMusicXml } from '@/features/songs/import-musicxml'

/**
 * What the importers read that they used to get wrong, or not read at all:
 * keys, spellings, bars, ties, grace notes, tuplets, tempo marks and parts.
 * Every case here was a defect a reader could see on the staff.
 */

/* ---- Standard MIDI Files, hand-assembled --------------------------------- */

/** A variable-length quantity, as SMF writes delta times. */
function vlq(value: number): number[] {
  const bytes = [value & 0x7f]
  let left = value >> 7
  while (left > 0) {
    bytes.unshift((left & 0x7f) | 0x80)
    left >>= 7
  }
  return bytes
}

/** One-track file at 96 ticks per crotchet from a list of events. */
function smf(events: readonly (readonly [delta: number, ...bytes: number[]])[]): Uint8Array {
  const track = events.flatMap(([delta, ...bytes]) => [...vlq(delta), ...bytes])
  track.push(0x00, 0xff, 0x2f, 0x00)
  const length = track.length
  return new Uint8Array([
    0x4d,
    0x54,
    0x68,
    0x64,
    0,
    0,
    0,
    6,
    0,
    0,
    0,
    1,
    0,
    96,
    0x4d,
    0x54,
    0x72,
    0x6b,
    (length >>> 24) & 0xff,
    (length >>> 16) & 0xff,
    (length >>> 8) & 0xff,
    length & 0xff,
    ...track,
  ])
}

const keySig = (sf: number, minor: boolean) =>
  [0x00, 0xff, 0x59, 0x02, sf & 0xff, minor ? 1 : 0] as const
const on = (delta: number, note: number) => [delta, 0x90, note, 0x64] as const
const off = (delta: number, note: number) => [delta, 0x80, note, 0x40] as const

describe('a MIDI file’s key signature', () => {
  it.each([
    [-2, false, 'B♭ major'],
    [-3, false, 'E♭ major'],
    [-5, false, 'D♭ major'],
    [2, false, 'D major'],
    [0, true, 'A minor'],
    [1, true, 'E minor'],
    [-1, true, 'D minor'],
    [-3, true, 'C minor'],
    [3, true, 'F♯ minor'],
  ])('reads %i sharps/flats, minor=%s as %s', (sf, minor, expected) => {
    const song = importMidi(smf([keySig(sf, minor), on(0, 60), off(96, 60)]), 'key')!
    expect(keyName(song.key!)).toBe(expected)
    expect(song.key!.declared).toBe(true)
  })

  it('spells the notes in that key', () => {
    // F major: the note a semitone under C is B♭, never A♯.
    const song = importMidi(
      smf([keySig(-1, false), on(0, 70), off(96, 70), on(0, 72), off(96, 72)]),
      'f',
    )!
    expect(spellingName(song.notes[0]!.spelling!)).toBe('B♭')
    // A minor: the leading tone is G♯.
    const minor = importMidi(
      smf([keySig(0, true), on(0, 68), off(96, 68), on(0, 69), off(96, 69)]),
      'am',
    )!
    expect(spellingName(minor.notes[0]!.spelling!)).toBe('G♯')
  })

  it('spells a chromatic step in the direction it is going', () => {
    // C C♯ D going up in C major; D D♭ C coming down.
    const up = importMidi(
      smf([
        keySig(0, false),
        on(0, 60),
        off(96, 60),
        on(0, 61),
        off(96, 61),
        on(0, 62),
        off(96, 62),
      ]),
      'up',
    )!
    expect(spellingName(up.notes[1]!.spelling!)).toBe('C♯')
    const down = importMidi(
      smf([
        keySig(0, false),
        on(0, 62),
        off(96, 62),
        on(0, 61),
        off(96, 61),
        on(0, 60),
        off(96, 60),
      ]),
      'down',
    )!
    expect(spellingName(down.notes[1]!.spelling!)).toBe('D♭')
  })
})

describe('a MIDI file’s bars', () => {
  it('places every note in crotchets from the file’s own ticks', () => {
    const song = importMidi(smf([on(0, 60), off(48, 60), on(48, 62), off(144, 62)]), 'q')!
    expect(song.notes.map((note) => [note.startQ, note.durationQ])).toEqual([
      [0, 0.5],
      [1, 1.5],
    ])
  })

  it('lays the bars out from the metre and tempo maps', () => {
    // 6/8 at 120, then a tempo change to 60 at bar two: the second bar takes
    // twice as long and every bar line after it moves.
    const song = importMidi(
      smf([
        [0, 0xff, 0x58, 0x04, 6, 3, 24, 8], // 6/8
        [0, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20], // 120 bpm
        on(0, 60),
        off(288, 60), // one bar: three crotchets
        [0, 0xff, 0x51, 0x03, 0x0f, 0x42, 0x40], // 60 bpm
        on(0, 62),
        off(288, 62),
        on(0, 64),
        off(288, 64),
      ]),
      'bars',
    )!
    expect(song.measures.map((bar) => [bar.beats, bar.beatType])).toEqual([
      [6, 8],
      [6, 8],
      [6, 8],
    ])
    expect(song.measures.map((bar) => bar.startMs)).toEqual([0, 1500, 4500])
    expect(song.measures.map((bar) => bar.quarterMs)).toEqual([500, 1000, 1000])
    expect(song.measures.map((bar) => bar.number)).toEqual([1, 2, 3])
  })

  it('starts a new bar where the metre changes', () => {
    const song = importMidi(
      smf([
        [0, 0xff, 0x58, 0x04, 4, 2, 24, 8], // 4/4
        on(0, 60),
        off(384, 60),
        [0, 0xff, 0x58, 0x04, 3, 2, 24, 8], // 3/4 from bar two
        on(0, 62),
        off(288, 62),
      ]),
      'metre',
    )!
    expect(song.measures.map((bar) => [bar.startQ, bar.durationQ])).toEqual([
      [0, 4],
      [4, 3],
    ])
  })
})

/* ---- MuseScore ----------------------------------------------------------- */

const mscx = (measures: string, extra = '') => `<museScore version="4.20"><Score>
<Part><Staff id="1"/><trackName>Piano</trackName></Part>
<Staff id="1">${measures}</Staff>${extra}
</Score></museScore>`

const measure = (voice: string, attributes = '') =>
  `<Measure${attributes}><voice>${voice}</voice></Measure>`

const chord = (pitch: number, type = 'quarter', extra = '', noteExtra = '') =>
  `<Chord>${extra}<durationType>${type}</durationType><Note><pitch>${pitch}</pitch>${noteExtra}</Note></Chord>`

describe('a MuseScore score', () => {
  it('holds a tied note instead of striking it twice', () => {
    const tie = (part: 'next' | 'prev', fraction: string) =>
      `<Spanner type="Tie"><${part}><location><fractions>${fraction}</fractions></location></${part}></Spanner>`
    const song = importMuseScore(
      mscx(
        measure(chord(60, 'half') + chord(60, 'half', '', tie('next', '1/2'))) +
          measure(chord(60, 'half', '', tie('prev', '-1/2')) + chord(62, 'half')),
      ),
      'tie',
    )!
    expect(song.notes.map((note) => [note.note, note.startQ, note.durationQ])).toEqual([
      [60, 0, 2],
      [60, 2, 4],
      [62, 6, 2],
    ])
  })

  it('does not let a grace note push the beat', () => {
    const song = importMuseScore(
      mscx(measure(chord(62, 'eighth', '<acciaccatura/>') + chord(64) + chord(65))),
      'grace',
    )!
    const main = song.notes.filter((note) => !note.grace)
    expect(main.map((note) => [note.note, note.startQ])).toEqual([
      [64, 0],
      [65, 1],
    ])
    const grace = song.notes.find((note) => note.grace)!
    expect(grace.note).toBe(62)
    expect(grace.startQ).toBeLessThanOrEqual(0)
  })

  it('scales the chords under a tuplet', () => {
    // Three triplet quavers fill one crotchet; the note after them is on beat two.
    const triplet = `<Tuplet><normalNotes>2</normalNotes><actualNotes>3</actualNotes><baseNote>eighth</baseNote></Tuplet>`
    const song = importMuseScore(
      mscx(
        measure(
          triplet +
            chord(60, 'eighth') +
            chord(62, 'eighth') +
            chord(64, 'eighth') +
            '<endTuplet/>' +
            chord(65),
        ),
      ),
      'tuplet',
    )!
    expect(song.notes.map((note) => Number(note.startQ!.toFixed(4)))).toEqual([
      0, 0.3333, 0.6667, 1,
    ])
    expect(song.notes[0]!.written).toMatchObject({
      value: 'eighth',
      dots: 0,
      tuplet: { actual: 3, normal: 2 },
    })
    expect(song.notes[0]!.written!.tuplet!.id).toBe(song.notes[2]!.written!.tuplet!.id)
    expect(song.notes[3]!.written!.tuplet).toBeUndefined()
  })

  it('reads the spelling the file wrote', () => {
    // tpc 12 is B♭; tpc 24 is A♯. Same key, different note.
    const song = importMuseScore(
      mscx(
        measure(
          chord(70, 'quarter', '', '<tpc>12</tpc>') + chord(70, 'quarter', '', '<tpc>24</tpc>'),
        ),
      ),
      'tpc',
    )!
    expect(song.notes.map((note) => spellingName(note.spelling!))).toEqual(['B♭', 'A♯'])
  })

  it('reads the mode when the file gives one, and works it out when it does not', () => {
    const declared = importMuseScore(
      mscx(measure('<KeySig><accidental>0</accidental><mode>minor</mode></KeySig>' + chord(69))),
      'declared',
    )!
    expect(keyName(declared.key!)).toBe('A minor')
    // No sharps, and a tune that sits on A and G♯: A minor, not C major.
    const minorTune = [69, 68, 69, 71, 72, 71, 69, 68, 69]
      .map((pitch) => chord(pitch, 'eighth'))
      .join('')
    const inferred = importMuseScore(
      mscx(measure('<KeySig><accidental>0</accidental></KeySig>' + minorTune)),
      'inferred',
    )!
    expect(keyName(inferred.key!)).toBe('A minor')
    const majorTune = [60, 64, 67, 72, 67, 64, 60, 62]
      .map((pitch) => chord(pitch, 'eighth'))
      .join('')
    expect(
      keyName(
        importMuseScore(
          mscx(measure('<KeySig><accidental>0</accidental></KeySig>' + majorTune)),
          'c',
        )!.key!,
      ),
    ).toBe('C major')
  })

  it('reads chord symbols and tempo marks', () => {
    const song = importMuseScore(
      mscx(
        measure(
          '<Tempo><tempo>2</tempo></Tempo><Harmony><root>14</root><name>maj7</name></Harmony>' +
            chord(60, 'half') +
            '<Harmony><root>17</root><name>m</name><base>14</base></Harmony>' +
            chord(64, 'half'),
        ),
      ),
      'chords',
    )!
    expect(song.bpm).toBe(120)
    expect(song.chords.map((symbol) => [symbol.text, symbol.startQ])).toEqual([
      ['Cmaj7', 0],
      ['Am/C', 2],
    ])
  })

  it('numbers a pickup bar zero and lays the bars out after it', () => {
    const song = importMuseScore(
      mscx(
        measure('<TimeSig><sigN>3</sigN><sigD>4</sigD></TimeSig>' + chord(60), ' len="1/4"') +
          measure(chord(62) + chord(64) + chord(65)) +
          measure(chord(67, 'half') + chord(69)),
      ),
      'pickup',
    )!
    expect(song.measures.map((bar) => [bar.number, bar.startQ, bar.durationQ])).toEqual([
      [0, 0, 1],
      [1, 1, 3],
      [2, 4, 3],
    ])
    expect(song.measures[1]!.startMs).toBe(600) // one crotchet at the default 100 bpm
  })
})

/* ---- MusicXML ------------------------------------------------------------ */

const xml = (parts: string, partList: string) => `<score-partwise version="4.0">
<part-list>${partList}</part-list>${parts}</score-partwise>`

const scorePart = (id: string, name: string, program?: number) =>
  `<score-part id="${id}"><part-name>${name}</part-name>${
    program
      ? `<midi-instrument id="${id}-I1"><midi-program>${program}</midi-program></midi-instrument>`
      : ''
  }</score-part>`

const xnote = (step: string, octave: number, duration: number, extra = '', alter?: number) =>
  `<note><pitch><step>${step}</step>${alter !== undefined ? `<alter>${alter}</alter>` : ''}<octave>${octave}</octave></pitch><duration>${duration}</duration>${extra}</note>`

describe('a MusicXML score', () => {
  it('plays every part from the beginning of the piece', () => {
    const song = importMusicXml(
      xml(
        `<part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>${xnote('G', 4, 4)}</measure></part>` +
          `<part id="P2"><measure number="1"><attributes><divisions>1</divisions></attributes>${xnote('C', 3, 4)}</measure></part>`,
        scorePart('P1', 'Voice') + scorePart('P2', 'Piano'),
      ),
      'multi',
    )!
    // Both at the start of the piece; the song orders them low to high.
    expect(song.notes.map((note) => [note.note, note.startMs, note.role])).toEqual([
      [48, 0, 'keyboard'],
      [67, 0, 'accompaniment'],
    ])
    expect(song.parts).toEqual(['Voice', 'Piano'])
    expect(song.measures).toHaveLength(1)
  })

  it('converts a metronome mark in minims or dotted crotchets to crotchets', () => {
    const at = (metronome: string) =>
      importMusicXml(
        xml(
          `<part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes><direction><direction-type><metronome>${metronome}</metronome></direction-type></direction>${xnote('C', 4, 2)}</measure></part>`,
          scorePart('P1', 'Piano'),
        ),
        'bu',
      )!.bpm
    expect(at('<beat-unit>half</beat-unit><per-minute>60</per-minute>')).toBe(120)
    expect(at('<beat-unit>quarter</beat-unit><beat-unit-dot/><per-minute>80</per-minute>')).toBe(
      120,
    )
    expect(at('<beat-unit>quarter</beat-unit><per-minute>90</per-minute>')).toBe(90)
  })

  it('reads the spelling, the dynamics and the written value', () => {
    const song = importMusicXml(
      xml(
        `<part id="P1"><measure number="1"><attributes><divisions>2</divisions><key><fifths>-1</fifths></key></attributes>` +
          `<direction><direction-type><dynamics><pp/></dynamics></direction-type></direction>` +
          xnote('B', 4, 3, '<type>quarter</type><dot/>', -1) +
          xnote('A', 4, 1, '<type>eighth</type>', 1) +
          `</measure></part>`,
        scorePart('P1', 'Piano', 1),
      ),
      'spelled',
    )!
    expect(song.notes.map((note) => spellingName(note.spelling!))).toEqual(['B♭', 'A♯'])
    expect(song.notes.map((note) => note.velocity)).toEqual([33, 33])
    expect(song.notes[0]!.written).toEqual({ value: 'quarter', dots: 1 })
    expect(song.notes.map((note) => note.durationQ)).toEqual([1.5, 0.5])
  })

  it('reads a tuplet and a grace note', () => {
    const triplet = (step: string) =>
      xnote(
        step,
        4,
        2,
        '<type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>',
      )
    const song = importMusicXml(
      xml(
        `<part id="P1"><measure number="1"><attributes><divisions>6</divisions></attributes>` +
          `<note><grace/><pitch><step>B</step><octave>3</octave></pitch><type>eighth</type></note>` +
          triplet('C') +
          triplet('D') +
          triplet('E') +
          xnote('F', 4, 6, '<type>quarter</type>') +
          `</measure></part>`,
        scorePart('P1', 'Piano'),
      ),
      'tuplet',
    )!
    const main = song.notes.filter((note) => !note.grace)
    expect(main.map((note) => Number(note.startQ!.toFixed(4)))).toEqual([0, 0.3333, 0.6667, 1])
    expect(main[0]!.written!.tuplet).toMatchObject({ actual: 3, normal: 2 })
    expect(main[0]!.written!.tuplet!.id).toBe(main[2]!.written!.tuplet!.id)
    expect(main[3]!.written!.tuplet).toBeUndefined()
    expect(song.notes.find((note) => note.grace)!.note).toBe(59)
  })

  it('works out the mode when the key does not say', () => {
    const tune = [69, 68, 69, 71, 72, 71, 69, 68]
      .map((pitch) => {
        const step = 'C D E F G A B'.split(' ')[[0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6][pitch % 12]!]!
        const alter = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0][pitch % 12]!
        return xnote(step, Math.floor(pitch / 12) - 1, 1, '', alter || undefined)
      })
      .join('')
    const song = importMusicXml(
      xml(
        `<part id="P1"><measure number="1"><attributes><divisions>2</divisions><key><fifths>0</fifths></key></attributes>${tune}</measure></part>`,
        scorePart('P1', 'Piano'),
      ),
      'mode',
    )!
    expect(keyName(song.key!)).toBe('A minor')
  })

  it('reads chord symbols and a pickup bar', () => {
    const song = importMusicXml(
      xml(
        `<part id="P1"><measure number="0" implicit="yes"><attributes><divisions>1</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes>` +
          `<harmony><root><root-step>G</root-step></root><kind>dominant</kind></harmony>${xnote('D', 4, 1)}</measure>` +
          `<measure number="1"><harmony><root><root-step>C</root-step></root><kind>major</kind></harmony>${xnote('C', 4, 3)}</measure></part>`,
        scorePart('P1', 'Piano'),
      ),
      'pickup',
    )!
    expect(song.chords.map((symbol) => [symbol.text, symbol.startQ])).toEqual([
      ['G7', 0],
      ['C', 1],
    ])
    expect(song.measures.map((bar) => [bar.number, bar.startQ, bar.durationQ])).toEqual([
      [0, 0, 1],
      [1, 1, 3],
    ])
  })
})
