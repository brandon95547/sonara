import { describe, expect, it } from 'vitest'
import { importMuseScore } from '@/features/songs/import-musescore'

/**
 * Octave lines, and the pedal that never arrived.
 *
 * Both are written the same way — an element wrapped in `<Spanner>` — and the
 * importer matched the inner tag, which is a level too deep to ever be found.
 * Pedal had been written that way from the start and had imported nothing.
 *
 * The octave line is the one that changes pitches. MuseScore stores the
 * *written* note under an `8va` or a `15ma` and shifts it on playback, which is
 * the opposite of an octave-transposing clef, where the stored pitch is already
 * what sounds. Read literally, the end of a piece that soars comes out two
 * octaves below the page.
 *
 * Both halves of the fixture below appear in real scores; the second is taken
 * from the shape of a published rag whose final bar restates its opening a
 * fifteenth higher.
 */

const score = (body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="3.01">
  <Score>
    <Part><Staff id="1"><StaffType group="pitched"/></Staff><trackName>Piano</trackName></Part>
    ${body}
  </Score>
</museScore>`

const withOttava = (subtype: string) =>
  score(`<Staff id="1">
    <Measure>
      <voice>
        <TimeSig><sigN>4</sigN><sigD>4</sigD></TimeSig>
        <Chord><durationType>quarter</durationType><Note><pitch>67</pitch></Note></Chord>
        <Spanner type="Ottava">
          <Ottava><subtype>${subtype}</subtype></Ottava>
          <next><location><fractions>1/4</fractions></location></next>
        </Spanner>
        <Chord><durationType>quarter</durationType><Note><pitch>79</pitch></Note></Chord>
        <Spanner type="Ottava"><prev><location><fractions>-1/4</fractions></location></prev></Spanner>
        <Chord><durationType>quarter</durationType><Note><pitch>72</pitch></Note></Chord>
      </voice>
    </Measure>
  </Staff>`)

describe('octave lines', () => {
  it('lifts the notes under a 15ma two octaves, and leaves the rest alone', () => {
    const song = importMuseScore(withOttava('15ma'), 'x')!
    expect(song.notes.map((note) => note.note)).toEqual([67, 79 + 24, 72])
  })

  it('handles the whole family, up and down', () => {
    const shifts: [string, number][] = [
      ['8va', 12],
      ['8vb', -12],
      ['15ma', 24],
      ['15mb', -24],
      ['22ma', 36],
      ['22mb', -36],
    ]
    for (const [subtype, semitones] of shifts) {
      const song = importMuseScore(withOttava(subtype), 'x')!
      expect(song.notes[1]!.note, subtype).toBe(79 + semitones)
    }
  })

  it('leaves a score without one exactly as it was', () => {
    const plain = score(`<Staff id="1"><Measure><voice>
      <Chord><durationType>quarter</durationType><Note><pitch>67</pitch></Note></Chord>
      <Chord><durationType>quarter</durationType><Note><pitch>79</pitch></Note></Chord>
    </voice></Measure></Staff>`)
    expect(importMuseScore(plain, 'x')!.notes.map((n) => n.note)).toEqual([67, 79])
  })

  it('does not shift a note that starts where the line ends', () => {
    // The third note sits immediately after a one-beat line. Off by one beat
    // in the other direction and it would be lifted with the second.
    const song = importMuseScore(withOttava('8va'), 'x')!
    expect(song.notes[2]!.note).toBe(72)
  })
})

describe('the pedal, which was never being read', () => {
  it('records a span MuseScore wrote as a wrapped spanner', () => {
    const song = importMuseScore(
      score(`<Staff id="1"><Measure><voice>
        <Spanner type="Pedal">
          <Pedal><beginText>&#xE655;</beginText></Pedal>
          <next><location><fractions>1/2</fractions></location></next>
        </Spanner>
        <Chord><durationType>half</durationType><Note><pitch>60</pitch></Note></Chord>
      </voice></Measure></Staff>`),
      'x',
    )!
    expect(song.pedal).toHaveLength(1)
    expect(song.pedal[0]!.endMs).toBeGreaterThan(song.pedal[0]!.startMs)
    expect(song.provides.pedal).toBe(true)
  })
})
