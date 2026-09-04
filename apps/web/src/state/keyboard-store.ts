import { create } from 'zustand'

/**
 * What is being held down, right now.
 *
 * This is the *visual* model of the performance and nothing else — no audio
 * lives here. It is a store rather than React state because MIDI arrives far
 * faster than a render: a trill is thirty events a second, and every one of
 * them must repaint one key, not the page.
 *
 * `active` is keyed by MIDI note and replaced immutably on every change, so a
 * key component subscribing with `(s) => s.active[note]` re-renders only when
 * its own note changes. Sixty keys on screen, one re-render per event.
 *
 * Sustained notes are deliberately NOT here. A sustained note is still
 * sounding but the finger is off the key, and a keyboard that lights a key
 * nobody is touching is lying about the performance. The pedal has its own
 * indicator instead.
 */

export type NoteSource = 'midi' | 'pointer'

export interface ActiveNote {
  readonly note: number
  /** 1-127, after the device's velocity curve has been applied. */
  readonly velocity: number
  readonly source: NoteSource
}

interface KeyboardState {
  active: Readonly<Record<number, ActiveNote | undefined>>
  sustain: boolean
  /** Rises on every note-on. Lets the keyboard follow the player without subscribing to `active`. */
  lastNote: ActiveNote | null
  noteOn: (note: number, velocity: number, source: NoteSource) => void
  noteOff: (note: number) => void
  setSustain: (down: boolean) => void
  panic: () => void
}

export const useKeyboardStore = create<KeyboardState>((set) => ({
  active: {},
  sustain: false,
  lastNote: null,

  noteOn: (note, velocity, source) =>
    set((state) => ({
      active: { ...state.active, [note]: { note, velocity, source } },
      lastNote: { note, velocity, source },
    })),

  noteOff: (note) =>
    set((state) => {
      if (!state.active[note]) return state
      const next = { ...state.active }
      delete next[note]
      return { active: next }
    }),

  setSustain: (down) => set({ sustain: down }),

  panic: () => set({ active: {}, sustain: false }),
}))

/** Read without subscribing — for hot paths and event handlers. */
export const keyboardActions = {
  noteOn: (note: number, velocity: number, source: NoteSource) =>
    useKeyboardStore.getState().noteOn(note, velocity, source),
  noteOff: (note: number) => useKeyboardStore.getState().noteOff(note),
  setSustain: (down: boolean) => useKeyboardStore.getState().setSustain(down),
  panic: () => useKeyboardStore.getState().panic(),
  isActive: (note: number) => Boolean(useKeyboardStore.getState().active[note]),
}
