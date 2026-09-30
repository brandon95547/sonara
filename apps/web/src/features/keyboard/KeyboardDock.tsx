import * as React from 'react'
import { noteName } from '@sonara/shared'
import { StatusDot } from '@/ui/Display'
import { useKeyboardStore } from '@/state/keyboard-store'
import { useLearningStore } from '@/state/learning-store'
import { AUTO_SPAN, useViewStore } from '@/state/view-store'
import { useCoarsePointer, useElementWidth } from '@/lib/hooks'
import { PianoKeyboard } from './PianoKeyboard'
import {
  chooseSpan,
  DEFAULT_SPAN,
  KEYBOARD_SPANS,
  windowForSpan,
  windowIncluding,
} from './keyboard-layout'

/**
 * The instrument, pinned along the bottom of the screen.
 *
 * Nothing but keys: every control that decides how the keyboard is looked at —
 * the visible span, octave shift, Follow, key labels — lives in the Settings
 * drawer, and the view they set lives in `useViewStore` so both can reach it.
 * What stays here is the work that has to happen wherever the keys are: sizing
 * the span to the width, re-centring on a new exercise, and following the
 * player and the note they have been asked for.
 *
 * The visible span is chosen from the container's width and the pointer type,
 * and the player can override it. Auto is the default because the right answer
 * genuinely changes — a phone cannot show 88 keys at a playable width, and a
 * 27-inch monitor should not show two octaves.
 */
export function KeyboardDock() {
  const coarse = useCoarsePointer()
  const [measureRef, width] = useElementWidth<HTMLElement>()

  const spanId = useViewStore((state) => state.spanId)
  const follow = useViewStore((state) => state.follow)
  const window = useViewStore((state) => state.window)
  const setWindow = useViewStore((state) => state.setWindow)
  const setAutoSpanLabel = useViewStore((state) => state.setAutoSpanLabel)
  const sustain = useKeyboardStore((state) => state.sustain)

  // Auto is capped at the default size, so the fallback before the container
  // has been measured is the same keyboard the player will end up with on any
  // ordinary screen — no resize flash from 88 keys down to 61.
  const autoSpan = React.useMemo(
    () => (width > 0 ? chooseSpan(width, coarse) : DEFAULT_SPAN),
    [width, coarse],
  )
  const span = React.useMemo(
    () =>
      spanId === AUTO_SPAN ? autoSpan : (KEYBOARD_SPANS.find((s) => s.id === spanId) ?? autoSpan),
    [spanId, autoSpan],
  )
  React.useEffect(() => setAutoSpanLabel(autoSpan.label), [autoSpan.label, setAutoSpanLabel])

  /**
   * Re-anchor when the span changes, or when a new exercise is loaded.
   *
   * A resize keeps the current low note, so it does not teleport the player to
   * the other end of the piano. A new exercise instead CENTRES the window on
   * the notes it covers — on a phone the window is two octaves of an
   * eighty-eight key piano, and an exercise placed merely "in view" opens with
   * its first note jammed against the right edge and the rest off screen.
   */
  const spanKey = span.id
  const exerciseId = useLearningStore((state) => state.exercise?.id ?? null)
  React.useEffect(() => {
    const exercise = useLearningStore.getState().exercise
    setWindow((current) => {
      if (!exercise || exercise.notes.length === 0) return windowForSpan(span, current.low)
      const middle = (Math.min(...exercise.notes) + Math.max(...exercise.notes)) / 2
      return windowForSpan(span, Math.round(middle - span.semitones / 2))
    })
    // `span` is a stable table entry; its id is what identifies a change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spanKey, exerciseId])

  // Follow the player. Whole-octave jumps, and only when the note is genuinely
  // outside the window — see `windowIncluding` for why not "scroll to fit".
  const lastNote = useKeyboardStore((state) => state.lastNote)
  React.useEffect(() => {
    if (!follow || !lastNote) return
    setWindow((current) => windowIncluding(current, lastNote.note))
  }, [follow, lastNote, setWindow])

  // And follow the note you have been ASKED to play, not only the one you did.
  // On a phone the visible window is two octaves of an eighty-eight key piano,
  // so an exercise starting outside it would open with its first note off
  // screen and stay there until the player guessed where to go.
  const targetNote = useLearningStore(
    (state) => state.exercise?.steps[state.session.stepIndex]?.notes[0] ?? null,
  )
  React.useEffect(() => {
    if (!follow || targetNote === null) return
    setWindow((current) => windowIncluding(current, targetNote))
  }, [follow, targetNote, setWindow])

  return (
    <section className="keyboard-dock" aria-label="Instrument" ref={measureRef}>
      <div className="piano-felt" aria-hidden />
      <PianoKeyboard window={window} />
      {/* The pedal is played, not set, so it is shown where it is felt — on the
          instrument — and only while it is down. A permanent "Pedal up" chip
          was a label for the normal state, which is no information at all. */}
      {sustain && (
        <span className="keyboard-dock__sustain" role="status">
          <StatusDot tone="accent" />
          Sustain
        </span>
      )}
      <TargetAnnouncement />
    </section>
  )
}

/**
 * The note you are being asked for, said out loud.
 *
 * Everything the app uses to ask for it is visual — a key washed in colour, a
 * numeral above it, a notehead on the staff — and none of it reaches a screen
 * reader, which had no way at all to tell what to play next. This is the same
 * instruction in the one form that does.
 *
 * Only in Learn: Explore lights a whole scale and Practice deliberately lights
 * nothing, and neither has a single next note to name. Polite, because it must
 * never cut across the note the player has just been told about, and one
 * sentence, because it is read at the pace of playing.
 */
function TargetAnnouncement() {
  const message = useLearningStore((state) => {
    if (state.mode !== 'learn') return ''
    const annotations = state.topic === 'songs' ? state.songAnnotations : state.annotations

    const targets = Object.entries(annotations)
      .filter(([, annotation]) => annotation.role === 'target')
      .map(([note, annotation]) => ({ note: Number(note), ...annotation }))
      .sort((a, b) => a.note - b.note)
    if (targets.length === 0) return ''

    // The spelled name where the material has one — E♭ rather than D♯ — with
    // the octave, which is what tells two of them apart.
    const named = targets.map((target) => {
      const name = target.label ?? noteName(target.note)
      return target.finger ? `${name}, finger ${target.finger}` : name
    })
    const cue = targets.find((target) => target.cue)?.cue
    return `Play ${named.join(', ')}.${cue ? ` ${cue}.` : ''}`
  })

  return (
    <p className="sr-only-ds" role="status" aria-live="polite">
      {message}
    </p>
  )
}
