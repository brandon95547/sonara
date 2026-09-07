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

  it('fingers chords with the fingering the method books print', () => {
    const chords = [0, 1, 2].flatMap((step) => [60, 64, 67].map((pitch) => note(pitch, step * 500)))
    const fingered = fingerSong(song(chords))
    // A root-position triad in the right hand: 1 3 5, on every repetition.
    expect(fingered.notes.map((n) => n.finger)).toEqual([1, 3, 5, 1, 3, 5, 1, 3, 5])
  })

  it('gives four octaves apart to two hands rather than refusing it', () => {
    // It was refusing this, which was right while a note's hand came from its
    // own pitch and nothing else. Two notes four octaves apart are not a chord
    // one hand fails to hold — they are one note in each hand, and now read
    // that way.
    const wide = [36, 84].map((pitch) => note(pitch, 0))
    const fingered = fingerSong(song(wide))
    expect(fingered.notes.map((n) => n.hand)).toEqual(['left', 'right'])
    expect(fingered.notes.every((n) => n.finger !== undefined)).toBe(true)
  })

  it('still declines what neither hand can hold', () => {
    // Six notes spread over five octaves cannot be divided into two grips, and
    // a blank is the honest answer. The search carries on either side of it.
    const impossible = [24, 40, 55, 72, 88, 103].map((pitch) => note(pitch, 0))
    const fingered = fingerSong(song(impossible))
    expect(fingered.notes.some((n) => n.finger === undefined)).toBe(true)
  })

  it('fingers a part that alternates between chords and single notes', () => {
    // Why this had to work over steps rather than runs of single notes: a chord
    // used to end the run, so a melody threaded between chords came back in
    // unfingered fragments.
    const mixed: SongNote[] = [
      ...[60, 64, 67].map((p) => note(p, 0)),
      note(69, 500),
      note(71, 1000),
      ...[60, 64, 67].map((p) => note(p, 1500)),
      note(72, 2000),
    ]
    expect(fingerSong(song(mixed)).notes.every((n) => n.finger !== undefined)).toBe(true)
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
