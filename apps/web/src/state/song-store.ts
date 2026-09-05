import { create } from 'zustand'
import type { Hand, Song } from '@sonara/shared'

/**
 * The songs a player has imported, and how they are practising the one that is
 * open.
 *
 * The library persists; the playback settings do not survive a reload on
 * purpose. A loop set on bars 12-16 and a tempo of 50% are things you set up to
 * work on a passage for ten minutes, not preferences — coming back tomorrow to
 * a song that silently plays half speed between two arbitrary bars is a bug
 * report, not a feature.
 */

export type SongPart = 'both' | Hand

export interface LoopRange {
  /** 1-based, inclusive. The numbers a player reads off a score. */
  readonly from: number
  readonly to: number
}

interface SongState {
  library: Song[]
  currentId: string | null
  playing: boolean
  /** Where the playhead is, in song milliseconds. */
  positionMs: number
  part: SongPart
  /** 0.5, 0.75, 1 — or anything the custom field is set to. */
  tempoScale: number
  loop: LoopRange | null
  metronome: boolean

  add: (song: Song) => void
  open: (id: string) => void
  remove: (id: string) => void
  setPlaying: (playing: boolean) => void
  seek: (positionMs: number) => void
  setPart: (part: SongPart) => void
  setTempoScale: (scale: number) => void
  setLoop: (loop: LoopRange | null) => void
  setMetronome: (on: boolean) => void
}

const STORAGE_KEY = 'sonara.songs.v1'

/**
 * Brings a stored song up to the current shape.
 *
 * The library outlives the code that wrote it. A song imported before parts
 * and roles existed has neither, and the difference is not cosmetic: a note
 * with no role is neither the part being learned nor percussion, so it would
 * sound while lighting no keys at all — a song that plays and a keyboard that
 * never moves, with nothing on screen to say why.
 *
 * Everything in those files came from the piano path, so that is what they are
 * read as.
 */
function migrate(song: Song): Song {
  const known = (song.notes?.length ?? 0) > 0 && song.notes.every((note) => Boolean(note.role))
  const notes = song.notes?.map((note) =>
    note.role ? note : { ...note, role: 'keyboard' as const },
  )
  return {
    ...song,
    notes: notes ?? [],
    parts: song.parts ?? ['Piano'],
    // Reading a drum track as piano is not a small inaccuracy — a kick and a
    // snare become two low notes on the keys. Nothing in a stored note says
    // which channel it came from, so it cannot be recovered here. It is
    // flagged instead, and the library says to import the file again.
    partsKnown: song.partsKnown ?? known,
  }
}

function load(): Song[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    // A song missing the fields everything downstream indexes into is dropped
    // rather than migrated into something half-real.
    return (parsed as Song[])
      .filter((song) => song && typeof song.id === 'string' && Array.isArray(song.notes))
      .map(migrate)
  } catch {
    // A corrupt or unavailable store is an empty library, not a broken app.
    return []
  }
}

function save(library: readonly Song[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(library))
  } catch {
    // Private browsing, or a library past the quota. The songs stay in memory
    // for this session, which is better than refusing the import.
  }
}

export const useSongStore = create<SongState>((set) => ({
  library: typeof window === 'undefined' ? [] : load(),
  currentId: null,
  playing: false,
  positionMs: 0,
  part: 'both',
  tempoScale: 1,
  loop: null,
  metronome: false,

  add: (song) =>
    set((state) => {
      const library = [song, ...state.library]
      save(library)
      // A freshly imported song is the one you want open.
      return { library, currentId: song.id, positionMs: 0, playing: false, loop: null }
    }),

  open: (currentId) => set({ currentId, positionMs: 0, playing: false, loop: null }),

  remove: (id) =>
    set((state) => {
      const library = state.library.filter((song) => song.id !== id)
      save(library)
      return {
        library,
        ...(state.currentId === id ? { currentId: null, playing: false, positionMs: 0 } : {}),
      }
    }),

  setPlaying: (playing) => set({ playing }),
  seek: (positionMs) => set({ positionMs: Math.max(0, positionMs) }),
  setPart: (part) => set({ part }),
  setTempoScale: (tempoScale) => set({ tempoScale: Math.min(2, Math.max(0.25, tempoScale)) }),
  setLoop: (loop) => set({ loop }),
  setMetronome: (metronome) => set({ metronome }),
}))

/** The open song, or null. */
export function useCurrentSong(): Song | null {
  return useSongStore((state) => state.library.find((song) => song.id === state.currentId) ?? null)
}
