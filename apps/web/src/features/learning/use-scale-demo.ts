import * as React from 'react'
import { useAudio } from '@/audio/AudioProvider'
import { keyboardActions } from '@/state/keyboard-store'
import { learningActions, useLearningStore } from '@/state/learning-store'

/**
 * Plays the current exercise back, so you can hear the scale before you try it.
 *
 * ## Why this does not use the practice tempo
 *
 * `targetBpm` is what the player is aiming at, and auto-tempo pushes it as high
 * as 208. A demonstration at that speed is a blur, and the one thing a
 * demonstration has to be is followable — so this runs at its own fixed,
 * unhurried tempo and never reads the target.
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
 * Deliberately slow — a shade under one note a second.
 *
 * Fast enough to hear the shape of the scale as a phrase rather than a list,
 * slow enough that a beginner can find the next key while it is still sounding.
 */
const DEMO_BPM = 66
const STEP_MS = Math.round(60_000 / DEMO_BPM)

/**
 * Each note lifts a little before the next lands. A scale held fully legato
 * turns a repeated note into one long note, which hides a step of the scale.
 */
const HOLD_MS = Math.round(STEP_MS * 0.82)

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

  const indexRef = React.useRef(0)
  // The authoritative status. React state is for rendering; the timer chain
  // reads this, because a scheduled tick cannot wait for a re-render to know
  // whether it has been paused.
  const statusRef = React.useRef<DemoStatus>('idle')
  const timersRef = React.useRef<number[]>([])
  const soundingRef = React.useRef<readonly number[]>([])

  const clearTimers = React.useCallback(() => {
    for (const id of timersRef.current) window.clearTimeout(id)
    timersRef.current = []
  }, [])

  /** Releases whatever the demo is currently holding, and nothing else. */
  const silence = React.useCallback(() => {
    for (const note of soundingRef.current) {
      audioRef.current.noteOff(note)
      keyboardActions.noteOff(note)
    }
    soundingRef.current = []
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
    for (const note of step.notes) {
      keyboardActions.noteOn(note, DEMO_VELOCITY, 'pointer')
      audioRef.current.noteOn(note, DEMO_VELOCITY)
    }
    soundingRef.current = step.notes

    timersRef.current.push(window.setTimeout(silence, HOLD_MS))
    timersRef.current.push(window.setTimeout(() => playFrom.current(index + 1), STEP_MS))
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
    playFrom.current(indexRef.current)
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
