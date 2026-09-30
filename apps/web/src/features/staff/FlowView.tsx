import * as React from 'react'
import { useElementSize } from '@/lib/hooks'
import { GUTTER, STAFF_BANDS, STAFF_START, StaffGutter, StaffLines } from './staff-frame'
import {
  BarLines,
  isLive,
  LiveStep,
  Playhead,
  PLAYHEAD_SHOWN,
  Signatures,
  Step,
  type Role,
} from './score-parts'
import { barLinesIn, frameOf, headerEnd, place, type Measured, type Placed } from './score'

/**
 * The music as one endless system, running past a fixed clef.
 *
 * Sonara's guided reading: the music moves and your place in it does not, which
 * is the same bargain the keyboard makes when it follows what you play. It suits
 * a learner, who is watching one chord arrive at a time and wants the next few
 * in front of them — and it suits nobody who can already read a song, which is
 * what Sheet is for.
 *
 * Three layers. The paper is at the back and does not scroll: two strips the
 * width of the stage, each exactly as tall as its staff, however short the
 * music on them is. The clefs are pinned over their left end, standing out
 * above and below them. And the music scrolls in a window that starts where
 * the clefs end and stops where the strips do — so a note leaving the view goes
 * out at an edge, rather than sliding under an opaque cover laid over the
 * clefs.
 */

export function FlowView({
  measured,
  here,
  fifths,
  beats,
  beatType,
  roleFor,
  label,
  withTime = true,
  numbered = true,
  watchAll = false,
}: {
  measured: readonly Measured[]
  here: number
  fifths: number
  beats: number
  beatType: number
  roleFor: (index: number) => Role
  label: string
  /** The metre up front. A song states it; a scale has no metre to state. */
  withTime?: boolean
  /** Bar numbers, so a player can say where they are. A scale is too short to need them. */
  numbered?: boolean
  /**
   * Every chord lights when its keys go down, not only the few near your place.
   *
   * A song keeps to the window: it has hundreds of chords and plays middle C
   * fifty times, so lighting all of them costs a redraw of the piece and says
   * nothing about where you are. A scale has a couple of dozen notes and each
   * pitch at most twice, and a player running up it before pressing Start — or
   * past the window after — expects the note they are holding to light where
   * it is written.
   */
  watchAll?: boolean
}) {
  const [frameRef, size] = useElementSize<HTMLDivElement>()
  const scrollRef = React.useRef<HTMLDivElement>(null)

  const placed = React.useMemo(
    () => place(measured, headerEnd(fifths, withTime)),
    [measured, fifths, withTime],
  )
  const frame = React.useMemo(() => frameOf(measured), [measured])
  const height = frame.bottom - frame.top

  // The drawing scales with the panel's height, so the width in pixels follows
  // from it — which is what makes the container scroll by the right amount.
  //
  // Not rounded. The clefs and the music are two drawings that have to meet
  // as one: a width a fraction of a pixel short makes `meet` fit that drawing
  // by its width instead, at a scale of its own, and the staff lines step
  // where the two join.
  const scale = size.height > 0 ? size.height / height : 1
  const gutterPx = GUTTER * scale
  const insetPx = STAFF_START * scale
  /** The music's window, in pixels: between the clefs and the strips' right end. */
  const visible = size.width - gutterPx - insetPx
  // At least as wide as the window, so the lines run the length of the paper
  // under them even when the music stops short of it.
  const totalWidth = Math.max((placed.at(-1)?.x ?? 0) + 60, GUTTER + Math.max(0, visible) / scale)
  const musicWidth = totalWidth - GUTTER
  const pixelWidth = musicWidth * scale

  // Keep the current chord on screen, the way the keyboard follows what you
  // play. Nothing to do until the panel has been laid out — a width of zero
  // makes every margin zero, and the score scrolls to nowhere before the first
  // note is played.
  React.useEffect(() => {
    const box = scrollRef.current
    const current = placed[here]
    // The panel's own measured width, not `box.clientWidth`. Reading layout
    // from inside the effect returns zero here — the element is in the document
    // and is the right one, and still measures nothing — so the guard below
    // rejected every scroll and the score silently never followed. The observer
    // that already sizes the drawing knows the answer.
    if (!box || !current || visible <= 0) return
    const x = (current.x - GUTTER) * scale
    const margin = visible * 0.35
    if (x < box.scrollLeft + margin || x > box.scrollLeft + visible - margin) {
      // A jump, on purpose. Smooth scrolling here — by CSS or by the `behavior`
      // option — does nothing at all on engines that have not implemented it,
      // and the score just stops following with no sign of why. Arriving
      // abruptly beats not arriving.
      box.scrollLeft = Math.max(0, x - margin)
    }
  }, [here, placed, scale, visible])

  // Where the paper goes, in pixels: the same bands PaperCards draws in units.
  const band = (staff: 'treble' | 'bass') => ({
    top: (STAFF_BANDS[staff].top - frame.top) * scale,
    height: (STAFF_BANDS[staff].bottom - STAFF_BANDS[staff].top) * scale,
    left: insetPx,
    right: insetPx,
  })

  return (
    <div ref={frameRef} className="staff-fit staff-score">
      <div className="staff-card" style={band('treble')} aria-hidden />
      <div className="staff-card" style={band('bass')} aria-hidden />

      <svg
        className="staff-gutter"
        viewBox={`0 ${frame.top} ${GUTTER} ${height}`}
        width={gutterPx || undefined}
        height="100%"
        preserveAspectRatio="xMinYMid meet"
        aria-hidden
      >
        <StaffGutter />
      </svg>

      <div ref={scrollRef} className="staff-scroll" style={{ left: gutterPx, right: insetPx }}>
        <svg
          viewBox={`${GUTTER} ${frame.top} ${musicWidth} ${height}`}
          width={pixelWidth || undefined}
          height="100%"
          preserveAspectRatio="xMinYMid meet"
          className="staff"
          role="img"
          aria-label={label}
        >
          <StaffLines from={GUTTER} to={totalWidth} />
          <Signatures fifths={fifths} beats={beats} beatType={beatType} withTime={withTime} />
          <BarLines lines={barLinesIn(placed)} numbered={numbered} />
          {PLAYHEAD_SHOWN && placed[here] && <Playhead x={placed[here]!.x} />}
          {placed.map((entry) => {
            const role = roleFor(entry.index)
            return (
              <StepAt
                key={entry.index}
                placed={entry}
                role={role}
                live={watchAll || isLive(role)}
                fifths={fifths}
              />
            )
          })}
        </svg>
      </div>
    </div>
  )
}

/** Watched if it is live, drawn once and left alone if it is not. */
function StepAt({
  placed,
  role,
  live,
  fifths,
}: {
  placed: Placed
  role: Role
  live: boolean
  fifths: number
}) {
  return live ? (
    <LiveStep placed={placed} role={role} fifths={fifths} />
  ) : (
    <Step placed={placed} role={role} fifths={fifths} lit="" />
  )
}
