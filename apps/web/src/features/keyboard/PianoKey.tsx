import * as React from 'react'
import { noteName, pitchClass } from '@sonara/shared'
import { useKeyboardStore } from '@/state/keyboard-store'
import { useLearningStore, type KeyLabels } from '@/state/learning-store'
import type { KeyGeometry } from './keyboard-layout'

/**
 * One key.
 *
 * Subscribes to its own note and nothing else. That is the whole reason the
 * active notes live in a store instead of in React state: a trill sends thirty
 * events a second, and each one has to repaint one key rather than a keyboard
 * of eighty-eight.
 */

export interface PianoKeyProps {
  geometry: KeyGeometry
  /** Height of the black keys as a percentage of the keybed. */
  blackHeightPercent: number
  keyLabels: KeyLabels
  onPress: (note: number, event: React.PointerEvent<HTMLButtonElement>) => void
  onEnter: (note: number, event: React.PointerEvent<HTMLButtonElement>) => void
  onRelease: (note: number, event: React.PointerEvent<HTMLButtonElement>) => void
  onKeyDown: (note: number, event: React.KeyboardEvent<HTMLButtonElement>) => void
  onKeyUp: (note: number, event: React.KeyboardEvent<HTMLButtonElement>) => void
}

export const PianoKey = React.memo(function PianoKey({
  geometry,
  blackHeightPercent,
  keyLabels,
  onPress,
  onEnter,
  onRelease,
  onKeyDown,
  onKeyUp,
}: PianoKeyProps) {
  const { note, black } = geometry
  const active = useKeyboardStore((state) => state.active[note])
  // One subscription per key, to that key's own entry. A note event rebuilds
  // the map but leaves every other entry referentially identical, so only the
  // keys that actually changed re-render.
  const annotation = useLearningStore((state) =>
    state.topic === 'songs' ? state.songAnnotations[note] : state.annotations[note],
  )
  const label = noteName(note)
  // Middle C is the one landmark every player navigates from.
  const isAnchor = note === 60

  /**
   * The one thing written on this key, if anything.
   *
   * Degrees exist only for keys the exercise knows about, and fingers are drawn
   * in their own layer above the keys rather than written here. Otherwise the
   * key carries its note name, or the octave marker that says where you are.
   */
  const keyText = ((): { text: string; anchor?: boolean } | null => {
    if (keyLabels === 'off' || keyLabels === 'fingers') return null
    if (keyLabels === 'degrees') return annotation?.degree ? { text: annotation.degree } : null
    if (annotation?.label) return { text: annotation.label }
    return pitchClass(note) === 0 ? { text: label, anchor: isAnchor } : null
  })()

  const style: React.CSSProperties = black
    ? {
        left: `${geometry.leftPercent}%`,
        width: `${geometry.widthPercent}%`,
        height: `${blackHeightPercent}%`,
        ...(active ? { '--key-velocity': active.velocity / 127 } : {}),
      }
    : active
      ? ({ '--key-velocity': active.velocity / 127 } as React.CSSProperties)
      : {}

  return (
    <button
      type="button"
      // A key is not a toggle: aria-pressed would say it stays down. `data-active`
      // drives the paint, and the live region in the keyboard announces notes.
      aria-label={annotation?.finger ? `${label}, finger ${annotation.finger}` : label}
      data-note={note}
      data-active={active ? 'true' : undefined}
      data-role={annotation?.role}
      data-group={annotation?.group}
      className={black ? 'piano-key piano-key--black' : 'piano-key piano-key--white'}
      style={style}
      onPointerDown={(event) => onPress(note, event)}
      onPointerEnter={(event) => onEnter(note, event)}
      onPointerUp={(event) => onRelease(note, event)}
      onPointerCancel={(event) => onRelease(note, event)}
      onKeyDown={(event) => onKeyDown(note, event)}
      onKeyUp={(event) => onKeyUp(note, event)}
      // Dragging a key would start a native drag and swallow the glissando.
      draggable={false}
    >
      {/* An annotated key shows the note it IS — `E♭`, not `E♭4` — because in
          a scale you are reading letters, not octaves. Unannotated keys keep
          the octave marker on every C, which is how you find your place. */}
      {keyText !== null && !black && (
        <span className={`piano-key__label${keyText.anchor ? ' piano-key__label--anchor' : ''}`}>
          {keyText.text}
        </span>
      )}
    </button>
  )
})
