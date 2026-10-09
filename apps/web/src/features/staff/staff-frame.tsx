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
 * A hundred and thirteen rather than a rounder number because that is where
 * the treble clef ends. It is the tallest thing on a grand staff — taller than
 * any note, and drawn on every system — and an inch short of it shaves the top
 * off in every view in the app. It moves with SYSTEM_GAP: pushing the staves
 * apart lifts the clef by the same amount.
 */
export const HALF_HEIGHT = 113

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
 *
 * Six steps: each staff is its own strip of paper, and the room between them
 * is where the ledger notes either hand reaches for are written — a right-hand
 * scale from the A below middle C, a left hand climbing past it.
 */
export const SYSTEM_GAP = 6

/** Vertical position of a step, once its staff has been pushed clear. */
export const yOn = (steps: number, staff: 'treble' | 'bass') =>
  -(steps + (staff === 'treble' ? SYSTEM_GAP : -SYSTEM_GAP)) * STEP

/** Where the staff lines begin, in units from the drawing's left edge. */
export const STAFF_START = 20
/** How far short of a drawing's right edge its staff lines stop. */
export const PAPER_MARGIN = STAFF_START

/**
 * The paper under each staff: from its top line to its bottom line, and no
 * further.
 *
 * The white is the staff, the way a practice app draws it rather than the way
 * a page does. What reaches past the five lines — the treble clef above and
 * below them, a note on ledger lines — stands on the stage instead of on a
 * margin of paper, so the staff reads as a band the music is hung on.
 */
export const STAFF_BANDS = {
  treble: { top: yOn(10, 'treble'), bottom: yOn(2, 'treble') },
  bass: { top: yOn(-2, 'bass'), bottom: yOn(-10, 'bass') },
} as const

/** The two strips of paper, for a drawing that does not scroll. See `STAFF_BANDS`. */
export function PaperCards({ width }: { width: number }) {
  return (
    <>
      {(['treble', 'bass'] as const).map((staff) => (
        <rect
          key={staff}
          x={STAFF_START}
          y={STAFF_BANDS[staff].top}
          width={Math.max(0, width - PAPER_MARGIN - STAFF_START)}
          height={STAFF_BANDS[staff].bottom - STAFF_BANDS[staff].top}
          rx={1}
          className="staff__paper"
        />
      ))}
    </>
  )
}

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

/** The ten lines, from `from` to `to`. */
export function StaffLines({ from, to }: { from: number; to: number }) {
  return (
    <>
      {(['treble', 'bass'] as const).map((staff) => (
        <g key={staff}>
          {STAFF_LINES[staff].map((steps) => (
            <line
              key={steps}
              x1={from}
              y1={yOn(steps, staff)}
              x2={to}
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
 * The brace, the line that opens the system, and the two clefs, with enough
 * staff behind them to sit on.
 *
 * Drawn apart from the lines because a scrolling score pins this and lets the
 * music pass it by. A clef that scrolls off the left is a clef you cannot read
 * the music without, which is the one thing it is for.
 *
 * The brace and the opening line are what say the two staves are one
 * instrument. They cross the stage between the two strips of paper, as the bar
 * lines do: the strips are where the lines of the staff are printed, and the
 * system is both of them.
 */
export function StaffGutter() {
  const top = yOn(10, 'treble')
  const bottom = yOn(-10, 'bass')
  const middle = (top + bottom) / 2
  // A curl either side of the middle, its point towards the margin.
  const brace = STAFF_START - STEP * 0.9
  const reach = STEP * 1.9
  const bow = (bottom - top) * 0.09
  return (
    <>
      <path
        d={
          `M ${brace} ${top} C ${brace - reach * 1.5} ${top + bow} ${brace + reach * 0.5} ${middle - bow} ${brace - reach} ${middle} ` +
          `C ${brace + reach * 0.5} ${middle + bow} ${brace - reach * 1.5} ${bottom - bow} ${brace} ${bottom}`
        }
        className="staff__brace"
      />
      <line x1={STAFF_START} y1={top} x2={STAFF_START} y2={bottom} className="staff__system-line" />
      {(['treble', 'bass'] as const).map((staff) => (
        <g key={staff}>
          {STAFF_LINES[staff].map((steps) => (
            <line
              key={steps}
              x1={STAFF_START}
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

/** Clefs and lines together, for a staff that does not scroll. */
export function StaffFrame({ width }: { width: number }) {
  return (
    <>
      <StaffGutter />
      <StaffLines from={GUTTER} to={width - PAPER_MARGIN} />
    </>
  )
}

const CLEF_GLYPHS = { treble: '\u{1D11E}', bass: '\u{1D122}' } as const

/**
 * How tall each clef's ink is drawn, in units.
 *
 * A treble clef stands a space and a half proud of its staff at both ends —
 * seven spaces in all — and a bass clef, dots included, is a little over three.
 * Set as ink rather than as a font size because the fonts that carry these
 * glyphs disagree by half again about how big a given size is: the one macOS
 * falls back to draws a 58px treble clef barely as tall as the staff.
 */
const CLEF_INK = { treble: STEP * 14, bass: STEP * 6.4 } as const

/** Where a clef is drawn: its font size, and the baseline that puts its ink where it belongs. */
export interface ClefFit {
  readonly size: number
  readonly baseline: number
}

/**
 * Size a clef to `CLEF_INK` and centre its ink on its staff.
 *
 * Takes the glyph's ink above and below the baseline, measured at 100px — the
 * only numbers that differ from one machine's music font to the next.
 */
export function fitClef(
  staff: 'treble' | 'bass',
  ink: { ascent: number; descent: number },
): ClefFit {
  const size = (CLEF_INK[staff] / (ink.ascent + ink.descent)) * 100
  const middle = (STAFF_BANDS[staff].top + STAFF_BANDS[staff].bottom) / 2
  // The ink runs from `ascent` above the baseline to `descent` below it, so its
  // middle is half their difference above the baseline.
  return { size, baseline: middle + ((ink.ascent - ink.descent) / 2) * (size / 100) }
}

/** Where the clefs go before they have been measured, or where they cannot be. */
const UNMEASURED: Record<'treble' | 'bass', ClefFit> = {
  treble: { size: 58, baseline: yOn(5.4, 'treble') },
  bass: { size: 46, baseline: yOn(-5.6, 'bass') },
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
  const fits = useClefFits()
  // Each clef names a line: G above middle C, F below it.
  const line = staff === 'treble' ? 4 : -4

  if (fits === 'missing') {
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
      y={fits[staff].baseline}
      className="staff__clef"
      style={{ fontSize: fits[staff].size }}
    >
      {CLEF_GLYPHS[staff]}
    </text>
  )
}

type ClefFits = Record<'treble' | 'bass', ClefFit> | 'missing'

/** Measured once per session: the answer cannot change while the page is open. */
let measured: ClefFits | null = null

function useClefFits(): ClefFits {
  const [fits, setFits] = React.useState<ClefFits>(measured ?? UNMEASURED)

  React.useEffect(() => {
    if (measured === null) measured = measureClefs()
    setFits(measured)
  }, [])

  return fits
}

/** The clefs as this browser's music font draws them. */
function measureClefs(): ClefFits {
  const context = document.createElement('canvas').getContext('2d')
  if (!context) return UNMEASURED
  // The same stack the staff draws with, so it is the same font's ink.
  const family =
    getComputedStyle(document.documentElement).getPropertyValue('--font-music').trim() || 'serif'
  context.font = `100px ${family}`
  // A private-use codepoint no font fills, so anything measuring the same as
  // it is the same missing-glyph box.
  const missing = context.measureText('\u{F0000}').width
  if (context.measureText(CLEF_GLYPHS.treble).width === missing) return 'missing'

  const fit = (staff: 'treble' | 'bass') => {
    const metrics = context.measureText(CLEF_GLYPHS[staff])
    const ink = {
      ascent: metrics.actualBoundingBoxAscent,
      descent: metrics.actualBoundingBoxDescent,
    }
    // An engine without ink metrics reports nothing to centre; leave it where it was.
    return ink.ascent + ink.descent > 0 ? fitClef(staff, ink) : UNMEASURED[staff]
  }
  return { treble: fit('treble'), bass: fit('bass') }
}
