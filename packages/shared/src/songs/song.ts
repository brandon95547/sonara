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
import type { NoteValue } from '../music/notation.js'
import type { Spelling } from '../music/pitch.js'
import { withInferredHands } from './hand-assignment.js'
import type { PartRole } from './general-midi.js'
import { estimateKey, type DetectedKey } from './key-of.js'
import { gridMeasures, quartersPerBar, type SongMeasure } from './meter.js'
export type { Hand }

/**
 * How a note is written in the score it came from.
 *
 * A tied pair is one note here, so this is the value of its first written
 * segment; the engraver splits a held note across bar lines for itself. A
 * tuplet carries its ratio and an id shared by every note under the same
 * bracket, so the bracket can be drawn once over all of them.
 */
export interface WrittenNote {
  readonly value: NoteValue
  readonly dots: number
  readonly tuplet?: { readonly id: number; readonly actual: number; readonly normal: number }
}

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
  /** The dynamic marking in force — `mf`, `ff` — when the score gives one. */
  readonly dynamic?: string
  /**
   * Part of a chord too wide for the hand to close on at once.
   *
   * Such a chord is fingered exactly as a held one, because the fingers still
   * go where they go — what differs is that they arrive in sequence, from the
   * outer note inwards. Without this the app asks for a grip no hand can make
   * and waits for it, which is the difference between a hard passage and an
   * impossible one.
   */
  readonly rolled?: boolean
  /**
   * The letter and accidental the note is written with.
   *
   * A score always says — MusicXML as step and alter, MuseScore as a tonal
   * pitch class — and the staff must draw what the score says: a B♭ is a B
   * with a flat, not an A with a sharp. For a MIDI file it is worked out from
   * the key on import. Absent only on songs stored before it was read.
   */
  readonly spelling?: Spelling
  /** Where it begins in crotchets from the start of the piece. */
  readonly startQ?: number
  /** How long it lasts in crotchets — its written length, tempo aside. */
  readonly durationQ?: number
  /** Its written value, where a score gave one. */
  readonly written?: WrittenNote
  /**
   * A grace note: struck just before the beat it decorates, taking no time
   * of its own. Drawn small, and never asked for as a step of its own.
   */
  readonly grace?: boolean
}

/** A stretch of sustain pedal, as the score marks it. */
export interface PedalSpan {
  readonly startMs: number
  readonly endMs: number
}

/**
 * What the source file actually contained.
 *
 * Every format loses something different, and the player has no way to tell
 * which. MIDI cannot record fingering at all; a MusicXML export may or may not
 * carry dynamics; a hand-made file may have no pedal marks. Saying which is
 * present is the difference between "this piece has no pedalling" and "this
 * file did not say".
 */
export interface SongProvides {
  readonly notes: boolean
  readonly rhythm: boolean
  readonly staves: boolean
  readonly dynamics: boolean
  readonly pedal: boolean
  readonly fingering: boolean
}

export interface Song {
  readonly id: string
  readonly title: string
  /** The tempo the file declares. Playback scales from this. */
  readonly bpm: number
  /**
   * Beats per bar, counted in crotchets, which is what the timing maths wants.
   *
   * Not what to print. A bar of 7/8 is three and a half crotchets, and printing
   * that gives `3.5/4` — a time signature no music has ever been written in.
   */
  readonly beatsPerMeasure: number
  /** The signature as written, for the page rather than for the clock. */
  readonly timeSignature: { readonly beats: number; readonly beatType: number }
  readonly notes: readonly SongNote[]
  readonly durationMs: number
  /**
   * The length of an ordinary bar at the opening tempo.
   *
   * A convenience for the controls that step by a bar. The bars themselves
   * are the list below, and anything that needs to know *which* bar reads
   * that — a pickup, a change of metre or a ritardando makes this number
   * wrong for every bar after it.
   */
  readonly measureMs: number
  readonly measureCount: number
  /** Every bar, with its start, its length, its metre and its tempo. */
  readonly measures: readonly SongMeasure[]
  readonly source: 'midi' | 'musicxml' | 'musescore'
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
  /** True when at least one note carries a fingering, from wherever. */
  readonly hasFingering: boolean
  /**
   * Where that fingering came from.
   *
   * `score` means somebody wrote it in the file. `derived` means Sonara worked
   * it out, which is a weaker claim and has to be shown as one — a suggested
   * finger drawn as though the score asked for it is worse than no finger.
   */
  readonly fingeringSource?: 'score' | 'derived'
  /** Sustain pedal, where the score marks it. */
  readonly pedal: readonly PedalSpan[]
  /** What the source gave us, so the UI can say what it did not. */
  readonly provides: SongProvides
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
/**
 * One key, one press.
 *
 * A file can hold the same pitch twice at the same instant — two voices written
 * on one staff, an arranger doubling a line, a sequencer exporting a part
 * twice. It is not playable as written: a hand cannot strike one key twice at
 * once, and read literally every doubled note turns a melody into a two-note
 * chord. Which is exactly what it did — 441 of one file's 1,178 piano notes
 * were duplicates, and the fingering that followed declined most of the song as
 * chords that were not there.
 *
 * The survivor keeps the longest duration and the strongest velocity, so
 * nothing about how it sounds is lost.
 */
function collapseUnisons(notes: readonly SongNote[]): SongNote[] {
  const kept = new Map<string, SongNote>()
  for (const note of notes) {
    const key = `${note.note}@${Math.round(note.startMs)}@${note.hand}@${note.role}`
    const existing = kept.get(key)
    if (!existing) {
      kept.set(key, note)
      continue
    }
    kept.set(key, {
      ...existing,
      durationMs: Math.max(existing.durationMs, note.durationMs),
      velocity: Math.max(existing.velocity, note.velocity),
      finger: existing.finger ?? note.finger,
    })
  }
  return [...kept.values()].sort((a, b) => a.startMs - b.startMs || a.note - b.note)
}

export function buildSong(input: {
  id: string
  title: string
  bpm: number
  beatsPerMeasure: number
  timeSignature?: { beats: number; beatType: number }
  notes: SongNote[]
  source: Song['source']
  handsInferred: boolean
  parts?: readonly string[]
  partsKnown?: boolean
  key?: DetectedKey | null
  pedal?: readonly PedalSpan[]
  /** True when the file states rhythm and staves, rather than us inferring them. */
  rhythmFromScore?: boolean
  /** The bars as the file laid them out. Without them, one tempo and one metre. */
  measures?: readonly SongMeasure[]
}): Song {
  const bpm = input.bpm > 0 ? input.bpm : 100
  const beatsPerMeasure = input.beatsPerMeasure > 0 ? input.beatsPerMeasure : 4
  // Where the file named the staff or separated the tracks, its answer stands.
  // Where it did not, the hands are worked out from the music rather than from
  // each note's pitch on its own — see `hand-assignment.ts` for why that
  // distinction is not a detail.
  const collapsed = collapseUnisons(input.notes)
  const notes = input.handsInferred ? withInferredHands(collapsed) : collapsed
  const durationMs = songDuration(notes)
  // A file that never said keeps the reading everything else assumes.
  const timeSignature = input.timeSignature ?? {
    beats: Math.round(beatsPerMeasure) || 4,
    beatType: 4,
  }
  const measures =
    input.measures && input.measures.length > 0
      ? input.measures
      : gridMeasures({
          bpm,
          beats: timeSignature.beats,
          beatType: timeSignature.beatType,
          durationMs,
        })

  return {
    ...input,
    bpm,
    beatsPerMeasure,
    timeSignature,
    notes: withQuarters(notes, measures),
    durationMs,
    measureMs: quartersPerBar(timeSignature.beats, timeSignature.beatType) * (60000 / bpm),
    measureCount: measures.length,
    measures,
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
    ...(notes.some((note) => note.finger !== undefined)
      ? { fingeringSource: 'score' as const }
      : {}),
    pedal: input.pedal ?? [],
    provides: {
      notes: notes.length > 0,
      // MIDI records when a note started, not what it is written as. That is
      // enough to play and not enough to engrave, so it counts as rhythm only
      // when a score said so.
      rhythm: input.rhythmFromScore ?? false,
      staves: !input.handsInferred,
      dynamics: notes.some((note) => note.dynamic !== undefined),
      pedal: (input.pedal?.length ?? 0) > 0,
      fingering: notes.some((note) => note.finger !== undefined),
    },
  }
}

/**
 * Gives every note its place in crotchets, where the importer did not.
 *
 * A score states its rhythm and its importer writes `startQ` itself. A MIDI
 * file states time, and the bars — which carry the tempo in force — turn
 * that time back into crotchets, so the engraver reads one thing whatever
 * the file was. A song stored before bars were read gets the same treatment
 * from its grid.
 */
function withQuarters(notes: readonly SongNote[], measures: readonly SongMeasure[]): SongNote[] {
  const toQ = (ms: number): number => {
    let bar = measures[0]!
    for (const candidate of measures) {
      if (candidate.startMs <= ms + 1e-6) bar = candidate
      else break
    }
    return bar.startQ + (ms - bar.startMs) / bar.quarterMs
  }
  return notes.map((note) => {
    if (note.startQ !== undefined && note.durationQ !== undefined) return note
    const startQ = toQ(note.startMs)
    const endQ = toQ(note.startMs + note.durationMs)
    return { ...note, startQ, durationQ: Math.max(0, endQ - startQ) }
  })
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
