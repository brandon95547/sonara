import * as React from 'react'

/**
 * The empty grand staff, and the units everything on it is drawn in.
 *
 * Shared by the two staves this app draws: `GrandStaff`, which shows the note
 * sounding right now, and `SongScore`, which shows a whole piece. The brace,
 * the ten lines and the clefs are the same picture in both, and were the same
 * code twice until the second one existed.
 */

/** Half the gap between two staff lines, in viewBox units. */
export const STEP = 5

/**
 * Half the vertical budget, in viewBox units.
 *
 * The staff itself spans ±50 (five lines each side of middle C at 5 units a
 * step); the rest is headroom for ledger lines, so the drawing never has to be
 * scaled down to fit an unusually high or low note.
 *
 * Ninety-eight rather than a rounder number because that is where the treble
 * clef ends. It is the tallest thing on a grand staff — taller than any note,
 * and drawn on every system — and at 92 the top of it was being shaved off in
 * every view in the app.
 */
export const HALF_HEIGHT = 98

/**
 * How far each staff is pushed away from middle C, in steps.
 *
 * The two staves of a grand staff are not four steps apart on the page, however
 * neatly that falls out of measuring both from middle C. Engraved music leaves
 * room between them — for the ledger lines either staff may need, and because a
 * system crammed together reads as ten lines rather than as two hands.
 *
 * Applied on the way to the page, not in the model: `staffPlacement` keeps
 * saying what note is written where, and this says how far apart to draw it.
 */
export const SYSTEM_GAP = 3

/** Vertical position of a step, once its staff has been pushed clear. */
export const yOn = (steps: number, staff: 'treble' | 'bass') =>
  -(steps + (staff === 'treble' ? SYSTEM_GAP : -SYSTEM_GAP)) * STEP

/**
 * Vertical position of a step on the staff it belongs to.
 *
 * Middle C and above is treble, which is the same rule `staffPlacement` uses.
 */
export const y = (steps: number) => yOn(steps, steps >= 0 ? 'treble' : 'bass')

const STAFF_LINES = {
  treble: [2, 4, 6, 8, 10],
  bass: [-2, -4, -6, -8, -10],
} as const

/** How much room the brace and clefs need, in viewBox units. */
export const GUTTER = 120

/** Where the key signature's accidentals begin, just clear of the clefs. */
export const KEY_X = GUTTER + 10
/** The pitch of the key signature's accidentals, matching how they are drawn. */
const KEY_SPACING = STEP * 2.4
/** A sharp's measured width. */
const SHARP_WIDTH = 10.5

/**
 * How wide a key signature is, drawn as `KeySignature` draws it.
 *
 * Both staves that draw one need to know: a system that reserves room for seven
 * sharps it does not have has thrown away a bar of a short line, and one that
 * reserves none prints its first note on top of the signature.
 */
export function keyWidth(fifths: number): number {
  const marks = Math.min(7, Math.abs(fifths))
  return marks === 0 ? 0 : (marks - 1) * KEY_SPACING + SHARP_WIDTH
}

/** The ten lines, and the bar line that closes them. */
export function StaffLines({ width, from = 20 }: { width: number; from?: number }) {
  return (
    <>
      <line
        x1={width - 2}
        y1={yOn(10, 'treble')}
        x2={width - 2}
        y2={yOn(-10, 'bass')}
        className="staff__system-line"
      />
      {(['treble', 'bass'] as const).map((staff) => (
        <g key={staff}>
          {STAFF_LINES[staff].map((steps) => (
            <line
              key={steps}
              x1={from}
              y1={yOn(steps, staff)}
              x2={width - 2}
              y2={yOn(steps, staff)}
              className="staff__line"
            />
          ))}
        </g>
      ))}
    </>
  )
}

/**
 * The brace and the two clefs, with enough staff behind them to sit on.
 *
 * Drawn apart from the lines because a scrolling score pins this and lets the
 * music pass underneath. A clef that scrolls off the left is a clef you cannot
 * read the music without, which is the one thing it is for.
 */
export function StaffGutter() {
  return (
    <>
      <path
        d={`M 14 ${yOn(10, 'treble')} C 4 ${yOn(5, 'treble')}, 4 ${yOn(1, 'treble')}, 11 0 C 4 ${yOn(-1, 'bass')}, 4 ${yOn(-5, 'bass')}, 14 ${yOn(-10, 'bass')}`}
        className="staff__brace"
      />
      <line
        x1="20"
        y1={yOn(10, 'treble')}
        x2="20"
        y2={yOn(-10, 'bass')}
        className="staff__system-line"
      />
      {(['treble', 'bass'] as const).map((staff) => (
        <g key={staff}>
          {STAFF_LINES[staff].map((steps) => (
            <line
              key={steps}
              x1="20"
              y1={yOn(steps, staff)}
              x2={GUTTER}
              y2={yOn(steps, staff)}
              className="staff__line"
            />
          ))}
          <Clef staff={staff} />
        </g>
      ))}
    </>
  )
}

/** Brace, clefs and lines together, for a staff that does not scroll. */
export function StaffFrame({ width }: { width: number }) {
  return (
    <>
      <StaffGutter />
      <StaffLines width={width} from={GUTTER} />
    </>
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
        <circle cx="32" cy={yOn(line, staff)} r={STEP * 0.8} className="staff__clef-dot" />
        <text x="41" y={yOn(line, staff) + STEP * 1.4} className="staff__clef-letter">
          {staff === 'treble' ? 'G' : 'F'}
        </text>
      </>
    )
  }

  return (
    <text
      x="30"
      y={yOn(staff === 'treble' ? 5.4 : -5.6, staff)}
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
