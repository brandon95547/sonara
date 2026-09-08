import {
  keySignature,
  ledgerSteps,
  needsAccidental,
  stemDirection,
  staffPlacement,
  type StaffPlacement,
  type WrittenValue,
} from '@sonara/shared'
import { STEP, yOn } from './staff-frame'

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
/** Half a ledger line, which reaches wider than the head it carries. */
const LEDGER_RX = STEP * 2.2

/*
 * The numbers below are the glyphs, measured.
 *
 * At the sizes the stylesheet sets, a sharp is 10.5 units across and 26.5
 * tall, and a fingering numeral 4.3 by 12.2. Guessing at those is what put
 * fingerings on top of each other and accidental columns eight staff spaces
 * out from the notes they belonged to, so they are measurements now.
 */

/** The sharp's ink, from its own anchor point. */
const SHARP_INK = { width: 10.5, above: 21.3, below: 5.4 }
/** The fingering numeral's ink, from its own anchor point. It is centred. */
const FINGER_INK = { half: 2.2, above: 9.8, below: 2.5 }

/** The pitch of a column of accidentals: the sharp, plus air. */
const ACCIDENTAL_WIDTH = STEP * 2.4
/** The air between the chord and the first column of accidentals. */
const ACCIDENTAL_GAP = STEP * 0.4
/** How far apart two accidentals must be to share a column — a sharp is tall. */
const ACCIDENTAL_CLEAR = 6
/** The least vertical room between two fingering numerals. */
const FINGER_CLEAR = STEP * 2.8
/** How far the fingering column sits from the chord. */
const MARGIN = STEP * 1.5
/**
 * Half the width of a drawn line.
 *
 * Stems and ledger lines are geometry to place and ink to look at, and the ink
 * is wider than the geometry. Small enough not to matter to the spacing, big
 * enough that what the extent promises is what the page actually gets.
 */
const STROKE = 1

export interface DrawnNote {
  readonly note: number
  readonly finger?: number
  /** Whether this pitch is under a finger right now. */
  readonly sounding?: boolean
}

/**
 * Where every mark of one staff's chord goes.
 *
 * Worked out as a whole rather than note by note, because most of engraving is
 * about what two marks do to each other. A note cannot decide alone where its
 * accidental goes, or its fingering, or which side of the stem its head sits
 * on — those answers depend on its neighbours, and the chord is the smallest
 * thing that knows them all.
 *
 * Separate from the drawing so the page can ask how much room a chord needs
 * before deciding where to put the next one.
 */
function layout(x: number, notes: readonly DrawnNote[], value: WrittenValue, fifths: number) {
  const placed = notes
    .map((note) => ({ ...note, placement: staffPlacement(note.note) }))
    .sort((a, b) => a.placement.steps - b.placement.steps)
  if (placed.length === 0) return null

  const staff = placed[0]!.placement.staff
  const up = stemDirection(placed.map((entry) => entry.placement)) === 'up'
  const sounding = placed.some((entry) => entry.sounding)

  /*
   * Which heads sit across the stem rather than beside it.
   *
   * Two notes a second apart cannot share a side; their heads would land on
   * top of each other. One crosses the stem — and which one is not arbitrary:
   * with the stem up it is the upper note that moves right, with the stem down
   * the lower note that moves left, so the displaced head always ends up on
   * the far side of the stem from the column.
   */
  const shifted = placed.map(() => false)
  if (up) {
    for (let i = 1; i < placed.length; i++)
      if (placed[i]!.placement.steps - placed[i - 1]!.placement.steps === 1 && !shifted[i - 1])
        shifted[i] = true
  } else {
    for (let i = placed.length - 2; i >= 0; i--)
      if (placed[i + 1]!.placement.steps - placed[i]!.placement.steps === 1 && !shifted[i + 1])
        shifted[i] = true
  }
  // Exactly one notehead across, so the two share an edge and neither eats the
  // other — which is what a second looks like in print.
  const offset = up ? HEAD_RX * 2 : -HEAD_RX * 2
  const headX = placed.map((_, index) => (shifted[index] ? x + offset : x))

  /*
   * The stem.
   *
   * An octave long, which is the conventional length, but never stopping short
   * of the middle line: a note far above or below the staff needs a stem that
   * reaches back towards it, or the chord floats free of the system it belongs
   * to. Engravers lengthen rather than shorten, so the clamp only ever adds.
   */
  const stemX = up ? x + HEAD_RX * 0.95 : x - HEAD_RX * 0.95
  const middle = staff === 'treble' ? 6 : -6
  const outer = up ? placed.at(-1)! : placed[0]!
  const reach = outer.placement.steps + (up ? STEM_STEPS : -STEM_STEPS)
  const stemEnd = yOn(up ? Math.max(reach, middle) : Math.min(reach, middle), staff)
  const stemStart = yOn(placed[up ? 0 : placed.length - 1]!.placement.steps, staff)

  /*
   * Ledger lines, once each.
   *
   * Two notes below the staff ask for most of the same lines, and drawing one
   * per note stacks them: identical to look at, until one note is sounding and
   * the other is not and whichever draws last decides the colour. Gathered
   * here instead, each line spanning the heads that need it and lit if any of
   * them is.
   */
  const ledgers = new Map<number, { from: number; to: number; sounding: boolean }>()
  for (const [index, entry] of placed.entries())
    for (const steps of ledgerSteps(entry.placement)) {
      const line = ledgers.get(steps)
      ledgers.set(steps, {
        from: Math.min(line?.from ?? Infinity, headX[index]! - LEDGER_RX),
        to: Math.max(line?.to ?? -Infinity, headX[index]! + LEDGER_RX),
        sounding: (line?.sounding ?? false) || (entry.sounding ?? false),
      })
    }

  // What the heads and their lines actually cover.
  const reachOf = (index: number) =>
    ledgerSteps(placed[index]!.placement).length > 0 ? LEDGER_RX : HEAD_RX
  const headLeft = Math.min(...headX.map((at, index) => at - reachOf(index)))
  const headRight = Math.max(
    ...headX.map((at, index) => at + reachOf(index)),
    up ? stemX : -Infinity,
  )

  /*
   * Accidentals, in columns to the left of the chord.
   *
   * A sharp stands more than five steps tall, so two of them closer than a
   * seventh collide if they share a column and the lower one has to move out.
   * An engraver works down from the top and outwards, which is what this does.
   * It is the difference between a dense chord you can read and a stack of
   * sharps you cannot.
   */
  const columns: number[][] = []
  const column = new Map<number, number>()
  for (let i = placed.length - 1; i >= 0; i--) {
    const entry = placed[i]!
    if (!needsAccidental(entry.note, fifths)) continue
    let at = 0
    while (columns[at]?.some((steps) => Math.abs(steps - entry.placement.steps) < ACCIDENTAL_CLEAR))
      at += 1
    ;(columns[at] ??= []).push(entry.placement.steps)
    column.set(entry.note, at)
  }
  const accidentalX = (note: number) =>
    headLeft - ACCIDENTAL_GAP - (column.get(note)! + 1) * ACCIDENTAL_WIDTH

  // Dots go in one column clear of the whole chord, not each beside its own
  // head, so a displaced head cannot push its dot into the stem.
  const dotX = headRight + STEP * 0.9
  const inked = value.dotted ? dotX + STEP * 0.5 : headRight

  /*
   * Fingerings, in one column to the right of the chord.
   *
   * To the right because that is the side the accidentals are not on. Putting
   * them opposite the stem instead reads well until a chord carries four
   * sharps, at which point the column is driven so far out that it lands on
   * the previous chord — which is exactly what it did.
   *
   * Each sits level with its own note; any that would overlap are pushed
   * apart, then the whole column is re-centred on the chord so the spreading
   * is shared rather than piled onto the top note. Two notes a second apart
   * are five units apart while the numerals are twelve tall, so this is a
   * collision by construction, not bad luck.
   */
  const fingerX = inked + MARGIN
  const fingerY: number[] = []
  for (const [index, entry] of placed.entries()) {
    let at = yOn(entry.placement.steps, staff) + STEP * 0.75
    const below = fingerY[index - 1]
    // The list runs bottom to top and a lower step has the larger y, so each
    // numeral has to clear the one under it.
    if (below !== undefined && below - at < FINGER_CLEAR) at = below - FINGER_CLEAR
    fingerY.push(at)
  }
  const spread = (yOn(placed.at(-1)!.placement.steps, staff) + STEP * 0.75 - fingerY.at(-1)!) / 2
  for (const [index, at] of fingerY.entries()) fingerY[index] = at + spread

  /*
   * How far the chord reaches up and down.
   *
   * The frame used to be a fixed height, and anything past it was simply not
   * drawn: a chord in the top octave lost its noteheads, its ledger lines and
   * its fingering, silently, with the staff underneath looking perfectly
   * normal. The page asks for this and grows to fit.
   */
  const marked = placed.some((entry) => entry.finger !== undefined)
  const ys = [
    ...placed.map((entry) => yOn(entry.placement.steps, staff)),
    ...[...ledgers.keys()].map((steps) => yOn(steps, staff)),
  ]
  let top = Math.min(stemStart, stemEnd, ...ys.map((at) => at - HEAD_RY))
  let bottom = Math.max(stemStart, stemEnd, ...ys.map((at) => at + HEAD_RY))
  for (const [index, entry] of placed.entries()) {
    if (entry.finger !== undefined) {
      top = Math.min(top, fingerY[index]! - FINGER_INK.above)
      bottom = Math.max(bottom, fingerY[index]! + FINGER_INK.below)
    }
    if (column.has(entry.note)) {
      const at = yOn(entry.placement.steps, staff) + STEP * 0.9
      top = Math.min(top, at - SHARP_INK.above)
      bottom = Math.max(bottom, at + SHARP_INK.below)
    }
  }

  return {
    placed,
    staff,
    up,
    sounding,
    headX,
    stemX,
    stemStart,
    stemEnd,
    ledgers,
    accidentalX,
    column,
    dotX,
    fingerX,
    fingerY,
    /** How far the ink reaches either side of the chord's own position. */
    left:
      headLeft -
      x -
      STROKE -
      (columns.length > 0 ? ACCIDENTAL_GAP + columns.length * ACCIDENTAL_WIDTH : 0),
    right: (marked ? fingerX + FINGER_INK.half : inked) - x + STROKE,
    top: top - STROKE,
    bottom: bottom + STROKE,
  }
}

/**
 * How much room a chord needs: sideways from where it sits, and up and down.
 *
 * Sideways is relative to the chord's own position, so the page can decide
 * where to put the next one. Up and down are absolute, because the staff is.
 */
export function chordExtent(
  notes: readonly DrawnNote[],
  value: WrittenValue | { readonly treble: WrittenValue; readonly bass: WrittenValue },
  fifths = 0,
): { left: number; right: number; top: number; bottom: number } {
  const per = 'treble' in value ? value : { treble: value, bass: value }
  let left = 0
  let right = 0
  let top = 0
  let bottom = 0
  for (const staff of ['treble', 'bass'] as const) {
    const on = notes.filter((note) => staffPlacement(note.note).staff === staff)
    const box = layout(0, on, per[staff], fifths)
    if (!box) continue
    left = Math.min(left, box.left)
    right = Math.max(right, box.right)
    top = Math.min(top, box.top)
    bottom = Math.max(bottom, box.bottom)
  }
  return { left: -left, right, top, bottom }
}

/** One staff's worth of a chord, drawn where `layout` says it goes. */
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
  const box = layout(x, notes, value, fifths)
  if (!box) return null
  const { placed, staff, up, sounding } = box

  return (
    <>
      {[...box.ledgers].map(([steps, line]) => (
        <line
          key={steps}
          x1={line.from}
          y1={yOn(steps, staff)}
          x2={line.to}
          y2={yOn(steps, staff)}
          className="staff__ledger"
          data-sounding={line.sounding ? 'true' : undefined}
        />
      ))}
      {value.stemmed && (
        <line
          x1={box.stemX}
          y1={box.stemStart}
          x2={box.stemX}
          y2={box.stemEnd}
          className="staff__stem"
          data-sounding={sounding ? 'true' : undefined}
        />
      )}
      {value.stemmed && value.flags > 0 && (
        <Flags x={box.stemX} yEnd={box.stemEnd} up={up} count={value.flags} sounding={sounding} />
      )}

      {placed.map((entry, index) => (
        <Head
          key={entry.note}
          x={box.headX[index]!}
          placement={entry.placement}
          value={value}
          accidentalX={box.column.has(entry.note) ? box.accidentalX(entry.note) : null}
          dotX={box.dotX}
          finger={entry.finger}
          fingerAt={{ x: box.fingerX, y: box.fingerY[index]! }}
          sounding={entry.sounding ?? false}
        />
      ))}
    </>
  )
}

function Head({
  x,
  placement,
  value,
  accidentalX,
  dotX,
  finger,
  fingerAt,
  sounding,
}: {
  x: number
  placement: StaffPlacement
  value: WrittenValue
  /** Where its accidental goes, or null when the key already accounts for it. */
  accidentalX: number | null
  dotX: number
  finger?: number
  fingerAt: { x: number; y: number }
  sounding: boolean
}) {
  const staff = placement.staff
  const cy = yOn(placement.steps, staff)

  return (
    <g
      className={`staff__note${value.filled ? '' : ' staff__note--hollow'}`}
      data-sounding={sounding ? 'true' : undefined}
    >
      <ellipse cx={x} cy={cy} rx={HEAD_RX} ry={HEAD_RY} transform={`rotate(-18 ${x} ${cy})`} />
      {value.dotted && (
        // In the space beside the note, never on a line: a dot on a line is
        // invisible.
        <circle
          cx={dotX}
          cy={yOn(placement.steps % 2 === 0 ? placement.steps + 1 : placement.steps, staff)}
          r={STEP * 0.42}
          className="staff__dot"
        />
      )}
      {accidentalX !== null && (
        <text x={accidentalX} y={cy + STEP * 0.9} className="staff__accidental">
          ♯
        </text>
      )}
      {finger !== undefined && (
        <text x={fingerAt.x} y={fingerAt.y} className="staff__finger">
          {finger}
        </text>
      )}
    </g>
  )
}

/** Flags, curling away from the notehead and stacking downward. */
function Flags({
  x,
  yEnd,
  up,
  count,
  sounding,
}: {
  x: number
  yEnd: number
  up: boolean
  count: number
  sounding?: boolean
}) {
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
            data-sounding={sounding ? 'true' : undefined}
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
  const spacing = STEP * 2.4

  return (
    <g className="staff__key">
      {(['treble', 'bass'] as const).flatMap((staff) =>
        keySignature(fifths, staff).map((mark, index) => (
          <text
            key={`${staff}-${index}`}
            x={x + index * spacing}
            y={yOn(mark.steps, staff) + STEP * 0.9}
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
 * Both numerals come from the score. Deriving them from `beatsPerMeasure`, as
 * this used to, counts the bar in crotchets and prints the result: a bar of 7/8
 * is three and a half of them, and `3.5/4` is a metre nothing has been written
 * in.
 */
export function TimeSignature({
  x,
  beats,
  beatType,
}: {
  x: number
  beats: number
  beatType: number
}) {
  if (!(beats > 0) || !(beatType > 0)) return null

  return (
    <g className="staff__time">
      {(['treble', 'bass'] as const).map((staff) => {
        const middle = staff === 'treble' ? 6 : -6
        return (
          <g key={staff}>
            {/* Two numerals, each filling half the staff: the upper one across
                the top two spaces and the lower across the bottom two. No line
                between them — a slash reads as a fraction, not as a metre. */}
            <text x={x} y={yOn(middle + 2, staff) + STEP * 1.5} className="staff__time-digit">
              {beats}
            </text>
            <text x={x} y={yOn(middle - 2, staff) + STEP * 1.5} className="staff__time-digit">
              {beatType}
            </text>
          </g>
        )
      })}
    </g>
  )
}
