import * as React from 'react'
import { stepBeats, type ExerciseStep } from '@sonara/shared'
import { useAudio } from '@/audio/AudioProvider'
import { keyboardActions } from '@/state/keyboard-store'
import { learningActions, useLearningStore } from '@/state/learning-store'

/**
 * Plays the current exercise back, so you can hear the scale before you try it.
 *
 * ## It plays at the practice tempo
 *
 * A beat is a beat at `targetBpm` — the same pulse the metronome clicks and the
 * same unit the run is measured in, so what you hear is what you are about to
 * be asked for. Each step lasts as long as it is written: a beat for a plain
 * scale, a quarter of one for a scale in semiquavers, and a chord held under a
 * melody stays down while the melody moves.
 *
 * A tempo change is picked up at the next note rather than restarting the
 * scale, so dragging the slider while it plays speeds it up under your hand.
 *
 * ## It keeps time
 *
 * Each step is due a fixed time after the last one was *due*, not after it was
 * played. A chain of timers each started when the one before fired is late by
 * however late every one of them was, added up — unnoticeable over fifteen
 * crotchets, and a visible drift against the click over sixty semiquavers.
 * With the click on, the two also start together: the pulse is re-anchored as
 * the demonstration begins, so its first note is the click's first beat.
 *
 * ## What it does and does not tell the learning store
 *
 * It reports where the playback head is, so the guidance can light the same
 * target, finger and cue it would light if the player were there — watching a
 * demonstration that does not say which finger is playing teaches the tune and
 * not the hand.
 *
 * It does not report the notes as played. Routing them through
 * `learningActions.noteOn` would let the app mark its own demonstration as a
 * flawless run by the player.
 */

/**
 * Each note lifts a little before the next lands. A scale held fully legato
 * turns a repeated note into one long note, which hides a step of the scale.
 */
const HOLD_RATIO = 0.82

/** Staccato: each note let go well before the next, so the hand is heard to lift. */
const STACCATO_HOLD_RATIO = 0.4

/** How long one beat lasts at the tempo set right now. */
function beatMs(): number {
  return 60_000 / Math.max(1, useLearningStore.getState().targetBpm)
}

/**
 * How far ahead the click schedules its first beat after it is re-anchored
 * (see `useMetronome`). The demonstration waits the same, so they land together.
 */
const CLICK_LEAD_MS = 50

/** A step's notes, each once, with how long it is held in beats. */
function soundingOf(step: ExerciseStep): [note: number, beats: number][] {
  const held = new Map<number, number>()
  step.notes.forEach((note, index) => {
    // Two hands on one key — the first note of a scale in contrary motion —
    // is one key going down once.
    const beats = step.holds?.[index] ?? stepBeats(step)
    held.set(note, Math.max(held.get(note) ?? 0, beats))
  })
  return [...held]
}

/** An even mezzo-forte. A demonstration should not also be an interpretation. */
const DEMO_VELOCITY = 80

export type DemoStatus = 'idle' | 'playing' | 'paused'

export interface ScaleDemo {
  status: DemoStatus
  /** The step currently sounding — for anything that wants to follow along. */
  stepIndex: number
  /** Play, or pause where it stands. Resumes from the note it stopped on. */
  toggle: () => void
  stop: () => void
  /** False when the topic has no exercise to play. */
  available: boolean
}

export function useScaleDemo(): ScaleDemo {
  const exercise = useLearningStore((state) => state.exercise)
  const audio = useAudio()

  const [status, setStatus] = React.useState<DemoStatus>('idle')
  const [stepIndex, setStepIndex] = React.useState(0)

  // Read through refs on the timer path: a demo tick must not depend on having
  // re-rendered with the latest audio api first.
  const audioRef = React.useRef(audio)
  audioRef.current = audio
  const stepsRef = React.useRef(exercise?.steps ?? [])
  stepsRef.current = exercise?.steps ?? []
  const holdRef = React.useRef(HOLD_RATIO)
  holdRef.current = exercise?.staccato ? STACCATO_HOLD_RATIO : HOLD_RATIO

  const indexRef = React.useRef(0)
  // The authoritative status. React state is for rendering; the timer chain
  // reads this, because a scheduled tick cannot wait for a re-render to know
  // whether it has been paused.
  const statusRef = React.useRef<DemoStatus>('idle')
  /** The timer that plays the next step. One, because there is one playback head. */
  const advanceRef = React.useRef<number | null>(null)
  /**
   * What the demo is holding, and the timer that lets each note go.
   *
   * Per note rather than per step, because a step's notes do not all end
   * together: a chord under a melody is still down three steps later.
   */
  const soundingRef = React.useRef(new Map<number, number>())
  /** When the step now sounding was due, on the wall clock. */
  const dueRef = React.useRef(0)

  const release = React.useCallback((note: number) => {
    const timer = soundingRef.current.get(note)
    if (timer === undefined) return
    window.clearTimeout(timer)
    soundingRef.current.delete(note)
    audioRef.current.noteOff(note)
    keyboardActions.noteOff(note)
  }, [])

  /** Releases whatever the demo is currently holding, and nothing else. */
  const silence = React.useCallback(() => {
    for (const note of [...soundingRef.current.keys()]) release(note)
  }, [release])

  const clearTimers = React.useCallback(() => {
    if (advanceRef.current !== null) window.clearTimeout(advanceRef.current)
    advanceRef.current = null
  }, [])

  const stop = React.useCallback(() => {
    clearTimers()
    silence()
    indexRef.current = 0
    statusRef.current = 'idle'
    setStepIndex(0)
    setStatus('idle')
    learningActions.setDemoStep(null)
  }, [clearTimers, silence])

  // Held in a ref so each step can schedule the next without the callback
  // having to close over itself.
  const playFrom = React.useRef<(index: number) => void>(() => {})
  playFrom.current = (index: number) => {
    // Cancel rather than forget: dropping the ids would leave an orphaned
    // chain running that nothing can ever stop.
    clearTimers()
    if (statusRef.current !== 'playing') return
    const steps = stepsRef.current
    if (index >= steps.length) {
      stop()
      return
    }

    indexRef.current = index
    setStepIndex(index)
    learningActions.setDemoStep(index)

    const step = steps[index]!
    // Read from the store here, not from a render: a scheduled tick must not
    // depend on having re-rendered with the latest tempo first.
    const beat = beatMs()
    for (const [note, beats] of soundingOf(step)) {
      // A note still held from an earlier step is struck again, not left ringing.
      release(note)
      keyboardActions.noteOn(note, DEMO_VELOCITY, 'pointer')
      audioRef.current.noteOn(note, DEMO_VELOCITY)
      soundingRef.current.set(
        note,
        window.setTimeout(() => release(note), beats * beat * holdRef.current),
      )
    }

    // Due from when this step was due, so lateness does not accumulate.
    dueRef.current += stepBeats(step) * beat
    advanceRef.current = window.setTimeout(
      () => playFrom.current(index + 1),
      Math.max(0, dueRef.current - Date.now()),
    )
  }

  const toggle = React.useCallback(() => {
    // Not a `setStatus` updater: StrictMode invokes those twice to prove they
    // are pure, and starting playback from inside one schedules the scale
    // twice over — two chains racing, one of them untracked and unstoppable.
    if (statusRef.current === 'playing') {
      clearTimers()
      silence()
      statusRef.current = 'paused'
      setStatus('paused')
      return
    }
    if (stepsRef.current.length === 0) return
    statusRef.current = 'playing'
    setStatus('playing')
    // With the click on, start it again from beat one and come in with it.
    const lead = useLearningStore.getState().metronome ? CLICK_LEAD_MS : 0
    if (lead > 0) learningActions.syncPulse()
    dueRef.current = Date.now() + lead
    if (lead === 0) playFrom.current(indexRef.current)
    else advanceRef.current = window.setTimeout(() => playFrom.current(indexRef.current), lead)
  }, [clearTimers, silence])

  // A different scale is a different demonstration: anything still in flight is
  // about the one that is no longer selected. `exercise` is rebuilt on every
  // spec and mode change, so this covers all of them.
  React.useEffect(() => stop, [exercise, stop])

  // Start takes over. The button is disabled for the length of a run, but the
  // run can begin while a demonstration is already playing, and two playback
  // heads on one keyboard is one too many.
  const running = useLearningStore((state) => state.session.status === 'running')
  React.useEffect(() => {
    if (running) stop()
  }, [running, stop])

  return {
    status,
    stepIndex,
    toggle,
    stop,
    available: (exercise?.steps.length ?? 0) > 0,
  }
}
