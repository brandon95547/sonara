import * as React from 'react'
import { songSteps, type Song, type SongStep } from '@sonara/shared'
import { useLearningStore, type KeyAnnotation } from '@/state/learning-store'
import { useKeyboardStore } from '@/state/keyboard-store'
import { useSongStore } from '@/state/song-store'

/** How many steps ahead keep a marking, so the hand can see what is coming. */
const LOOKAHEAD = 4

/**
 * Learning a song: the keyboard shows what to play, and waits until you do.
 *
 * The same idea as the scale exercise, and deliberately the same on screen —
 * a target you are on, a few steps of warning after it, and nothing that moves
 * until you play the right thing. What it is not is a race: the song does not
 * play itself here, so a passage takes exactly as long as you take.
 *
 * Notes struck within a few milliseconds of each other in the file are one
 * chord, not a fast run, so a step can be several notes and is finished only
 * when all of them are down.
 */
export function useSongLearning(song: Song | null) {
  const mode = useSongStore((state) => state.mode)
  const part = useSongStore((state) => state.part)
  const learning = useSongStore((state) => state.learning)
  const stepIndex = useSongStore((state) => state.stepIndex)
  const advance = useSongStore((state) => state.advance)
  const resetLearning = useSongStore((state) => state.resetLearning)
  const setSongAnnotations = useLearningStore((state) => state.setSongAnnotations)
  const setStepCount = useSongStore((state) => state.setStepCount)
  const setCurrent = useSongStore((state) => state.setCurrent)

  const steps = React.useMemo<SongStep[]>(
    () => (song && mode === 'learn' ? songSteps(song, part) : []),
    [song, mode, part],
  )

  React.useEffect(() => setStepCount(steps.length), [steps, setStepCount])

  // Flatten the step to what the hand card needs, so it can live anywhere.
  React.useEffect(() => {
    const note = steps[stepIndex]?.notes[0]
    setCurrent(note?.finger ?? null, note?.hand ?? 'right')
  }, [steps, stepIndex, setCurrent])

  // What the keyboard shows. Rebuilt only when the step moves, not per frame.
  React.useEffect(() => {
    if (!song || mode !== 'learn') {
      setSongAnnotations({})
      return
    }

    const annotations: Record<number, KeyAnnotation> = {}
    steps.forEach((step, index) => {
      const ahead = index - stepIndex
      // Behind you the shape of the piece stays lit, without a marking: a
      // keyboard that empties out behind the player takes away the map.
      if (ahead < 0 || ahead > LOOKAHEAD) {
        for (const note of step.notes) annotations[note.note] ??= { role: 'scale' }
        return
      }
      for (const note of step.notes) {
        // A pitch played more than once in the next few steps keeps the
        // marking of its earliest remaining one — the one being headed for.
        // Letting a later step overwrite it turns the note you are on into
        // "upcoming", and nothing on the keyboard says where you are.
        const existing = annotations[note.note]
        if (existing && existing.role !== 'scale') continue
        annotations[note.note] = { role: ahead === 0 ? 'target' : 'upcoming' }
      }
    })
    setSongAnnotations(annotations)
  }, [song, mode, steps, stepIndex, setSongAnnotations])

  /**
   * Advancing.
   *
   * Subscribed to the keyboard rather than given a callback, because a note can
   * arrive from MIDI, a mouse or a touch, and all three end up here. A step is
   * done when every note in it has been held at the same time — which is what
   * playing a chord means.
   */
  React.useEffect(() => {
    if (!learning || mode !== 'learn' || steps.length === 0) return

    return useKeyboardStore.subscribe((state) => {
      const current = useSongStore.getState().stepIndex
      const step = steps[current]
      if (!step) return
      const down = new Set(Object.keys(state.active).map(Number))
      if (step.notes.every((note) => down.has(note.note))) {
        if (current + 1 >= steps.length) resetLearning()
        else advance(1)
      }
    })
  }, [learning, mode, steps, advance, resetLearning])

  return {
    steps,
    stepIndex,
    /** Null until Learn has something to be on. */
    current: mode === 'learn' ? (steps[stepIndex] ?? null) : null,
  }
}
