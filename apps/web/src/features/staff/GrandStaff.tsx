import * as React from 'react'
import { staffNoteName, writtenValue } from '@sonara/shared'
import { useKeyboardStore } from '@/state/keyboard-store'
import { useElementSize } from '@/lib/hooks'
import { StaffFrame, HALF_HEIGHT } from './staff-frame'
import { Chord } from './StaffNotes'

/**
 * What you are playing, written down, as you play it.
 *
 * Deliberately knows nothing about the learning system: no expected notes, no
 * grading, no guidance. It reports the performance and stops there, which is
 * what makes it useful in Free Play and honest everywhere else.
 *
 * Vertical position is diatonic — see `staffPlacement`. Horizontal position is
 * not time: every sounding note is drawn at the same x, because this is a
 * picture of a moment rather than a score. Notes a second apart are nudged
 * sideways, the way an engraver would, so their noteheads do not overlap.
 */

const NOTE_X = 116

export function GrandStaff() {
  // One subscription to the whole map: unlike a key, this draws every sounding
  // note at once, so there is nothing finer to subscribe to.
  const active = useKeyboardStore((state) => state.active)
  const [measureRef, size] = useElementSize<HTMLDivElement>()

  /**
   * The viewBox width that makes the box's aspect and the drawing's identical.
   *
   * `preserveAspectRatio` scales by whichever axis is more constrained, so a
   * viewBox that is relatively wider than its element gets scaled down to fit
   * the height and leaves the remaining width empty — the element is full
   * width and the staff inside it is not. Deriving the width from the measured
   * aspect leaves nothing to letterbox, at any panel height, with no constant
   * to keep in step with the CSS.
   */
  const width =
    size.height > 0 ? Math.round((HALF_HEIGHT * 2 * size.width) / size.height) : HALF_HEIGHT * 4

  const sounding = React.useMemo(
    () =>
      Object.keys(active)
        .map(Number)
        .sort((a, b) => a - b),
    [active],
  )

  /**
   * A crotchet, always.
   *
   * A note being held has no written length yet — it ends when you let go, and
   * that has not happened. Drawing every one as a crotchet is the honest
   * choice: it is the value a reader assumes, and it puts a stem on the note so
   * this reads as notation rather than as dots on lines.
   */
  const value = React.useMemo(() => writtenValue(1, 1), [])

  return (
    <div ref={measureRef} className="staff-fit">
      <svg
        viewBox={`0 -${HALF_HEIGHT} ${width} ${HALF_HEIGHT * 2}`}
        preserveAspectRatio="xMinYMid meet"
        className="staff"
        role="img"
        aria-label={
          sounding.length === 0
            ? 'Grand staff, no notes sounding'
            : `Grand staff: ${sounding.map((note) => staffNoteName(note)).join(', ')}`
        }
      >
        <StaffFrame width={width} />

        <Chord x={NOTE_X} notes={sounding.map((note) => ({ note }))} value={value} />
      </svg>
    </div>
  )
}
