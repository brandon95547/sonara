import { describe, expect, it } from 'vitest'
import { fingerSong } from './song-fingering.js'
import { buildSong, type SongNote } from './song.js'

const note = (pitch: number, startMs: number, extra: Partial<SongNote> = {}): SongNote => ({
  note: pitch,
  velocity: 90,
  startMs,
  durationMs: 400,
  hand: 'right',
  role: 'keyboard',
  ...extra,
})

const song = (notes: SongNote[]) =>
  buildSong({
    id: 'x',
    title: 'x',
    bpm: 120,
    beatsPerMeasure: 4,
    notes,
    source: 'midi',
    handsInferred: true,
  })

describe('fingering a song the file did not finger', () => {
  const scale = [60, 62, 64, 65, 67, 69, 71, 72].map((pitch, i) => note(pitch, i * 500))

  it('works out the fingering a MIDI file could never carry', () => {
    const fingered = fingerSong(song(scale))
    expect(fingered.notes.map((n) => n.finger)).toEqual([1, 2, 3, 1, 2, 3, 4, 5])
    expect(fingered.hasFingering).toBe(true)
    expect(fingered.fingeringSource).toBe('derived')
  })

  it('still says the file itself provided none', () => {
    // `provides` is a statement about the file. Working something out does not
    // change what the file held, and the two must not be confused.
    expect(fingerSong(song(scale)).provides.fingering).toBe(false)
  })

  it('leaves a fingered score exactly as its editor wrote it', () => {
    const edited = song(scale.map((n, i) => (i === 0 ? { ...n, finger: 2 } : n)))
    expect(edited.fingeringSource).toBe('score')
    const after = fingerSong(edited)
    expect(after).toBe(edited)
    expect(after.notes[1]!.finger).toBeUndefined()
  })

  it('declines chords rather than guessing at them', () => {
    // The model is for melodic fragments, and the method books finger a triad
    // without regard for what follows it — which their own cadences disprove.
    const chords = [0, 1, 2].flatMap((step) => [60, 64, 67].map((pitch) => note(pitch, step * 500)))
    const fingered = fingerSong(song(chords))
    expect(fingered.notes.every((n) => n.finger === undefined)).toBe(true)
    expect(fingered.fingeringSource).toBeUndefined()
  })

  it('fingers each hand as its own line', () => {
    const both = [
      ...[60, 62, 64, 65].map((pitch, i) => note(pitch, i * 500)),
      ...[48, 50, 52, 53].map((pitch, i) => note(pitch, i * 500, { hand: 'left' })),
    ]
    const fingered = fingerSong(song(both))
    const right = fingered.notes.filter((n) => n.hand === 'right').map((n) => n.finger)
    const left = fingered.notes.filter((n) => n.hand === 'left').map((n) => n.finger)
    expect(right).toEqual([1, 2, 3, 4])
    // The left hand runs the other way, so the same rising line takes the
    // fingers in the opposite order.
    expect(left).toEqual([4, 3, 2, 1])
  })

  it('starts a new run after a rest long enough to move the hand', () => {
    const split = [
      ...[60, 62, 64].map((pitch, i) => note(pitch, i * 400)),
      ...[84, 86, 88].map((pitch, i) => note(pitch, 4000 + i * 400)),
    ]
    const fingered = fingerSong(song(split))
    // A leap of two octaves is beyond any pair of fingers. Fingered as one run
    // it would be unplayable and the whole thing would come back empty.
    expect(fingered.notes.every((n) => n.finger !== undefined)).toBe(true)
  })
})
