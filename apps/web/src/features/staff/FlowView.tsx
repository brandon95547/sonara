import * as React from 'react'
import { useElementSize } from '@/lib/hooks'
import { GUTTER, StaffGutter, StaffLines } from './staff-frame'
import { BarLines, isLive, LiveStep, Playhead, Signatures, Step, type Role } from './score-parts'
import { barLinesIn, frameOf, headerEnd, place, type Measured, type Placed } from './score'

/**
 * The song as one endless system, running past a fixed playhead.
 *
 * Sonara's guided reading: the music moves and your place in it does not, which
 * is the same bargain the keyboard makes when it follows what you play. It suits
 * a learner, who is watching one chord arrive at a time and wants the next few
 * in front of them — and it suits nobody who can already read, which is what
 * Sheet is for.
 */

export function FlowView({
  measured,
  here,
  fifths,
  beats,
  beatType,
  roleFor,
  label,
}: {
  measured: readonly Measured[]
  here: number
  fifths: number
  beats: number
  beatType: number
  roleFor: (index: number) => Role
  label: string
}) {
  const [frameRef, size] = useElementSize<HTMLDivElement>()
  const scrollRef = React.useRef<HTMLDivElement>(null)

  const placed = React.useMemo(() => place(measured, headerEnd(fifths, true)), [measured, fifths])
  const frame = React.useMemo(() => frameOf(measured), [measured])
  const height = frame.bottom - frame.top
  const totalWidth = Math.max((placed.at(-1)?.x ?? 0) + 60, 320)

  // The drawing scales with the panel's height, so the width in pixels follows
  // from it — which is what makes the container scroll by the right amount.
  const scale = size.height > 0 ? size.height / height : 1
  const pixelWidth = Math.round(totalWidth * scale)

  // Keep the current chord on screen, the way the keyboard follows what you
  // play. Nothing to do until the panel has been laid out — a width of zero
  // makes every margin zero, and the score scrolls its own clefs off the left
  // before the first note is played.
  React.useEffect(() => {
    const box = scrollRef.current
    const current = placed[here]
    // The panel's own measured width, not `box.clientWidth`. Reading layout
    // from inside the effect returns zero here — the element is in the document
    // and is the right one, and still measures nothing — so the guard below
    // rejected every scroll and the score silently never followed. The observer
    // that already sizes the drawing knows the answer.
    if (!box || !current || size.width === 0) return
    const x = current.x * scale
    const margin = size.width * 0.35
    if (x < box.scrollLeft + margin || x > box.scrollLeft + size.width - margin) {
      // A jump, on purpose. Smooth scrolling here — by CSS or by the `behavior`
      // option — does nothing at all on engines that have not implemented it,
      // and the score just stops following with no sign of why. Arriving
      // abruptly beats not arriving.
      box.scrollLeft = Math.max(0, x - margin)
    }
  }, [here, placed, scale, size.width])

  return (
    <div ref={frameRef} className="staff-fit staff-score">
      <div ref={scrollRef} className="staff-scroll">
        <svg
          viewBox={`0 ${frame.top} ${totalWidth} ${height}`}
          width={pixelWidth || undefined}
          height="100%"
          preserveAspectRatio="xMinYMid meet"
          className="staff"
          role="img"
          aria-label={label}
        >
          <StaffLines width={totalWidth} />
          <Signatures fifths={fifths} beats={beats} beatType={beatType} withTime />
          <BarLines lines={barLinesIn(placed)} />
          {placed.map((entry) => (
            <StepAt key={entry.index} placed={entry} role={roleFor(entry.index)} fifths={fifths} />
          ))}
          {placed[here] && <Playhead x={placed[here]!.x} />}
        </svg>
      </div>

      {/* Pinned over the music, which scrolls behind it. */}
      <svg
        className="staff-gutter"
        viewBox={`0 ${frame.top} ${GUTTER} ${height}`}
        width={Math.round(GUTTER * scale) || undefined}
        height="100%"
        preserveAspectRatio="xMinYMid meet"
        aria-hidden
      >
        <StaffGutter />
      </svg>
    </div>
  )
}

/** Watched if it is near the playhead, drawn once and left alone if it is not. */
function StepAt({ placed, role, fifths }: { placed: Placed; role: Role; fifths: number }) {
  return isLive(role) ? (
    <LiveStep placed={placed} role={role} fifths={fifths} />
  ) : (
    <Step placed={placed} role={role} fifths={fifths} lit="" />
  )
}
