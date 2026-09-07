import {
  keySignature,
  ledgerSteps,
  needsAccidental,
  stemDirection,
  staffPlacement,
  type StaffPlacement,
  type WrittenValue,
} from '@sonara/shared'
import { STEP, y } from './staff-frame'

/**
 * Notes, drawn the way notes are drawn.
 *
 * One renderer for every staff in the app, because a note should not look
 * different depending on which tab you found it in.
 *
 * What makes a notehead read as notation rather than as a dot is mostly the
 * stem: which side it leaves from, which way it goes, and that a chord has one
 * rather than one each. The rest is the difference between a filled head and a
 * hollow one, the flags, and the dot.
 */

/** A stem is an octave long — seven letter-steps — unless the note is far out. */
const STEM_STEPS = 7
const HEAD_RX = STEP * 1.35
const HEAD_RY = STEP * 0.98

export interface DrawnNote {
  readonly note: number
  readonly finger?: number
}

/**
 * One staff's worth of a chord: the noteheads, and the single stem they share.
 *
 * Notes a second apart cannot both sit on the same side of the stem — an
 * engraver puts the upper one across it — which is the one piece of chord
 * spacing that is not optional, because otherwise the two heads overlap
 * exactly.
 */
function StaffGroup({
  x,
  notes,
  value,
  fifths,
}: {
  x: number
  notes: readonly DrawnNote[]
  value: WrittenValue
  fifths: number
}) {
  const placed = notes
    .map((note) => ({ ...note, placement: staffPlacement(note.note) }))
    .sort((a, b) => a.placement.steps - b.placement.steps)
  if (placed.length === 0) return null

  const direction = stemDirection(placed.map((entry) => entry.placement))
  const up = direction === 'up'

  // Which heads sit across the stem rather than beside it.
  const shifted = placed.map((entry, index) => {
    const below = placed[index - 1]
    return below !== undefined && entry.placement.steps - below.placement.steps === 1
  })
  // A run of seconds alternates; a head shifted off one already-shifted head
  // belongs back on the near side.
  for (let i = 1; i < shifted.length; i++) if (shifted[i - 1]) shifted[i] = false

  const stemX = up ? x + HEAD_RX * 0.92 : x - HEAD_RX * 0.92
  const outer = up ? placed.at(-1)! : placed[0]!
  const stemEnd = y(outer.placement.steps + (up ? STEM_STEPS : -STEM_STEPS))
  const stemStart = y(placed[up ? 0 : placed.length - 1]!.placement.steps)

  return (
    <>
      {value.stemmed && (
        <line x1={stemX} y1={stemStart} x2={stemX} y2={stemEnd} className="staff__stem" />
      )}
      {value.stemmed && value.flags > 0 && (
        <Flags x={stemX} yEnd={stemEnd} up={up} count={value.flags} />
      )}

      {placed.map((entry, index) => (
        <Head
          key={entry.note}
          x={x + (shifted[index] ? (up ? HEAD_RX * 1.84 : -HEAD_RX * 1.84) : 0)}
          placement={entry.placement}
          value={value}
          accidental={needsAccidental(entry.note, fifths)}
          finger={entry.finger}
        />
      ))}
    </>
  )
}

function Head({
  x,
  placement,
  value,
  accidental,
  finger,
}: {
  x: number
  placement: StaffPlacement
  value: WrittenValue
  accidental: boolean
  finger?: number
}) {
  const cy = y(placement.steps)

  return (
    <g className={`staff__note${value.filled ? '' : ' staff__note--hollow'}`}>
      {ledgerSteps(placement).map((steps) => (
        <line
          key={steps}
          x1={x - STEP * 2.2}
          y1={y(steps)}
          x2={x + STEP * 2.2}
          y2={y(steps)}
          className="staff__ledger"
        />
      ))}
      <ellipse cx={x} cy={cy} rx={HEAD_RX} ry={HEAD_RY} transform={`rotate(-18 ${x} ${cy})`} />
      {value.dotted && (
        // In the space beside the note, never on a line: a dot on a line is
        // invisible.
        <circle
          cx={x + HEAD_RX * 2.1}
          cy={y(placement.steps % 2 === 0 ? placement.steps + 1 : placement.steps)}
          r={STEP * 0.42}
          className="staff__dot"
        />
      )}
      {accidental && (
        <text x={x - STEP * 3.6} y={cy + STEP * 0.9} className="staff__accidental">
          ♯
        </text>
      )}
      {finger !== undefined && (
        <text x={x} y={cy - STEP * 2.6} className="staff__finger">
          {finger}
        </text>
      )}
    </g>
  )
}

/** Flags, curling away from the notehead and stacking downward. */
function Flags({ x, yEnd, up, count }: { x: number; yEnd: number; up: boolean; count: number }) {
  const step = up ? STEP * 1.6 : -STEP * 1.6
  const reach = STEP * 2.6
  const drop = up ? STEP * 3.4 : -STEP * 3.4

  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const top = yEnd + i * step
        return (
          <path
            key={i}
            d={`M ${x} ${top} q ${reach} ${drop * 0.35} ${reach * 0.75} ${drop} q ${-reach * 0.2} ${-drop * 0.55} ${-reach * 0.75} ${-drop * 0.85} z`}
            className="staff__flag"
          />
        )
      })}
    </>
  )
}

/**
 * Everything sounding at one moment, on both staves.
 *
 * Split by staff first, because each has its own middle line and therefore its
 * own stem direction — a chord spanning both hands has two stems, one per
 * staff, which is exactly how it is written.
 */
export function Chord({
  x,
  notes,
  value,
  fifths = 0,
}: {
  x: number
  notes: readonly DrawnNote[]
  /**
   * How long these are written as — one value, or one per staff.
   *
   * Per staff matters more than it sounds. The two hands keep their own rhythm:
   * a bar-long chord under a run of quavers is a semibreve under quavers, and
   * making both share the melody's value writes the chord as a crotchet and
   * puts a stem on something that should not have one.
   */
  value: WrittenValue | { readonly treble: WrittenValue; readonly bass: WrittenValue }
  fifths?: number
}) {
  const treble = notes.filter((note) => staffPlacement(note.note).staff === 'treble')
  const bass = notes.filter((note) => staffPlacement(note.note).staff === 'bass')
  const per = 'treble' in value ? value : { treble: value, bass: value }

  return (
    <>
      <StaffGroup x={x} notes={treble} value={per.treble} fifths={fifths} />
      <StaffGroup x={x} notes={bass} value={per.bass} fifths={fifths} />
    </>
  )
}

/** The key signature, drawn once after the clefs. */
export function KeySignature({ x, fifths }: { x: number; fifths: number }) {
  if (fifths === 0) return null
  const spacing = STEP * 2.1

  return (
    <g className="staff__key">
      {(['treble', 'bass'] as const).flatMap((staff) =>
        keySignature(fifths, staff).map((mark, index) => (
          <text
            key={`${staff}-${index}`}
            x={x + index * spacing}
            y={y(mark.steps) + STEP * 0.9}
            className="staff__accidental"
          >
            {mark.sign}
          </text>
        )),
      )}
    </g>
  )
}

/**
 * The time signature, after the key.
 *
 * Two digits stacked, on both staves, with no line between them — that is how
 * it is engraved, and a slash would read as a fraction rather than a metre.
 * The lower number is always 4 here: a beat in this app is a crotchet, which
 * is what `beatsPerMeasure` counts.
 */
export function TimeSignature({ x, beats }: { x: number; beats: number }) {
  if (!(beats > 0)) return null

  return (
    <g className="staff__time">
      {([6, -6] as const).map((middle) => (
        <g key={middle}>
          <text x={x} y={y(middle + 2) + STEP * 0.9} className="staff__time-digit">
            {beats}
          </text>
          <text x={x} y={y(middle - 2) + STEP * 0.9} className="staff__time-digit">
            4
          </text>
        </g>
      ))}
    </g>
  )
}
