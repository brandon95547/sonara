import {
  accidentalToShow,
  ACCIDENTAL_SIGNS,
  keySignature,
  ledgerSteps,
  staffFor,
  stemDirection,
  staffPlacement,
  type Accidental,
  type Hand,
  type Spelling,
  type Staff,
  type StaffPlacement,
  type WrittenValue,
} from '@sonara/shared'
import { STEP, yOn } from './staff-frame'
import type { StemOverride, StepStems } from './beams'

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
export const STEM_STEPS = 7
const HEAD_RX = STEP * 1.35
const HEAD_RY = STEP * 0.98
/** Half a ledger line, which reaches wider than the head it carries. */
const LEDGER_RX = STEP * 2.2
/** How far a ledger line still reaches past its head where a sign sits beside it. */
const LEDGER_STUB = STEP * 0.2
/** The room the arpeggio sign takes, outside everything else on the left. */
const ARPEGGIO_WIDTH = STEP * 2.2
/** The air between the arpeggio sign and whatever of the chord is leftmost. */
const ARPEGGIO_GAP = STEP * 0.4

/*
 * The numbers below are the glyphs, measured.
 *
 * Guessing at them is what put fingerings on top of each other and accidental
 * columns eight staff spaces out from the notes they belonged to, so they are
 * measurements now — and measurements of the ink, not of the box the glyph is
 * set in. The box is what `getBBox` reports and it is far bigger than the
 * sign: a sharp's is 10.5 by 20 around ink that is 6.8 by 15.9. Keeping the
 * box clear of the chord is what left a sharp standing a notehead's width away
 * from the note it belonged to.
 */

/**
 * An accidental's ink, from its anchor: the right edge of the glyph, on the
 * baseline.
 *
 * Which glyph is drawn depends on the machine — `--font-music` is a stack of
 * faces that may or may not be installed — so this is the most any of them
 * reaches, measured with `measureText` at the size the stylesheet sets. Every
 * accidental is given that room. A flat is shorter and a natural narrower, so
 * it over-reserves for them, which costs a little white space and can never
 * let two signs touch.
 *
 * Anchored on the right because that is the edge that has to sit against the
 * note. The faces disagree by three units about how wide a sharp is and by
 * rather less about how much air it carries on its right.
 */
const SIGN_INK = { width: 11, above: 16.5, below: 2.5 }
/** The fingering numeral's ink, from its own anchor point. It is centred. */
const FINGER_INK = { half: 2.2, above: 9.8, below: 2.5 }

/** The pitch of a column of accidentals: the sign, plus air. */
const ACCIDENTAL_WIDTH = STEP * 2.4
/**
 * The air between a sign's glyph and what it sits against.
 *
 * Small, because the glyph brings air of its own: two units of it on the
 * right, in the face a Mac draws these with.
 */
const ACCIDENTAL_GAP = STEP * 0.1
/**
 * How far apart two accidentals must be to share a column.
 *
 * A seventh, which is the engraver's rule rather than a measurement: closer
 * than that and two signs read as one mark even when their ink does not touch.
 */
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
  /** Part of a chord too wide to close on at once, so it is spread. */
  readonly rolled?: boolean
  /**
   * The letter and accidental it is written with.
   *
   * A MIDI number knows its pitch and not its name, and a note that arrives
   * without one is spelled with sharps — which is the wrong note to a reader
   * in every flat key. Whoever knows the score passes the spelling in.
   */
  readonly spelling?: Spelling | null
  /**
   * Which hand plays it, where anything knows.
   *
   * It decides the staff. Piano music writes the left hand in the bass
   * wherever the notes fall — a left-hand chord above middle C carries ledger
   * lines rather than moving into the treble.
   */
  readonly hand?: Hand | null
  /**
   * The sign to print in front of it, or `null` for none.
   *
   * Decided by whoever knows the bar, because an accidental holds for the rest
   * of one and no chord can see the chord before it. Left `undefined` by the
   * live staff, which draws a single moment and asks the key instead.
   */
  readonly accidental?: Accidental | null
  /**
   * A tied note's second notehead: written here, and not struck here.
   *
   * It is drawn as a note, because that is what the page shows, and joined to
   * the head before it by a tie. It is never the note to play: the key is
   * already down.
   */
  readonly held?: boolean
}

/** A tie arriving at a notehead: which note, and where the head it comes from stands. */
export interface TieArc {
  readonly note: number
  /** The step the tie comes from, or null where that is on another line. */
  readonly fromX: number | null
}

/** How far a tie that runs off the end of a line, or arrives from the line before, is drawn. */
const TIE_STUB = STEP * 5

/**
 * A tie: a thin crescent from one notehead to the next, clear of both.
 *
 * Curving away from the stem, the way one is engraved — and, where a staff has
 * two voices, away from the other voice, which is the same side as the stem.
 */
function tiePath(from: number, to: number, y: number, above: boolean): string {
  const side = above ? -1 : 1
  const base = y + side * STEP * 0.95
  const bow = side * Math.min(STEP * 1.5, STEP * 0.7 + (to - from) * 0.05)
  const middle = (from + to) / 2
  return (
    `M ${from} ${base} Q ${middle} ${base + bow * 2} ${to} ${base} ` +
    `Q ${middle} ${base + bow * 2 - side * STEP * 0.42} ${from} ${base} Z`
  )
}

/**
 * One voice's notes at a moment, on one staff: a chord with a stem of its own.
 *
 * A staff can carry two lines at once, a melody over held notes, and each is
 * written as itself: its own length, and its stem pointing away from the other
 * so the eye can follow either. One stem for everything on the staff, which is
 * all this drew before, has to give the whole chord one length — and a crotchet
 * of melody over a held minim came out as a minim.
 */
export interface VoicePart {
  readonly staff: Staff
  readonly notes: readonly DrawnNote[]
  readonly value: WrittenValue
  /**
   * The way its stem must point: up for the upper voice, down for the lower.
   * Absent where the staff has one voice and the notes decide.
   */
  readonly stem?: 'up' | 'down'
  /** How far it stands to the right of the step, to clear the other voice's heads. */
  readonly dx: number
}

/** How far the lower voice steps aside when its heads would land on the upper voice's. */
export const VOICE_SHIFT = STEP * 1.35 * 2 + STEP * 0.5

/** Which staff a note is written on: its hand's, where a hand is known. */
export const staffOf = (note: DrawnNote): Staff => staffFor(note.note, note.hand)

export const placementOf = (note: DrawnNote): StaffPlacement =>
  staffPlacement(note.note, note.spelling, staffOf(note))

/** Where a chord's stem stands: on the right of the heads going up, the left going down. */
export const stemXFor = (x: number, up: boolean) => (up ? x + HEAD_RX * 0.95 : x - HEAD_RX * 0.95)

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
function layout(
  x: number,
  notes: readonly DrawnNote[],
  value: WrittenValue,
  fifths: number,
  /** The stem a beam has decided: its direction and where it ends. */
  stem?: StemOverride,
  /** The way the stem must point, where the voice decides and no beam has. */
  direction?: 'up' | 'down',
) {
  const placed = notes
    .map((note) => ({ ...note, placement: placementOf(note) }))
    .sort((a, b) => a.placement.steps - b.placement.steps)
  if (placed.length === 0) return null

  const staff = placed[0]!.placement.staff
  // Under a beam the group decides the direction, not this chord.
  const up = stem
    ? stem.up
    : direction
      ? direction === 'up'
      : stemDirection(placed.map((entry) => entry.placement)) === 'up'
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
  const stemX = stemXFor(x, up)
  const middle = staff === 'treble' ? 6 : -6
  const outer = up ? placed.at(-1)! : placed[0]!
  const reach = outer.placement.steps + (up ? STEM_STEPS : -STEM_STEPS)
  // A beamed stem ends on its beam, which is wherever the group put it.
  const stemEnd = stem
    ? stem.end
    : yOn(up ? Math.max(reach, middle) : Math.min(reach, middle), staff)
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
  const ledgers = new Map<number, { from: number; to: number; head: number; sounding: boolean }>()
  for (const [index, entry] of placed.entries())
    for (const steps of ledgerSteps(entry.placement)) {
      const line = ledgers.get(steps)
      ledgers.set(steps, {
        from: Math.min(line?.from ?? Infinity, headX[index]! - LEDGER_RX),
        to: Math.max(line?.to ?? -Infinity, headX[index]! + LEDGER_RX),
        // Where the leftmost head on the line begins, for the line to be cut
        // back to when a sign needs the room.
        head: Math.min(line?.head ?? Infinity, headX[index]! - HEAD_RX),
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
   * Accidentals, each against whatever is actually beside it.
   *
   * A sign belongs to one note and has to read as part of it, so it goes as
   * close to that note as the ink allows. What is in its way is only what
   * shares its height: its own head, a head displaced across the stem at a
   * second, a down-stem, a ledger line. This used to clear the widest point of
   * the whole chord instead, and a sharp three steps above a displaced head, or
   * level with nothing but another note's ledger line, stood off in the margin
   * looking like it belonged to no note at all.
   *
   * Signs then keep clear of each other. Two closer than a seventh cannot share
   * a column, so the later one moves out past the earlier — working down from
   * the top and outwards, which is how an engraver does it. It is the
   * difference between a dense chord you can read and a stack of sharps you
   * cannot.
   */
  const signY = (steps: number) => yOn(steps, staff) + STEP * 0.9
  const signBand = (steps: number) => ({
    top: signY(steps) - SIGN_INK.above,
    bottom: signY(steps) + SIGN_INK.below,
  })
  // Whoever knew the bar has already decided. The live staff has no bar to
  // remember in, so its notes arrive undecided and the key answers.
  const shown = placed.map((entry) =>
    entry.accidental !== undefined ? entry.accidental : accidentalToShow(entry.placement, fifths),
  )

  /*
   * A ledger line gives way to a sign.
   *
   * It reaches well past its notehead, and a sign kept clear of that reach is
   * a sign kept away from its note. So the line is cut back on that side to a
   * stub, the way it is in print, and the sign takes the room.
   */
  for (const [index, entry] of placed.entries()) {
    // A natural is 0, so this has to ask for null and not for falsy.
    if (shown[index] == null) continue
    const { top, bottom } = signBand(entry.placement.steps)
    for (const [steps, line] of ledgers) {
      const y = yOn(steps, staff)
      if (y + STROKE > top && y - STROKE < bottom)
        ledgers.set(steps, { ...line, from: Math.max(line.from, line.head - LEDGER_STUB) })
    }
  }

  const stemTop = Math.min(stemStart, stemEnd)
  const stemBottom = Math.max(stemStart, stemEnd)
  const signs = new Map<number, { x: number; steps: number; sign: Accidental }>()
  for (let i = placed.length - 1; i >= 0; i--) {
    const sign = shown[i]
    if (sign == null) continue
    const steps = placed[i]!.placement.steps
    const { top, bottom } = signBand(steps)

    // The right edge of the glyph: left of everything at this height.
    let at = Infinity
    for (const [index, other] of placed.entries()) {
      const y = yOn(other.placement.steps, staff)
      if (y + HEAD_RY > top && y - HEAD_RY < bottom) at = Math.min(at, headX[index]! - HEAD_RX)
    }
    for (const [line, { from }] of ledgers) {
      const y = yOn(line, staff)
      if (y + STROKE > top && y - STROKE < bottom) at = Math.min(at, from - STROKE)
    }
    if (value.stemmed && stemBottom > top && stemTop < bottom) at = Math.min(at, stemX - STROKE)
    at -= ACCIDENTAL_GAP

    // Then out past any sign it would crowd, until it crowds none.
    for (let moved = true; moved;) {
      moved = false
      for (const other of signs.values()) {
        if (Math.abs(other.steps - steps) >= ACCIDENTAL_CLEAR) continue
        if (at > other.x - ACCIDENTAL_WIDTH && at - ACCIDENTAL_WIDTH < other.x) {
          at = other.x - ACCIDENTAL_WIDTH
          moved = true
        }
      }
    }
    signs.set(placed[i]!.note, { x: at, steps, sign })
  }
  // The leftmost ink of the chord itself: its heads, or a sign beyond them.
  const chordLeft = Math.min(
    headLeft,
    ...[...signs.values()].map((sign) => sign.x - ACCIDENTAL_WIDTH),
  )

  /*
   * The arpeggio sign, for a chord the hand cannot close on at once.
   *
   * Outside the accidentals, which is where an engraver puts it — it applies to
   * the whole chord, so nothing of the chord may sit outside it.
   */
  const rolled = placed.some((entry) => entry.rolled)
  const arpeggioX = chordLeft - ARPEGGIO_GAP - ARPEGGIO_WIDTH

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
    if (signs.has(entry.note)) {
      const band = signBand(entry.placement.steps)
      top = Math.min(top, band.top)
      bottom = Math.max(bottom, band.bottom)
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
    signs,
    dotX,
    fingerX,
    fingerY,
    rolled,
    arpeggioX,
    /** How far the ink reaches either side of the chord's own position. */
    left: (rolled ? arpeggioX : chordLeft) - x - STROKE,
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
    const on = notes.filter((note) => staffOf(note) === staff)
    const box = layout(0, on, per[staff], fifths)
    if (!box) continue
    left = Math.min(left, box.left)
    right = Math.max(right, box.right)
    top = Math.min(top, box.top)
    bottom = Math.max(bottom, box.bottom)
  }
  return { left: -left, right, top, bottom }
}

/** How much room a step's voices need between them, each where it stands. */
export function partsExtent(
  parts: readonly VoicePart[],
  fifths = 0,
): { left: number; right: number; top: number; bottom: number } {
  let left = 0
  let right = 0
  let top = 0
  let bottom = 0
  for (const part of parts) {
    const box = layout(part.dx, part.notes, part.value, fifths, undefined, part.stem)
    if (!box) continue
    left = Math.min(left, box.left + part.dx)
    right = Math.max(right, box.right + part.dx)
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
  stem,
  direction,
  ties,
  tiesOut,
}: {
  x: number
  notes: readonly DrawnNote[]
  value: WrittenValue
  fifths: number
  stem?: StemOverride
  direction?: 'up' | 'down'
  /** The ties arriving at this step's held notes. */
  ties?: readonly TieArc[]
  /** The notes whose tie runs on to another line. */
  tiesOut?: readonly number[]
}) {
  const box = layout(x, notes, value, fifths, stem, direction)
  if (!box) return null
  const { placed, staff, up, sounding } = box
  // Away from the stem; with two voices, away from the other voice instead.
  const above = direction ? direction === 'up' : !up
  const arcs = placed.flatMap((entry, index) => {
    const cy = yOn(entry.placement.steps, staff)
    const head = box.headX[index]!
    const drawn: string[] = []
    const arriving = entry.held ? ties?.find((tie) => tie.note === entry.note) : undefined
    if (arriving) {
      const to = head - HEAD_RX - STEP * 0.3
      const from = arriving.fromX === null ? to - TIE_STUB : arriving.fromX + HEAD_RX + STEP * 0.3
      if (to - from > STEP) drawn.push(tiePath(from, to, cy, above))
    }
    if (tiesOut?.includes(entry.note)) {
      const from = (value.dotted ? box.dotX + STEP * 0.6 : head + HEAD_RX) + STEP * 0.3
      drawn.push(tiePath(from, from + TIE_STUB, cy, above))
    }
    return drawn
  })

  const top = Math.min(...placed.map((entry) => yOn(entry.placement.steps, staff)))
  const bottom = Math.max(...placed.map((entry) => yOn(entry.placement.steps, staff)))

  return (
    <>
      {arcs.map((d) => (
        <path key={d} d={d} className="staff__tie" />
      ))}
      {box.rolled && <Arpeggio x={box.arpeggioX} from={top - HEAD_RY} to={bottom + HEAD_RY} />}
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
      {/* A beamed note has no flags: the beam is its flags, joined up. */}
      {value.stemmed && value.flags > 0 && !stem && (
        <Flags x={box.stemX} yEnd={box.stemEnd} up={up} count={value.flags} sounding={sounding} />
      )}

      {placed.map((entry, index) => (
        <Head
          key={entry.note}
          x={box.headX[index]!}
          placement={entry.placement}
          value={value}
          accidental={box.signs.get(entry.note) ?? null}
          dotX={box.dotX}
          finger={entry.finger}
          fingerAt={{ x: box.fingerX, y: box.fingerY[index]! }}
          sounding={entry.sounding ?? false}
          held={entry.held ?? false}
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
  dotX,
  finger,
  fingerAt,
  sounding,
  held,
}: {
  x: number
  placement: StaffPlacement
  value: WrittenValue
  /** Which sign to print and where its right edge goes, or null for none. */
  accidental: { x: number; sign: Accidental } | null
  dotX: number
  finger?: number
  fingerAt: { x: number; y: number }
  sounding: boolean
  held?: boolean
}) {
  const staff = placement.staff
  const cy = yOn(placement.steps, staff)

  return (
    <g
      className={`staff__note${value.filled ? '' : ' staff__note--hollow'}`}
      data-sounding={sounding ? 'true' : undefined}
      data-held={held ? 'true' : undefined}
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
      {accidental !== null && (
        <text x={accidental.x} y={cy + STEP * 0.9} textAnchor="end" className="staff__accidental">
          {ACCIDENTAL_SIGNS[accidental.sign]}
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

/**
 * The sign for a chord that is spread rather than struck.
 *
 * A wavy vertical line beside the chord, which is what the notation is and what
 * a reader already knows how to read. Drawn from one wave per staff space so it
 * grows with the chord rather than being stretched to fit it.
 */
function Arpeggio({ x, from, to }: { x: number; from: number; to: number }) {
  const wave = STEP * 2
  const count = Math.max(2, Math.round((to - from) / wave))
  let path = `M ${x} ${from}`
  for (let i = 0; i < count; i++) {
    // Alternating quarter-circles: out one side, back the other.
    const side = i % 2 === 0 ? STEP * 1.1 : -STEP * 1.1
    path += ` q ${side} ${wave / 2} 0 ${wave}`
  }
  return <path d={path} className="staff__arpeggio" />
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
  stems,
  parts,
  ties,
  tiesOut,
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
  /** The stems a beam has decided, for the staves that have one. */
  stems?: StepStems
  /**
   * The step's voices, where a staff has more than one: each drawn as a chord
   * of its own, with its own length and its stem pointing away from the other.
   */
  parts?: readonly VoicePart[]
  /** The ties arriving at this step's held notes, and the notes whose tie runs off the line. */
  ties?: readonly TieArc[]
  tiesOut?: readonly number[]
}) {
  if (parts) {
    // A beam belongs to the first voice on its staff, which is the one the
    // beaming was worked out for.
    const first = new Map<Staff, VoicePart>()
    for (const part of parts) if (!first.has(part.staff)) first.set(part.staff, part)
    return (
      <>
        {parts.map((part, index) => (
          <StaffGroup
            key={index}
            x={x + part.dx}
            notes={part.notes}
            value={part.value}
            fifths={fifths}
            stem={first.get(part.staff) === part ? stems?.[part.staff] : undefined}
            direction={part.stem}
            ties={ties}
            tiesOut={tiesOut}
          />
        ))}
      </>
    )
  }

  const treble = notes.filter((note) => staffOf(note) === 'treble')
  const bass = notes.filter((note) => staffOf(note) === 'bass')
  const per = 'treble' in value ? value : { treble: value, bass: value }

  return (
    <>
      <StaffGroup
        x={x}
        notes={treble}
        value={per.treble}
        fifths={fifths}
        stem={stems?.treble}
        ties={ties}
        tiesOut={tiesOut}
      />
      <StaffGroup
        x={x}
        notes={bass}
        value={per.bass}
        fifths={fifths}
        stem={stems?.bass}
        ties={ties}
        tiesOut={tiesOut}
      />
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
