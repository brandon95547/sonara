import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildSong,
  songSteps,
  staffPlacement,
  writtenValue,
  type Accidental,
  type DetectedKey,
  type Song,
  type SongNote,
} from '@sonara/shared'
import { measureScore } from '@/features/staff/score'
import { Chord, staffOf } from '@/features/staff/StaffNotes'
import { GrandStaff } from '@/features/staff/GrandStaff'
import { useKeyboardStore } from '@/state/keyboard-store'
import { useLearningStore } from '@/state/learning-store'

class NoSize {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = NoSize as unknown as typeof ResizeObserver

afterEach(cleanup)

/**
 * What the page says a note is.
 *
 * The staff could only ever write one sign. It drew a sharp — the character was
 * typed into the component — so a B♭ in F major came out as a notehead on the B
 * line under a signature with a flat on it, which a reader has to take as B♮,
 * and an F♮ in D major got nothing at all and read as F♯. Every note was in the
 * right place and half of them were the wrong note.
 *
 * The spelling, the hand and the bar all reach the page from the score now, and
 * these are the assertions that say so. They are worth having twice over: the
 * shared layer that works them out has its own tests and passed all of them
 * while none of it was being drawn.
 */

const F_MAJOR: DetectedKey = { pitchClass: 5, mode: 'major', fifths: -1, declared: true }
const D_MAJOR: DetectedKey = { pitchClass: 2, mode: 'major', fifths: 2, declared: true }
const C_MAJOR: DetectedKey = { pitchClass: 0, mode: 'major', fifths: 0, declared: true }

/** One note per beat, so a bar is four of them and the bar lines fall where they read. */
function melody(
  key: DetectedKey,
  pitches: readonly (Partial<SongNote> & { note: number })[],
  bpm = 120,
): Song {
  const beat = 60000 / bpm
  return buildSong({
    id: 'spelling',
    title: 'Spelling',
    bpm,
    beatsPerMeasure: 4,
    key,
    source: 'musicxml',
    handsInferred: false,
    notes: pitches.map((pitch, index) => ({
      velocity: 80,
      startMs: index * beat,
      durationMs: beat - 10,
      hand: 'right' as const,
      role: 'keyboard' as const,
      ...pitch,
    })),
  })
}

/** The notes of a measured score, flattened, in playing order. */
const drawn = (song: Song) =>
  measureScore(song, songSteps(song, 'both')).flatMap((step) => step.notes)

describe('the sign a note prints', () => {
  it('writes a flat key’s flats as flats, and prints no sign for them', () => {
    // B♭3 in F major: the signature already says it.
    const [note] = drawn(melody(F_MAJOR, [{ note: 58, spelling: { letter: 6, accidental: -1 } }]))
    expect(staffPlacement(note!.note, note!.spelling).letter).toBe('B')
    expect(note!.accidental).toBeNull()
  })

  it('prints a natural where the signature would have altered the note', () => {
    // F♮4 in D major, whose signature sharpens F.
    const [note] = drawn(melody(D_MAJOR, [{ note: 65, spelling: { letter: 3, accidental: 0 } }]))
    expect(note!.accidental).toBe(0)
  })

  it('prints nothing on a note the signature already accounts for', () => {
    const [note] = drawn(melody(D_MAJOR, [{ note: 66, spelling: { letter: 3, accidental: 1 } }]))
    expect(note!.accidental).toBeNull()
  })

  it('prints a sign the signature does not give', () => {
    const [note] = drawn(melody(C_MAJOR, [{ note: 61, spelling: { letter: 0, accidental: 1 } }]))
    expect(note!.accidental).toBe(1)
  })
})

describe('what a bar remembers', () => {
  const sharp = { letter: 0, accidental: 1 as const }
  const natural = { letter: 0, accidental: 0 as const }

  it('says an accidental once, and lets the rest of the bar assume it', () => {
    const notes = drawn(
      melody(C_MAJOR, [{ note: 61, spelling: sharp }, { note: 62 }, { note: 61, spelling: sharp }]),
    )
    expect(notes.map((note) => note.accidental)).toEqual([1, null, null])
  })

  it('prints a natural when the bar goes back inside the key', () => {
    const notes = drawn(
      melody(C_MAJOR, [
        { note: 61, spelling: sharp },
        { note: 60, spelling: natural },
      ]),
    )
    expect(notes.map((note) => note.accidental)).toEqual([1, 0])
  })

  it('forgets at the bar line, so the next bar says it again', () => {
    // Five notes at one per beat: the fifth opens the second bar.
    const notes = drawn(
      melody(C_MAJOR, [
        { note: 61, spelling: sharp },
        { note: 62 },
        { note: 64 },
        { note: 65 },
        { note: 61, spelling: sharp },
      ]),
    )
    expect(notes.map((note) => note.accidental)).toEqual([1, null, null, null, 1])
  })

  it('keeps the hands apart: a sharp in one staff says nothing about the other', () => {
    const notes = drawn(
      melody(C_MAJOR, [
        { note: 61, spelling: sharp, hand: 'right' },
        { note: 49, spelling: sharp, hand: 'left' },
      ]),
    )
    expect(notes.map((note) => note.accidental)).toEqual([1, 1])
  })
})

describe('which staff a note is written on', () => {
  it('follows the hand, not the pitch', () => {
    // C5, well above middle C, taken by the left hand — bass with ledger lines,
    // which is how piano music is written and not what a seam at middle C says.
    expect(staffOf({ note: 72, hand: 'left' })).toBe('bass')
    expect(staffOf({ note: 55, hand: 'right' })).toBe('treble')
  })

  it('falls back to the seam when nobody has said', () => {
    expect(staffOf({ note: 72 })).toBe('treble')
    expect(staffOf({ note: 55 })).toBe('bass')
  })

  it('reaches the drawn score', () => {
    const [note] = drawn(melody(C_MAJOR, [{ note: 72, hand: 'left' }]))
    expect(staffOf(note!)).toBe('bass')
  })
})

describe('the glyph that reaches the page', () => {
  const sign = (accidental: Accidental | null) => {
    const { container } = render(
      <svg>
        <Chord
          x={100}
          notes={[{ note: 61, spelling: { letter: 0, accidental: 1 }, accidental }]}
          value={writtenValue(500, 500)}
        />
      </svg>,
    )
    return container.querySelector('.staff__accidental')?.textContent ?? null
  }

  it.each([
    [-2, '𝄫'],
    [-1, '♭'],
    [0, '♮'],
    [1, '♯'],
    [2, '𝄪'],
  ])('draws %i as %s', (accidental, glyph) => {
    expect(sign(accidental as Accidental)).toBe(glyph)
  })

  it('draws nothing when the score decided nothing', () => {
    expect(sign(null)).toBeNull()
  })
})

/**
 * The live staff had no key at all: it drew what you played in C major
 * whatever you were practising, so every flat scale came out in sharps.
 */
describe('the staff that follows your hands', () => {
  beforeEach(() => {
    useKeyboardStore.setState({ active: {}, sustain: false, lastNote: null })
    // B♭ major: two flats.
    useLearningStore.getState().updateSpec({ rootPitchClass: 10, scaleTypeId: 'major' })
  })

  const staff = () => {
    const { container } = render(<GrandStaff />)
    return container.querySelector('svg')!
  }

  it('draws the signature of the key being practised', () => {
    const marks = [...staff().querySelectorAll('.staff__key .staff__accidental')]
    expect(marks).toHaveLength(4) // two flats, on each of the two staves
    expect(new Set(marks.map((mark) => mark.textContent))).toEqual(new Set(['♭']))
  })

  it('spells a played note the way the key writes it, and prints no sign for it', () => {
    // A♯3 and B♭3 are the same key on the piano. In B♭ major it is B♭, and the
    // signature has already said so.
    useKeyboardStore.setState({ active: { 58: { note: 58, velocity: 80, source: 'midi' } } })
    const svg = staff()
    expect(svg.querySelectorAll('.staff__note .staff__accidental')).toHaveLength(0)
    expect(svg.getAttribute('aria-label')).toContain('B♭3')
  })

  it('still prints a sign for a note from outside the key', () => {
    useKeyboardStore.setState({ active: { 61: { note: 61, velocity: 80, source: 'midi' } } })
    const svg = staff()
    expect(svg.querySelector('.staff__note .staff__accidental')?.textContent).toBe('♭')
    expect(svg.getAttribute('aria-label')).toContain('D♭4')
  })
})
