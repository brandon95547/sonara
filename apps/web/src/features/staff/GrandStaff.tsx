import * as React from 'react'
import { ledgerSteps, staffNoteName, staffPlacement, type StaffPlacement } from '@sonara/shared'
import { useKeyboardStore } from '@/state/keyboard-store'
import { useElementWidth } from '@/lib/hooks'

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

/** Half the gap between two staff lines, in viewBox units. */
const STEP = 5
const NOTE_X = 116
const HALF_HEIGHT = 78
/**
 * Rendered height of the panel, in CSS pixels.
 *
 * The viewBox is sized from the measured width against this, so one unit is
 * one pixel at any width: scaling the drawing to fit a fixed box instead would
 * leave the staff as a small card in the corner of a wide panel, and would
 * shrink the noteheads on a narrow one.
 */
const PANEL_HEIGHT = 156
const UNITS_PER_PX = (HALF_HEIGHT * 2) / PANEL_HEIGHT

const STAFF_LINES = {
  treble: [2, 4, 6, 8, 10],
  bass: [-2, -4, -6, -8, -10],
} as const

const y = (steps: number) => -steps * STEP

export function GrandStaff() {
  // One subscription to the whole map: unlike a key, this draws every sounding
  // note at once, so there is nothing finer to subscribe to.
  const active = useKeyboardStore((state) => state.active)
  const [measureRef, pixelWidth] = useElementWidth<HTMLDivElement>()
  const width = Math.max(220, Math.round(pixelWidth * UNITS_PER_PX))

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
        <path
          d={`M 14 ${y(10)} C 6 ${y(6)}, 6 ${y(2)}, 11 0 C 6 ${y(-2)}, 6 ${y(-6)}, 14 ${y(-10)}`}
          className="staff__brace"
        />
        <line x1="20" y1={y(10)} x2="20" y2={y(-10)} className="staff__line" />
        <line x1={width - 2} y1={y(10)} x2={width - 2} y2={y(-10)} className="staff__line" />

        {(['treble', 'bass'] as const).map((staff) => (
          <g key={staff}>
            {STAFF_LINES[staff].map((steps) => (
              <line
                key={steps}
                x1="20"
                y1={y(steps)}
                x2={width - 2}
                y2={y(steps)}
                className="staff__line"
              />
            ))}
            <Clef staff={staff} />
          </g>
        ))}

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
function Clef({ staff }: { staff: 'treble' | 'bass' }) {
  const supported = useMusicGlyphs()
  // Each clef names a line: G above middle C, F below it.
  const line = staff === 'treble' ? 4 : -4

  if (!supported) {
    return (
      <>
        <circle cx="32" cy={y(line)} r={STEP * 0.8} className="staff__clef-dot" />
        <text x="41" y={y(line) + STEP * 1.4} className="staff__clef-letter">
          {staff === 'treble' ? 'G' : 'F'}
        </text>
      </>
    )
  }

  return (
    <text
      x="30"
      y={y(staff === 'treble' ? 5.4 : -5.6)}
      className={`staff__clef staff__clef--${staff}`}
    >
      {staff === 'treble' ? '\u{1D11E}' : '\u{1D122}'}
    </text>
  )
}

/** Measured once per session: the answer cannot change while the page is open. */
let glyphSupport: boolean | null = null

function useMusicGlyphs(): boolean {
  const [supported, setSupported] = React.useState(glyphSupport ?? true)

  React.useEffect(() => {
    if (glyphSupport !== null) return
    const context = document.createElement('canvas').getContext('2d')
    if (!context) return
    context.font = '48px serif'
    // A private-use codepoint no font fills, so anything measuring the same as
    // it is the same missing-glyph box.
    const missing = context.measureText('\u{F0000}').width
    glyphSupport = context.measureText('\u{1D11E}').width !== missing
    setSupported(glyphSupport)
  }, [])

  return supported
}
