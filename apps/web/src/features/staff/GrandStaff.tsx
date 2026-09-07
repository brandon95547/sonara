import * as React from 'react'
import { ledgerSteps, staffNoteName, staffPlacement, type StaffPlacement } from '@sonara/shared'
import { useKeyboardStore } from '@/state/keyboard-store'
import { useElementSize } from '@/lib/hooks'
import { StaffFrame, STEP, HALF_HEIGHT, y } from './staff-frame'

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

  const placements = React.useMemo(() => {
    const notes = Object.keys(active)
      .map(Number)
      .sort((a, b) => a - b)
    const seen: StaffPlacement[] = []
    return notes.map((note) => {
      const placement = staffPlacement(note)
      // An engraver shifts the upper of two notes a second apart, so their
      // noteheads sit side by side instead of on top of one another.
      const clash = seen.some(
        (other) => other.staff === placement.staff && Math.abs(other.steps - placement.steps) === 1,
      )
      seen.push(placement)
      return { note, placement, offset: clash ? 1 : 0 }
    })
  }, [active])

  return (
    <div ref={measureRef} className="staff-fit">
      <svg
        viewBox={`0 -${HALF_HEIGHT} ${width} ${HALF_HEIGHT * 2}`}
        preserveAspectRatio="xMinYMid meet"
        className="staff"
        role="img"
        aria-label={
          placements.length === 0
            ? 'Grand staff, no notes sounding'
            : `Grand staff: ${placements.map((entry) => staffNoteName(entry.note)).join(', ')}`
        }
      >
        <StaffFrame width={width} />

        {placements.map(({ note, placement, offset }) => (
          <Note key={note} placement={placement} offset={offset} />
        ))}
      </svg>
    </div>
  )
}

function Note({ placement, offset }: { placement: StaffPlacement; offset: number }) {
  const cx = NOTE_X + offset * (STEP * 2.4)
  const cy = y(placement.steps)

  return (
    <g className="staff__note">
      {ledgerSteps(placement).map((steps) => (
        <line
          key={steps}
          x1={cx - STEP * 2.2}
          y1={y(steps)}
          x2={cx + STEP * 2.2}
          y2={y(steps)}
          className="staff__ledger"
        />
      ))}
      {/* A tilted ellipse, which is what stops a stack of them reading as a
          column of circles. */}
      <ellipse
        cx={cx}
        cy={cy}
        rx={STEP * 1.35}
        ry={STEP * 0.98}
        transform={`rotate(-18 ${cx} ${cy})`}
      />
      {placement.sharp && (
        <text x={cx - STEP * 3.6} y={cy + STEP * 0.9} className="staff__accidental">
          ♯
        </text>
      )}
    </g>
  )
}

/**
 * The clef glyph, or a drawn stand-in where the font has no music in it.
 *
 * macOS ships the Musical Symbols block; a stock Linux install often does not,
 * and a tofu box where the clef should be is worse than no clef at all. So the
 * glyph is measured once against a codepoint nothing can have, and a letter
 * marker on the line the clef names stands in when it is missing.
 */
