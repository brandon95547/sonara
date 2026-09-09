import { create } from 'zustand'
import {
  notesFromEvents,
  pedalFromEvents,
  type PedalEvent,
  type PedalSpan,
  type PerformanceEvent,
  type RecordedNote,
} from '@sonara/shared'

/**
 * Recording what gets played, and nothing else about it.
 *
 * The capture path is deliberately dumb: append an event, return. It runs on
 * every note-on and note-off, including a trill at thirty a second, so it does
 * no pairing, no sorting and no measuring — all of that happens once, when the
 * recording stops and something wants to write it out.
 *
 * Events are held in a ref-like array rather than in the store's state. Putting
 * them in state would publish a new array to every subscriber on every key
 * press, which is the one thing a hot path must not do.
 */

/**
 * `kept` is a finished take whose review has been closed without a decision.
 *
 * It exists because dismissing a dialog must not destroy anything. Escape and a
 * click on the scrim used to run `discard`, so a reflex keystroke threw away a
 * performance with no undo and no warning. Now they put the take down, and it
 * waits to be picked back up or explicitly discarded.
 */
export type RecordingStatus = 'idle' | 'counting' | 'recording' | 'review' | 'kept'

/** Seconds of warning before recording starts, so the first note is not lost. */
const COUNT_FROM = 3

interface RecordingState {
  status: RecordingStatus
  /** Seconds left on the count-in, while counting. */
  count: number
  /** Milliseconds captured, updated as it runs. */
  elapsedMs: number
  /** The finished performance, once stopped. */
  take: RecordedNote[]
  /** When the pedal was down during it. Part of the take, exported with it. */
  pedal: PedalSpan[]
  arm: () => void
  stop: () => void
  /** Puts the take down without deciding about it. Nothing is lost. */
  close: () => void
  /** Picks it back up. */
  review: () => void
  discard: () => void
}

let events: PerformanceEvent[] = []
let pedalEvents: PedalEvent[] = []
let startedAt = 0
let countTimer: number | undefined
let tickTimer: number | undefined

const clearTimers = () => {
  window.clearInterval(countTimer)
  window.clearInterval(tickTimer)
  countTimer = undefined
  tickTimer = undefined
}

export const useRecordingStore = create<RecordingState>((set, get) => ({
  status: 'idle',
  count: COUNT_FROM,
  elapsedMs: 0,
  take: [],
  pedal: [],

  arm: () => {
    clearTimers()
    events = []
    pedalEvents = []
    set({ status: 'counting', count: COUNT_FROM, elapsedMs: 0, take: [], pedal: [] })

    countTimer = window.setInterval(() => {
      const next = get().count - 1
      if (next > 0) {
        set({ count: next })
        return
      }
      window.clearInterval(countTimer)
      countTimer = undefined
      startedAt = performance.now()
      set({ status: 'recording', count: 0 })
      // A running clock, once a second: enough to show the length without
      // putting a timer on the same path as the notes.
      tickTimer = window.setInterval(() => set({ elapsedMs: performance.now() - startedAt }), 250)
    }, 1000)
  },

  stop: () => {
    const wasRecording = get().status === 'recording'
    clearTimers()
    if (!wasRecording) {
      set({ status: 'idle', count: COUNT_FROM, elapsedMs: 0 })
      return
    }
    const endMs = performance.now() - startedAt
    const take = notesFromEvents(events, endMs)
    const pedal = pedalFromEvents(pedalEvents, endMs)
    events = []
    pedalEvents = []
    // A take with nothing in it is not worth a dialog asking what to do with it.
    // Pedal without notes is not a take either — it is a foot resting on it.
    set(
      take.length > 0
        ? { status: 'review', take, pedal, elapsedMs: endMs }
        : { status: 'idle', elapsedMs: 0 },
    )
  },

  close: () => set((state) => (state.status === 'review' ? { status: 'kept' } : state)),

  review: () =>
    set((state) =>
      state.status === 'kept' && state.take.length > 0 ? { status: 'review' } : state,
    ),

  discard: () => {
    clearTimers()
    events = []
    pedalEvents = []
    set({ status: 'idle', count: COUNT_FROM, elapsedMs: 0, take: [], pedal: [] })
  },
}))

/**
 * The tap the keyboard calls on every note.
 *
 * Reads the status without subscribing, and does nothing at all unless a
 * recording is actually running.
 */
export const recordingActions = {
  capture: (note: number, velocity: number, on: boolean) => {
    if (useRecordingStore.getState().status !== 'recording') return
    events.push({ note, velocity, on, at: performance.now() - startedAt })
  },

  /**
   * The same tap for the pedal.
   *
   * A piano performance is the notes *and* the pedal, and the take used to keep
   * only the first half: play a piece pedalled and the exported MIDI came back
   * dry, with no sign anything was missing.
   */
  capturePedal: (down: boolean) => {
    if (useRecordingStore.getState().status !== 'recording') return
    pedalEvents.push({ down, at: performance.now() - startedAt })
  },
}
