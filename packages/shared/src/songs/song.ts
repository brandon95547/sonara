/**
 * A piece the player is learning, however it arrived.
 *
 * One shape for every import format, so nothing downstream — the player, the
 * keyboard, the staff, the loop — has to care whether a song came from a MIDI
 * file or from notation. Times are milliseconds from the start of the piece;
 * the tempo is carried separately so playback can slow down without any of
 * these numbers changing.
 */

// The same Hand the fingering module uses: one piece of music has one idea of
// which hand plays a note, wherever that idea came from.
import type { Hand } from '../music/fingering.js'
import type { PartRole } from './general-midi.js'
import { estimateKey, type DetectedKey } from './key-of.js'
export type { Hand }

export interface SongNote {
  readonly note: number
  readonly velocity: number
  readonly startMs: number
  readonly durationMs: number
  /**
   * Which hand plays it.
   *
   * Taken from the file where the file says — MusicXML names a staff, and a
   * two-track MIDI file almost always means right hand then left. Guessed from
   * pitch only when nothing else is on offer, because a guess that splits at
   * middle C is wrong exactly where a piece crosses hands.
   */
  readonly hand: Hand
  /**
   * What kind of part this note belongs to.
   *
   * `percussion` is not a pitch at all — on the drum channel a note number
   * names a drum — so it must never reach the piano or the keys. `keyboard` is
   * the part a player is learning; `accompaniment` is everyone else in the
   * room, audible so the piece makes sense but not something to put fingers on.
   */
  readonly role: PartRole
  /**
   * The finger the score asks for, 1-5, when the score said.
   *
   * Only MusicXML carries this; MIDI has nowhere to put it. Absent means
   * nobody has fingered the piece, which is a different thing from finger 1
   * and has to read differently on screen.
   */
  readonly finger?: number
}

export interface Song {
  readonly id: string
  readonly title: string
  /** The tempo the file declares. Playback scales from this. */
  readonly bpm: number
  readonly beatsPerMeasure: number
  readonly notes: readonly SongNote[]
  readonly durationMs: number
  /** Bar lines, in milliseconds, so a loop can be set in measures. */
  readonly measureMs: number
  readonly measureCount: number
  readonly source: 'midi' | 'musicxml'
  /** What is in the file — "Piano · Bass · Drums" — for saying so. */
  readonly parts: readonly string[]
  /**
   * Whether the parts were actually read from the file.
   *
   * False for a song stored before they were, where every note had to be taken
   * as piano because nothing survives to say otherwise. It matters because the
   * wrong answer is audible: a drum track read as piano plays a kick and a
   * snare as two low notes on the keys.
   */
  readonly partsKnown: boolean
  /** True when the hands were inferred rather than read from the file. */
  readonly handsInferred: boolean
  /** The key, read from the file or estimated from the notes. */
  readonly key: DetectedKey | null
  /** True when at least one note carries a fingering from the score. */
  readonly hasFingering: boolean
}

export function songDuration(notes: readonly SongNote[]): number {
  return notes.reduce((end, note) => Math.max(end, note.startMs + note.durationMs), 0)
}

/**
 * Assembles the parsed pieces into a song.
 *
 * The measure grid is derived rather than stored per note: a bar is a number of
 * beats at a tempo, and every loop, count-in and bar number in the app reads it
 * from here so they cannot disagree.
 */
export function buildSong(input: {
  id: string
  title: string
  bpm: number
  beatsPerMeasure: number
  notes: SongNote[]
  source: Song['source']
  handsInferred: boolean
  parts?: readonly string[]
  partsKnown?: boolean
  key?: DetectedKey | null
}): Song {
  const bpm = input.bpm > 0 ? input.bpm : 100
  const beatsPerMeasure = input.beatsPerMeasure > 0 ? input.beatsPerMeasure : 4
  const measureMs = (60000 / bpm) * beatsPerMeasure
  const notes = [...input.notes].sort((a, b) => a.startMs - b.startMs || a.note - b.note)
  const durationMs = songDuration(notes)

  return {
    ...input,
    bpm,
    beatsPerMeasure,
    notes,
    durationMs,
    measureMs,
    measureCount: Math.max(1, Math.ceil(durationMs / measureMs)),
    parts: input.parts ?? [],
    // Anything built here came from a file we just read, so the parts are known
    // unless a caller says otherwise.
    partsKnown: input.partsKnown ?? true,
    // Every defaulted field goes *after* the spread. Before it, a caller
    // passing an explicit null — which importMidi does when a file declares no
    // key — overwrites the fallback with the very thing it was there to
    // replace, and the song comes out with no key at all.
    key: input.key ?? estimateKey(notes),
    hasFingering: notes.some((note) => note.finger !== undefined),
  }
}

/** Splits by pitch when the file gave us nothing better. Middle C is the seam. */
export function inferHand(note: number): Hand {
  return note >= 60 ? 'right' : 'left'
}

export interface SongStep {
  /** Every note struck at this moment — one for a melody, several for a chord. */
  readonly notes: readonly SongNote[]
  readonly startMs: number
}

/**
 * Groups a song's keyboard part into the things a player actually plays.
 *
 * Notes within a few milliseconds of each other are one chord, not a fast run:
 * a MIDI file records a chord as several note-ons a millisecond or two apart,
 * because that is how it was played, and asking someone to reproduce that
 * spacing is asking the wrong thing.
 *
 * Only the part being learned is stepped. The band does not wait.
 */
export function songSteps(song: Song, hand: 'both' | Hand = 'both'): SongStep[] {
  const CHORD_WINDOW_MS = 60

  const playable = song.notes
    .filter((note) => note.role === 'keyboard' && (hand === 'both' || note.hand === hand))
    .sort((a, b) => a.startMs - b.startMs || a.note - b.note)

  const steps: SongStep[] = []
  for (const note of playable) {
    const last = steps.at(-1)
    if (last && note.startMs - last.startMs <= CHORD_WINDOW_MS) {
      ;(last.notes as SongNote[]).push(note)
    } else {
      steps.push({ notes: [note], startMs: note.startMs })
    }
  }
  return steps
}
