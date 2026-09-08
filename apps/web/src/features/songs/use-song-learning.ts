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
  const setWrongNotes = useSongStore((state) => state.setWrongNotes)
  const wrongNotes = useSongStore((state) => state.wrongNotes)

  const steps = React.useMemo<SongStep[]>(
    () => (song && mode === 'learn' ? songSteps(song, part) : []),
    [song, mode, part],
  )

  React.useEffect(() => setStepCount(steps.length), [steps, setStepCount])

  // Flatten the step to what the hand card needs, so it can live anywhere.
  // Every note of it, low to high: a chord is a hand shape, and one finger out
  // of three is not one.
  React.useEffect(() => {
    const notes = [...(steps[stepIndex]?.notes ?? [])].sort((a, b) => a.note - b.note)
    setCurrent(
      notes.flatMap((note) =>
        note.finger === undefined ? [] : [{ finger: note.finger, hand: note.hand }],
      ),
    )
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
        annotations[note.note] = {
          role: ahead === 0 ? 'target' : 'upcoming',
          // Carry the finger through. Without it the keyboard has nothing to
          // draw when Key Labels is set to Fingers, however well the song is
          // fingered — which is exactly how it behaved.
          ...(note.finger !== undefined ? { finger: note.finger } : {}),
        }
      }
    })
    // A wrong note outranks whatever the step wanted that key for. It is the
    // one thing on the keybed that is about what you did rather than what to
    // do next, and it has to be visible over the top of the instruction.
    for (const note of wrongNotes) annotations[note] = { role: 'wrong' }

    setSongAnnotations(annotations)
  }, [song, mode, steps, stepIndex, wrongNotes, setSongAnnotations])

  /**
   * Advancing.
   *
   * Subscribed to the keyboard rather than given a callback, because a note can
   * arrive from MIDI, a mouse or a touch, and all three end up here. A step is
   * done when every note in it has been held at the same time — which is what
   * playing a chord means.
   *
   * Except where it cannot be. A chord wider than the hand is spread rather
   * than struck: its notes arrive one after another and need never overlap, so
   * holding out for all of them at once is holding out for something no hand
   * can do. Those steps are satisfied by every note being played during the
   * step instead, in whatever order the player rolls it.
   */
  React.useEffect(() => {
    if (!learning || mode !== 'learn' || steps.length === 0) {
      setWrongNotes([])
      return
    }

    // What was already down last time, so a wrong note is one that is *pressed*
    // while the step is current rather than one merely still held. Without the
    // distinction, a note carried over from the step just finished lights up
    // red for having been right a moment ago.
    let held = new Set(Object.keys(useKeyboardStore.getState().active).map(Number))
    let wrong = new Set<number>()
    // Which of this step's notes have been played since it became current.
    // Only a spread chord is judged on this; everything else still has to be
    // held together.
    let reached = new Set<number>()
    let onStep = useSongStore.getState().stepIndex

    return useKeyboardStore.subscribe((state) => {
      const current = useSongStore.getState().stepIndex
      const step = steps[current]
      if (!step) return
      if (current !== onStep) {
        onStep = current
        reached = new Set()
      }

      const down = new Set(Object.keys(state.active).map(Number))
      const wanted = new Set(step.notes.map((note) => note.note))
      for (const note of down) if (!held.has(note) && !wanted.has(note)) wrong.add(note)
      for (const note of down) if (wanted.has(note)) reached.add(note)
      // Letting go of a wrong note takes the mark off it.
      wrong = new Set([...wrong].filter((note) => down.has(note)))
      held = down
      setWrongNotes([...wrong].sort((a, b) => a - b))

      const spread = step.notes.some((note) => note.rolled)
      const done = spread
        ? step.notes.every((note) => reached.has(note.note))
        : step.notes.every((note) => down.has(note.note))

      if (done) {
        // A finished step clears the slate: the next one is a new question.
        wrong = new Set()
        reached = new Set()
        setWrongNotes([])
        if (current + 1 >= steps.length) resetLearning()
        else advance(1)
      }
    })
  }, [learning, mode, steps, advance, resetLearning, setWrongNotes])

  return {
    steps,
    stepIndex,
    /** Null until Learn has something to be on. */
    current: mode === 'learn' ? (steps[stepIndex] ?? null) : null,
  }
}
