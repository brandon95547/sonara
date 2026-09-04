import * as React from 'react'
import { noteName, pitchClass } from '@sonara/shared'
import { useKeyboardStore } from '@/state/keyboard-store'
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
  showLabel: boolean
  onPress: (note: number, event: React.PointerEvent<HTMLButtonElement>) => void
  onEnter: (note: number, event: React.PointerEvent<HTMLButtonElement>) => void
  onRelease: (note: number, event: React.PointerEvent<HTMLButtonElement>) => void
  onKeyDown: (note: number, event: React.KeyboardEvent<HTMLButtonElement>) => void
  onKeyUp: (note: number, event: React.KeyboardEvent<HTMLButtonElement>) => void
}

export const PianoKey = React.memo(function PianoKey({
  geometry,
  blackHeightPercent,
  showLabel,
  onPress,
  onEnter,
  onRelease,
  onKeyDown,
  onKeyUp,
}: PianoKeyProps) {
  const { note, black } = geometry
  const active = useKeyboardStore((state) => state.active[note])
  const label = noteName(note)
  // Middle C is the one landmark every player navigates from.
  const isAnchor = note === 60

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
      aria-label={label}
      data-note={note}
      data-active={active ? 'true' : undefined}
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
      {showLabel && !black && pitchClass(note) === 0 && (
        <span className={`piano-key__label${isAnchor ? ' piano-key__label--anchor' : ''}`}>
          {label}
        </span>
      )}
    </button>
  )
})
