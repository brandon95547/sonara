import * as React from 'react'
import { useElementSize } from '@/lib/hooks'
import { HALF_HEIGHT, StaffFrame } from './staff-frame'
import { BarLines, isLive, LiveStep, Playhead, Signatures, Step, type Role } from './score-parts'
import type { SongNote } from '@sonara/shared'
import {
  barLinesIn,
  breakIntoSystems,
  frameOf,
  headerEnd,
  place,
  type Measured,
  type Placed,
} from './score'

/**
 * The song as printed music: lines, read left to right and then down.
 *
 * For someone who already reads. Flow moves the music past a fixed playhead,
 * which is the right way to be taught and the wrong way to sight-read — the
 * page will not hold still, and you cannot look ahead of a note that has not
 * arrived yet. Here the notation stays where it is and the playhead travels
 * across it, exactly as your eye does on paper.
 *
 * The page turns only when it has to, and lands the current system at the top
 * so everything still to be played is below it. Anything gentler — following
 * continuously, or centring the current line — spends half the panel on music
 * already behind you.
 */

/** How tall a default-height system is drawn, in pixels. */
const SYSTEM_PX = 148
/**
 * Pixels per unit at full size.
 *
 * Printed music has a staff size; a page that resized its notes as it filled
 * up would be a strange thing to read. So a taller panel shows more lines
 * rather than bigger ones.
 */
const FULL_SCALE = SYSTEM_PX / (HALF_HEIGHT * 2)
/**
 * The narrowest line worth breaking music onto, in units.
 *
 * The brace, the clefs and the key take about a hundred and fifty of them
 * before a single note is drawn. On a phone at full size that is most of the
 * line, and bars start breaking in half — so the staff shrinks, but only as
 * far as it takes to fit a bar, and never on a screen with room to spare.
 */
const MIN_PAGE = 520
/** The air between two systems. */
const SYSTEM_SPACING = 26

export function SheetView({
  measured,
  here,
  fifths,
  beats,
  beatType,
  roleFor,
  hints,
  label,
}: {
  measured: readonly Measured[]
  here: number
  fifths: number
  beats: number
  beatType: number
  roleFor: (index: number) => Role
  /** Which notes get a printed fingering. See `fingeringHints`. */
  hints: ReadonlySet<SongNote>
  label: string
}) {
  const [frameRef, size] = useElementSize<HTMLDivElement>()
  const scrollRef = React.useRef<HTMLDivElement>(null)

  const scale = Math.min(FULL_SCALE, size.width > 0 ? size.width / MIN_PAGE : FULL_SCALE)
  const pageWidth = size.width > 0 ? size.width / scale : 0

  const systems = React.useMemo(() => {
    if (pageWidth <= 0 || measured.length === 0) return []
    let y = 0
    return breakIntoSystems(measured, fifths, pageWidth).map((system) => {
      const slice = measured.slice(system.from, system.to)
      const frame = frameOf(slice)
      const placed = place(slice, headerEnd(fifths, system.from === 0), system.stretch)
      const height = frame.bottom - frame.top
      const top = y
      y += height + SYSTEM_SPACING
      return { ...system, placed, top, height, origin: top - frame.top }
    })
  }, [measured, fifths, pageWidth])

  const last = systems.at(-1)
  const pageHeight = last ? last.top + last.height : HALF_HEIGHT * 2
  const current = systems.find((system) => here >= system.from && here < system.to)

  /*
   * Turn the page, and only then.
   *
   * While the line being played is on screen nothing moves, which is the whole
   * point of this view. When it is not, it goes to the top: that is the choice
   * that leaves the most unplayed music in front of the reader, and a reader
   * who cannot see what is coming is not sight-reading.
   */
  React.useEffect(() => {
    const box = scrollRef.current
    if (!box || !current || size.height === 0) return
    const top = current.top * scale
    const bottom = (current.top + current.height) * scale
    if (top < box.scrollTop || bottom > box.scrollTop + size.height)
      box.scrollTop = Math.max(0, top - (SYSTEM_SPACING * scale) / 2)
  }, [current, size.height, scale])

  return (
    <div ref={frameRef} className="staff-fit">
      <div ref={scrollRef} className="staff-sheet">
        <svg
          viewBox={`0 0 ${Math.max(pageWidth, 1)} ${pageHeight}`}
          width={size.width || undefined}
          height={Math.round(pageHeight * scale) || undefined}
          preserveAspectRatio="xMinYMin meet"
          className="staff"
          role="img"
          aria-label={label}
        >
          {systems.map((system) => (
            <g key={system.from} transform={`translate(0 ${system.origin})`}>
              <StaffFrame width={pageWidth} />
              {/* The key is restated on every line, the way printed music does
                  it; the metre is stated once and then assumed. */}
              <Signatures
                fifths={fifths}
                beats={beats}
                beatType={beatType}
                withTime={system.from === 0}
              />
              <BarLines lines={barLinesIn(system.placed)} />
              {system.placed.map((entry) => (
                <StepAt
                  key={entry.index}
                  placed={entry}
                  role={roleFor(entry.index)}
                  fifths={fifths}
                  hints={hints}
                />
              ))}
              {system === current && <Playhead x={system.placed[here - system.from]!.x} />}
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}

/** Watched if it is near the playhead, drawn once and left alone if it is not. */
function StepAt({
  placed,
  role,
  fifths,
  hints,
}: {
  placed: Placed
  role: Role
  fifths: number
  hints: ReadonlySet<SongNote>
}) {
  return isLive(role) ? (
    <LiveStep placed={placed} role={role} fifths={fifths} hints={hints} />
  ) : (
    <Step placed={placed} role={role} fifths={fifths} lit="" hints={hints} />
  )
}
