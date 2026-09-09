import { create } from 'zustand'
import { gridMeasures, type Hand, type Song } from '@sonara/shared'

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

/**
 * How the song is being worked on.
 *
 * Explore plays it to you; Learn waits for you. The same two words the scale
 * screen uses, meaning the same two things, because a player who has learned
 * what they mean there should not have to learn it twice.
 */
export type SongMode = 'explore' | 'learn'

/**
 * How the score is laid out.
 *
 * `flow` runs one endless system past a fixed playhead — Sonara's guided
 * reading, where the music moves and your place in it does not. `sheet` prints
 * it as lines and stacks them, holding still while you read across, which is
 * what someone who can already read needs and what a learner does not.
 */
export type StaffView = 'sheet' | 'flow'

interface SongState {
  library: Song[]
  currentId: string | null
  playing: boolean
  /** Where the playhead is, in song milliseconds. */
  positionMs: number
  part: SongPart
  /** 0.5, 0.75, 1 — or anything the custom field is set to. */
  tempoScale: number
  metronome: boolean
  mode: SongMode
  /** Which way the score is written out. */
  staffView: StaffView
  /**
   * How much fingering the staff prints.
   *
   * A derived fingering knows a number for every note, and how many of them a
   * reader wants is a fact about the reader, not about the music: sight-reading
   * wants almost none, learning a passage wants all of it. Guessing it from the
   * notes means guessing at the person, so it is asked rather than inferred.
   */
  fingering: FingeringDensity
  /** Which step of the song the player is on, in Learn. */
  stepIndex: number
  /** True once Start has been pressed, until the song is finished or reset. */
  learning: boolean
  /** How many steps the song's keyboard part has, for the progress bar. */
  stepCount: number
  /**
   * The note the player is on, flattened to what the hand card needs.
   *
   * Kept here rather than threaded through props so the card can sit anywhere
   * on the page without the control row having to hand it down.
   */
  /**
   * What the step under the player's hands is, flattened for the hand card.
   *
   * A list, not one finger: a chord is played with several, and a step can
   * reach across both hands. Showing the first of them answers the wrong
   * question for every chord in a song.
   */
  currentFingers: readonly { finger: number; hand: Hand }[]
  /**
   * Notes pressed that the step did not ask for, so the keyboard can say so.
   *
   * Scales have always shown a wrong note in red and songs have not, which
   * made the same mode behave two ways depending on which tab you were in.
   */
  wrongNotes: readonly number[]

  add: (song: Song) => void
  open: (id: string) => void
  remove: (id: string) => void
  setPlaying: (playing: boolean) => void
  seek: (positionMs: number) => void
  setPart: (part: SongPart) => void
  setTempoScale: (scale: number) => void
  setMetronome: (on: boolean) => void
  setMode: (mode: SongMode) => void
  setStaffView: (view: StaffView) => void
  setFingering: (density: FingeringDensity) => void
  startLearning: () => void
  resetLearning: () => void
  advance: (steps: number) => void
  setStepCount: (count: number) => void
  setCurrent: (fingers: readonly { finger: number; hand: Hand }[]) => void
  setWrongNotes: (notes: readonly number[]) => void
}

const STORAGE_KEY = 'sonara.songs.v1'
/**
 * Kept, unlike the playback settings.
 *
 * A loop and a tempo are things you set up to work on a passage for ten
 * minutes; coming back to them tomorrow is a bug report. Whether you read from
 * sheet music or from a moving staff is not a setting on a passage — it is a
 * fact about the person reading, and asking them again every session would be
 * asking them whether they can still read music.
 */
const VIEW_KEY = 'sonara.staff-view.v1'

/** Nothing in progress. */
const IDLE = { stepIndex: 0, learning: false } as const

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
  const timeSignature = song.timeSignature ?? {
    beats: Math.round(song.beatsPerMeasure) || 4,
    beatType: 4,
  }
  // A song stored before bars were read has one tempo and one metre to go
  // on, which is what it had before as well: the grid is the old behaviour,
  // kept for old songs. Importing the file again reads the real bars.
  const measures =
    song.measures && song.measures.length > 0
      ? song.measures
      : gridMeasures({
          bpm: song.bpm,
          beats: timeSignature.beats,
          beatType: timeSignature.beatType,
          durationMs: song.durationMs,
        })
  return {
    ...song,
    notes: notes ?? [],
    timeSignature,
    measures,
    measureCount: measures.length,
    chords: song.chords ?? [],
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

/**
 * `all` prints every finger. `hints` prints the ones a reader could not work
 * out — the start of a run, a change of grip, a leap. `off` prints none.
 *
 * `hints` thins a scale from eight numbers to two and a rag from a thousand to
 * eight hundred, which is worth knowing: on music that changes its grip every
 * beat the honest answer is that there is nothing to thin, and `off` is what
 * makes that page readable.
 */
export type FingeringDensity = 'all' | 'hints' | 'off'

const FINGERING_KEY = 'sonara.songs.fingering'

function loadFingering(): FingeringDensity {
  try {
    const stored = window.localStorage.getItem(FINGERING_KEY)
    return stored === 'all' || stored === 'off' ? stored : 'hints'
  } catch {
    return 'hints'
  }
}

function loadView(): StaffView {
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'sheet' ? 'sheet' : 'flow'
  } catch {
    return 'flow'
  }
}

export const useSongStore = create<SongState>((set) => ({
  library: typeof window === 'undefined' ? [] : load(),
  currentId: null,
  playing: false,
  positionMs: 0,
  part: 'both',
  tempoScale: 1,
  metronome: false,
  mode: 'explore',
  staffView: typeof window === 'undefined' ? 'flow' : loadView(),
  fingering: typeof window === 'undefined' ? 'hints' : loadFingering(),
  stepIndex: 0,
  learning: false,
  stepCount: 0,
  currentFingers: [],
  wrongNotes: [],

  add: (song) =>
    set((state) => {
      const library = [song, ...state.library]
      save(library)
      // A freshly imported song is the one you want open.
      return { library, currentId: song.id, positionMs: 0, playing: false, ...IDLE }
    }),

  open: (currentId) => set({ currentId, positionMs: 0, playing: false, ...IDLE }),

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
  setMetronome: (metronome) => set({ metronome }),

  // Switching how you are working on the piece stops whatever the other way
  // was doing: playback should not carry on under a Start button.
  setMode: (mode) => set({ mode, playing: false, ...IDLE }),

  // Only how the same score is drawn, so nothing else moves: not the position,
  // not the tempo, not what has been learned. Switching views mid-piece has to
  // be free, or nobody will try the other one.
  setFingering: (fingering) =>
    set(() => {
      try {
        window.localStorage.setItem(FINGERING_KEY, fingering)
      } catch {
        // Private browsing. The choice holds for this session.
      }
      return { fingering }
    }),

  setStaffView: (staffView) =>
    set(() => {
      try {
        window.localStorage.setItem(VIEW_KEY, staffView)
      } catch {
        // Private browsing. The choice holds for this session.
      }
      return { staffView }
    }),

  startLearning: () => set({ learning: true, stepIndex: 0, playing: false }),
  resetLearning: () => set({ ...IDLE }),
  advance: (steps) => set((state) => ({ stepIndex: Math.max(0, state.stepIndex + steps) })),
  setStepCount: (stepCount) => set({ stepCount }),
  setCurrent: (currentFingers) => set({ currentFingers }),
  setWrongNotes: (wrongNotes) =>
    set((state) =>
      // Same notes, same array — this runs on every key event, and a fresh
      // array each time would re-render the whole keybed for nothing.
      state.wrongNotes.length === wrongNotes.length &&
      state.wrongNotes.every((note, i) => note === wrongNotes[i])
        ? state
        : { wrongNotes },
    ),
}))

/** The open song, or null. */
export function useCurrentSong(): Song | null {
  return useSongStore((state) => state.library.find((song) => song.id === state.currentId) ?? null)
}
