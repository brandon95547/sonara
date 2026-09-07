import { describe, expect, it } from 'vitest'
import { assignHands, handSteps, withInferredHands } from './hand-assignment.js'
import { buildSong, type SongNote } from './song.js'

const at = (startMs: number, ...notes: number[]) =>
  notes.map((note) => ({ note, startMs, durationMs: 350 }))

/** Where each step divides: notes below the index go to the left hand. */
const divide = (notes: { note: number; startMs: number; durationMs: number }[]) => {
  const grouped = handSteps(notes)
  const splits = assignHands(grouped.map(({ step }) => step))
  return grouped.map(({ step }, i) => ({
    left: step.notes.slice(0, splits[i]!),
    right: step.notes.slice(splits[i]!),
  }))
}

/**
 * Which hand plays what, when the file does not say.
 *
 * Every case here came from one song. The opening of *Lean On Me* is four
 * first-inversion triads walking up from E3-G3-C4, and deciding a note's hand
 * from its own pitch tore every one of them in half at middle C — two notes
 * left, one right. It is the most ordinary music imaginable, which is what made
 * it worth taking seriously: whatever breaks there breaks nearly everywhere.
 */
describe('dividing a chord between the hands', () => {
  it('keeps a close-position triad in one hand', () => {
    // The bug, exactly. E3-G3-C4 straddles middle C and fits under one hand.
    expect(divide(at(0, 52, 55, 60))).toEqual([{ left: [52, 55, 60], right: [] }])
  })

  it('keeps a rising line in the hand already playing it', () => {
    // The second half of the bug. With the chords no longer split, they still
    // changed hands halfway up as the notes drifted above middle C — an idle
    // hand costs nothing to bring in, so the faintest preference moved them.
    const riff = [
      ...at(0, 52, 55, 60),
      ...at(400, 53, 57, 62),
      ...at(800, 55, 59, 64),
      ...at(1200, 57, 60, 65),
    ]
    for (const step of divide(riff)) {
      expect(step.right, `${step.left.join()} | ${step.right.join()}`).toEqual([])
    }
  })

  it('divides where the music leaves a gap', () => {
    // A bass note under a melody is two hands however close to middle C either
    // of them sits, because nothing is written in between.
    expect(divide(at(0, 36, 72))).toEqual([{ left: [36], right: [72] }])
    expect(divide(at(0, 48, 52, 55, 72))).toEqual([{ left: [48, 52, 55], right: [72] }])
  })

  it('reads two parts an octave apart as two hands', () => {
    // One hand could take an octave, and sometimes does. Two lines moving in
    // parallel with nothing between them are more often two voices, and the
    // gap is what says so.
    const doubled = [...at(0, 48, 60), ...at(400, 50, 62), ...at(800, 52, 64)]
    for (const step of divide(doubled)) {
      expect(step.left).toHaveLength(1)
      expect(step.right).toHaveLength(1)
    }
  })

  it('puts a melody in the hand its register belongs to', () => {
    for (const step of divide([76, 77, 79].flatMap((n, i) => at(i * 400, n)))) {
      expect(step.left).toEqual([])
    }
    for (const step of divide([40, 41, 43].flatMap((n, i) => at(i * 400, n)))) {
      expect(step.right).toEqual([])
    }
  })
})

describe('what the file already knows', () => {
  const notes = (hand: 'left' | 'right'): SongNote[] =>
    [60, 62, 64].map((note, i) => ({
      note,
      velocity: 90,
      startMs: i * 400,
      durationMs: 350,
      hand,
      role: 'keyboard' as const,
    }))

  it('leaves hands alone where the score named the staff', () => {
    // A MusicXML staff or a separated MIDI track is not a guess, and a guess
    // must not overwrite it — a piece that crosses hands is written that way
    // on purpose.
    const song = buildSong({
      id: 'x',
      title: 'x',
      bpm: 120,
      beatsPerMeasure: 4,
      notes: notes('left'),
      source: 'musicxml',
      handsInferred: false,
    })
    expect(song.notes.every((note) => note.hand === 'left')).toBe(true)
  })

  it('re-decides only where nothing was known', () => {
    const song = buildSong({
      id: 'x',
      title: 'x',
      bpm: 120,
      beatsPerMeasure: 4,
      notes: notes('left'),
      source: 'midi',
      handsInferred: true,
    })
    // Middle C upward with no other voice: that is a right hand.
    expect(song.notes.every((note) => note.hand === 'right')).toBe(true)
  })

  it('does not touch what is not played by hands', () => {
    const drums: SongNote[] = [36, 42].map((note) => ({
      note,
      velocity: 90,
      startMs: 0,
      durationMs: 100,
      hand: 'left' as const,
      role: 'percussion' as const,
    }))
    expect(withInferredHands(drums)).toEqual(drums)
  })
})
