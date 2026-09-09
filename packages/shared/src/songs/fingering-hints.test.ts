import { describe, expect, it } from 'vitest'
import { fingeringHints } from './fingering-hints.js'
import { fingerSong } from './song-fingering.js'
import { buildSong, type SongNote } from './song.js'

const note = (pitch: number, startMs: number, extra: Partial<SongNote> = {}): SongNote => ({
  note: pitch,
  velocity: 90,
  startMs,
  durationMs: 300,
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
    source: 'musescore',
    handsInferred: false,
  })

/**
 * A fingering on every note is the same as none.
 *
 * The derived fingering knows a finger for all of them, and a rag came out with
 * a thousand digits printed under a thousand noteheads. What a reader needs is
 * the handful they could not have worked out for themselves.
 */
describe('which fingerings a staff should print', () => {
  it('prints the first of a run and nothing that merely follows it', () => {
    // An octave of C major: 1 2 3 1 2 3 4 5. Five notes would fit under the
    // hand and need no decision at all — the turn is the point.
    const scale = [60, 62, 64, 65, 67, 69, 71, 72].map((pitch, i) => note(pitch, i * 400))
    const fingered = fingerSong(song(scale))
    const shown = fingeringHints(fingered)

    // Where the hand lands, and where the thumb turns under. Everything
    // between is the finger before it plus one, which the reader can see.
    const printed = fingered.notes.filter((n) => shown.has(n))
    expect(printed.map((n) => n.note)).toEqual([60, 65])
    expect(printed.map((n) => n.finger)).toEqual([1, 1])
  })

  it('prints again after a rest long enough to move the hand', () => {
    const split = [
      ...[60, 62, 64].map((pitch, i) => note(pitch, i * 300)),
      ...[60, 62, 64].map((pitch, i) => note(pitch, 5000 + i * 300)),
    ]
    const fingered = fingerSong(song(split))
    const shown = [...fingeringHints(fingered)]
    expect(shown.map((n) => n.startMs).sort((a, b) => a - b)).toEqual([0, 5000])
  })

  it('prints a chord once and not while it repeats', () => {
    const vamp = [0, 1, 2, 3].flatMap((bar) => [60, 64, 67].map((pitch) => note(pitch, bar * 500)))
    const fingered = fingerSong(song(vamp))
    const shown = fingered.notes.filter((n) => fingeringHints(fingered).has(n))
    // The grip is shown when it arrives and not on each of its repeats.
    expect(shown).toHaveLength(3)
    expect(shown.every((n) => n.startMs === 0)).toBe(true)
  })

  it('says nothing when the hand keeps its shape on different keys', () => {
    // Two triads a step apart, both taken 1 3 5. The music moved; the hand did
    // not, and repeating the fingering tells the reader nothing they cannot
    // see. Comparing pitches instead of grips was the first attempt, and it
    // reprinted the fingering under every chord of a rag.
    const moving = [
      ...[60, 64, 67].map((pitch) => note(pitch, 0)),
      ...[62, 65, 69].map((pitch) => note(pitch, 500)),
    ]
    const fingered = fingerSong(song(moving))
    const shown = fingered.notes.filter((n) => fingeringHints(fingered).has(n))
    expect(new Set(shown.map((n) => n.startMs))).toEqual(new Set([0]))
  })

  it('prints a grip again when the hand has to leap', () => {
    const leap = [
      ...[60, 64, 67].map((pitch) => note(pitch, 0)),
      ...[79, 83, 86].map((pitch) => note(pitch, 500)),
    ]
    const fingered = fingerSong(song(leap))
    const shown = fingered.notes.filter((n) => fingeringHints(fingered).has(n))
    // Same shape, a fifteenth away: the reader has to re-anchor it.
    expect(new Set(shown.map((n) => n.startMs))).toEqual(new Set([0, 500]))
  })

  it('leaves every finger on the note, whatever the staff prints', () => {
    const scale = [60, 62, 64, 65, 67, 69, 71, 72].map((pitch, i) => note(pitch, i * 400))
    const fingered = fingerSong(song(scale))
    // The hand card and the keys read the note, not this.
    expect(fingered.notes.every((n) => n.finger !== undefined)).toBe(true)
  })
})
