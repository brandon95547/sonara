import { STEP, yOn } from './staff-frame'
import { Chord, KeySignature, TimeSignature } from './StaffNotes'
import { KEY_X, timeX, type Placed } from './score'

/**
 * The marks a system is made of, drawn the same way in both views.
 *
 * Sheet and Flow disagree about where a line ends and about nothing else. Every
 * piece of the picture that is not that lives here, so the two cannot drift.
 */

/** How far each chord is from the one being played, for the reading states. */
export type Role = 'played' | 'target' | 'upcoming' | 'ahead'

/** Clef, then key, then metre, each clear of the last. */
export function Signatures({
  fifths,
  beats,
  beatType,
  withTime,
}: {
  fifths: number
  beats: number
  beatType: number
  /** The metre is stated once, on the opening system. Sheet music repeats the
      key on every line and the time signature on none of them. */
  withTime: boolean
}) {
  return (
    <>
      <KeySignature x={KEY_X} fifths={fifths} />
      {withTime && <TimeSignature x={timeX(fifths)} beats={beats} beatType={beatType} />}
    </>
  )
}

/** The bar lines of one system, each numbered the way a part is. */
export function BarLines({ lines }: { lines: readonly { x: number; bar: number }[] }) {
  return (
    <>
      {lines.map(({ x, bar }) => (
        <g key={x}>
          <line x1={x} y1={yOn(10, 'treble')} x2={x} y2={yOn(-10, 'bass')} className="staff__bar" />
          {/* Numbered, so a player can say where they are out loud. */}
          <text x={x + STEP * 1.4} y={yOn(14, 'treble')} className="staff__bar-number">
            {bar}
          </text>
        </g>
      ))}
    </>
  )
}

/**
 * Where you are.
 *
 * A line, not a column: a translucent block over the music dims the very notes
 * it is pointing at, and the eye reads the block instead of them.
 */
export function Playhead({ x }: { x: number }) {
  return (
    <line x1={x} y1={yOn(12, 'treble')} x2={x} y2={yOn(-12, 'bass')} className="staff__playhead" />
  )
}

/** One chord of the score, with its reading state and whatever is sounding. */
export function Step({
  placed,
  role,
  fifths,
  sounding,
}: {
  placed: Placed
  role: Role
  fifths: number
  sounding: ReadonlySet<number>
}) {
  const notes = [...placed.step.notes].sort((a, b) => a.note - b.note)

  return (
    <g className="staff__step" data-role={role}>
      <Chord
        x={placed.x}
        notes={notes.map((note) => ({
          note: note.note,
          finger: note.finger,
          sounding: sounding.has(note.note),
        }))}
        value={placed.value}
        fifths={fifths}
      />
    </g>
  )
}
