import * as React from 'react'
import { clampVelocity, WRONG_NOTE_FLASH_MS } from '@sonara/shared'
import { useAudio } from '@/audio/AudioProvider'
import { keyboardActions, useKeyboardStore } from '@/state/keyboard-store'
import { learningActions, useLearningStore, type KeyRole } from '@/state/learning-store'
import { PianoKey } from './PianoKey'
import { buildLayout, type KeyboardLayout, type KeyboardWindow } from './keyboard-layout'

/**
 * The keybed.
 *
 * ## Pointer handling
 *
 * Three things a virtual keyboard has to get right, and all three are here
 * rather than on the individual keys, because a key cannot know about a
 * gesture that started on its neighbour:
 *
 *  - **Glissando.** Touch browsers implicitly capture the pointer on
 *    pointerdown, which stops `pointerenter` firing on the keys you slide
 *    onto. Releasing the capture immediately is what makes a slide play a run
 *    instead of one very long note.
 *  - **Multi-touch.** Each pointer id owns at most one note, so a chord played
 *    with three fingers is three independent presses. Tracking a single
 *    "current note" instead is how virtual keyboards end up monophonic under
 *    a chord.
 *  - **Release anywhere.** The pointerup that ends a note frequently happens
 *    off the key — off the keyboard, off the window. The listener is on
 *    `window`, so a note cannot be left sounding by lifting a finger onto the
 *    page background.
 *
 * ## Velocity from the strike point
 *
 * Pressing near the bottom of a key plays louder, the way depth of touch does
 * on a real action. It costs one rectangle measurement and it makes the
 * on-screen keyboard expressive rather than a row of on/off switches.
 */

/** Black keys reach this far down the white keys. */
const BLACK_KEY_HEIGHT_PERCENT = 62
const POINTER_VELOCITY = { min: 42, max: 122 } as const

export interface PianoKeyboardProps {
  window: KeyboardWindow
  showLabels?: boolean
  className?: string
}

export function PianoKeyboard({
  window: keyWindow,
  showLabels = true,
  className,
}: PianoKeyboardProps) {
  const audio = useAudio()
  const mode = useLearningStore((state) => state.mode)
  const layout = React.useMemo(() => buildLayout(keyWindow), [keyWindow])

  const audioRef = React.useRef(audio)
  audioRef.current = audio
  /** pointerId -> the note that pointer is currently holding. */
  const pointersRef = React.useRef(new Map<number, number>())
  /** Notes held by the keyboard's own focus ring, so a key repeat cannot double-trigger. */
  const keyboardHeldRef = React.useRef(new Set<number>())

  const press = React.useCallback((note: number, velocity: number) => {
    keyboardActions.noteOn(note, velocity, 'pointer')
    audioRef.current.noteOn(note, velocity)
    // The learning session is told directly rather than by watching the
    // keyboard store, so a chord played in one frame arrives as three notes
    // instead of as whichever one happened to land last.
    learningActions.noteOn(note)
  }, [])

  const release = React.useCallback((note: number) => {
    keyboardActions.noteOff(note)
    audioRef.current.noteOff(note)
  }, [])

  const velocityFor = React.useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    // A mouse or a pen has no pressure to read, so the strike point stands in
    // for it. A touch that reports real pressure is used directly.
    if (event.pointerType === 'touch' && event.pressure > 0 && event.pressure < 1) {
      return clampVelocity(
        POINTER_VELOCITY.min + event.pressure * (POINTER_VELOCITY.max - POINTER_VELOCITY.min),
      )
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const depth = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.7
    const clamped = Math.min(1, Math.max(0, depth))
    return clampVelocity(
      POINTER_VELOCITY.min + clamped * (POINTER_VELOCITY.max - POINTER_VELOCITY.min),
    )
  }, [])

  const onPress = React.useCallback(
    (note: number, event: React.PointerEvent<HTMLButtonElement>) => {
      // Touch captures the pointer implicitly. Without this, a slide across the
      // keys never leaves the key it started on.
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      pointersRef.current.set(event.pointerId, note)
      press(note, velocityFor(event))
    },
    [press, velocityFor],
  )

  const onEnter = React.useCallback(
    (note: number, event: React.PointerEvent<HTMLButtonElement>) => {
      const held = pointersRef.current.get(event.pointerId)
      if (held === undefined || held === note) return
      release(held)
      pointersRef.current.set(event.pointerId, note)
      press(note, velocityFor(event))
    },
    [press, release, velocityFor],
  )

  const onRelease = React.useCallback(
    (_note: number, event: React.PointerEvent<HTMLButtonElement>) => {
      const held = pointersRef.current.get(event.pointerId)
      if (held === undefined) return
      pointersRef.current.delete(event.pointerId)
      release(held)
    },
    [release],
  )

  // Wrong-note flashes are recorded with a timestamp by the pure reducer and
  // swept here. A `setTimeout` per mistake would be one timer per wrong note;
  // one interval, running only while something is lit, is enough.
  const hasWrongNotes = useLearningStore(
    (state) => Object.keys(state.session.wrongNotes).length > 0,
  )
  React.useEffect(() => {
    if (!hasWrongNotes) return
    const timer = globalThis.setInterval(
      () => useLearningStore.getState().expireWrongNotes(),
      WRONG_NOTE_FLASH_MS / 3,
    )
    return () => globalThis.clearInterval(timer)
  }, [hasWrongNotes])

  // A note must never survive the pointer that started it, wherever it ends up.
  React.useEffect(() => {
    const finish = (event: PointerEvent) => {
      const held = pointersRef.current.get(event.pointerId)
      if (held === undefined) return
      pointersRef.current.delete(event.pointerId)
      release(held)
    }
    globalThis.addEventListener('pointerup', finish)
    globalThis.addEventListener('pointercancel', finish)
    // Switching tab mid-chord otherwise leaves every note held for ever.
    const onBlur = () => {
      for (const note of pointersRef.current.values()) release(note)
      pointersRef.current.clear()
    }
    globalThis.addEventListener('blur', onBlur)
    return () => {
      globalThis.removeEventListener('pointerup', finish)
      globalThis.removeEventListener('pointercancel', finish)
      globalThis.removeEventListener('blur', onBlur)
    }
  }, [release])

  const onKeyDown = React.useCallback(
    (note: number, event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      // Holding the key down produces a repeat storm; one press is one note.
      if (keyboardHeldRef.current.has(note)) return
      keyboardHeldRef.current.add(note)
      press(note, 96)
    },
    [press],
  )

  const onKeyUp = React.useCallback(
    (note: number, event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      if (!keyboardHeldRef.current.delete(note)) return
      release(note)
    },
    [release],
  )

  return (
    <div className={className}>
      <div
        className="keybed"
        data-mode={mode}
        role="group"
        aria-label={`Piano keyboard, ${layout.whiteCount} white keys`}
        style={{ height: 'var(--keybed-height)' }}
      >
        {layout.whiteKeys.map((geometry) => (
          <PianoKey
            key={geometry.note}
            geometry={geometry}
            blackHeightPercent={BLACK_KEY_HEIGHT_PERCENT}
            showLabel={showLabels}
            onPress={onPress}
            onEnter={onEnter}
            onRelease={onRelease}
            onKeyDown={onKeyDown}
            onKeyUp={onKeyUp}
          />
        ))}
        {layout.blackKeys.map((geometry) => (
          <PianoKey
            key={geometry.note}
            geometry={geometry}
            blackHeightPercent={BLACK_KEY_HEIGHT_PERCENT}
            showLabel={false}
            onPress={onPress}
            onEnter={onEnter}
            onRelease={onRelease}
            onKeyDown={onKeyDown}
            onKeyUp={onKeyUp}
          />
        ))}
        <RangeEdges window={keyWindow} />
        <FingerBadges layout={layout} />
      </div>
    </div>
  )
}

/**
 * Recommended finger numbers, in their own layer above every key.
 *
 * Above, because a badge drawn inside a white key would be covered by the black
 * keys that overlap it, and a badge drawn inside a black key would be twelve
 * pixels wide. Positioned from the same percentages the keys are, so it stays
 * aligned at any width with nothing to keep in sync.
 *
 * These are recommendations. MIDI reports the note and the velocity; it does
 * not report which finger played it, and Sonara does not pretend otherwise.
 */
function FingerBadges({ layout }: { layout: KeyboardLayout }) {
  const annotations = useLearningStore((state) => state.annotations)

  const badges = React.useMemo(() => {
    const all = [
      ...layout.whiteKeys.map((key) => ({ key, black: false })),
      ...layout.blackKeys.map((key) => ({ key, black: true })),
    ]
    return all
      .map((entry) => ({ ...entry, annotation: annotations[entry.key.note] }))
      .filter((entry) => entry.annotation?.finger !== undefined)
  }, [layout, annotations])

  if (badges.length === 0) return null

  return (
    <div className="key-badges" aria-hidden>
      {badges.map(({ key, black, annotation }) => (
        <React.Fragment key={key.note}>
          <FingerBadge
            note={key.note}
            role={annotation!.role}
            finger={annotation!.finger!}
            black={black}
            left={key.leftPercent + key.widthPercent / 2}
          />
          {annotation!.cue && (
            <span
              className="key-cue"
              style={{ left: `${key.leftPercent + key.widthPercent / 2}%` }}
            >
              {annotation!.cue}
            </span>
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

/**
 * One number, subscribed to its own key's held state.
 *
 * Its own subscription rather than one read of the `active` map in the layer
 * above, for the same reason each key has one: MIDI arrives faster than a
 * render, and a trill would otherwise repaint every badge on the keyboard
 * thirty times a second to recolour one of them.
 *
 * The colour has to change at all because the numbers carry no disc any more —
 * on a key held down, the accent fill takes a dark numeral to 3.8:1, under AA
 * at this size.
 */
const FingerBadge = React.memo(function FingerBadge({
  note,
  role,
  finger,
  black,
  left,
}: {
  note: number
  role: KeyRole
  finger: number
  black: boolean
  left: number
}) {
  const active = useKeyboardStore((state) => state.active[note])

  return (
    <span
      className="key-badge"
      data-role={role}
      data-black={black ? 'true' : undefined}
      data-active={active ? 'true' : undefined}
      style={{ left: `${left}%` }}
    >
      {finger}
    </span>
  )
})

/**
 * Lights the edge of the keybed when a note sounds outside the visible window.
 *
 * On a phone showing two octaves of an 88-key controller, most of what a
 * player does happens off-screen. An edge that glows says "that went below the
 * view" — which is a great deal better than a keyboard that appears not to
 * have noticed.
 */
function RangeEdges({ window: keyWindow }: { window: KeyboardWindow }) {
  const lastNote = useKeyboardStore((state) => state.lastNote)
  const [edge, setEdge] = React.useState<'low' | 'high' | null>(null)

  React.useEffect(() => {
    if (!lastNote) return
    if (lastNote.note >= keyWindow.low && lastNote.note <= keyWindow.high) return
    setEdge(lastNote.note < keyWindow.low ? 'low' : 'high')
    const timer = globalThis.setTimeout(() => setEdge(null), 420)
    return () => globalThis.clearTimeout(timer)
  }, [lastNote, keyWindow.low, keyWindow.high])

  return (
    <>
      <span className="range-edge range-edge--start" data-lit={edge === 'low'} aria-hidden />
      <span className="range-edge range-edge--end" data-lit={edge === 'high'} aria-hidden />
    </>
  )
}
