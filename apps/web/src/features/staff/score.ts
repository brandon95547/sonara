import * as React from 'react'
import {
  AccidentalMemory,
  barIndexAt,
  songSteps,
  staffFor,
  staffPlacement,
  valueQuarters,
  written,
  writtenValue,
  type Song,
  type SongNote,
  type SongStep,
  type Staff,
  type WrittenValue,
} from '@sonara/shared'
import { HALF_HEIGHT, KEY_X, keyWidth, STEP, yOn } from './staff-frame'
import { chordExtent, staffOf, type DrawnNote } from './StaffNotes'
import type { SongPart } from '@/state/song-store'

/**
 * A song, measured — but not yet placed on a page.
 *
 * The two views draw the same music at the same size with the same fingering;
 * they disagree only about where the line ends. Flow runs one endless system
 * past a fixed playhead, Sheet breaks it into lines and stacks them. If they
 * measured separately they would drift apart, and switching between them would
 * quietly be switching between two scores.
 *
 * So the measuring happens once, here, and produces the gap before each chord
 * rather than its position. A gap is the same wherever the chord ends up; an x
 * is not.
 */

/** How much horizontal room a bar of music gets, before clamping. */
const MEASURE_WIDTH = 260
/**
 * Never closer than this, whatever else is true.
 *
 * A floor under the real constraint rather than the constraint itself: how
 * much room two chords need between them is a question about the marks they
 * are made of, and `chordExtent` answers it. A chord of four sharps reaches
 * half a bar to the left of its own noteheads, and no fixed number knows that.
 */
const MIN_GAP = 40
/** Never further than this: a held note should not push the next page away. */
const MAX_GAP = 170
/** The same two measures for the printed page, which sets its bars closer. */
const PAGE_BAR_WIDTH = 150
const PAGE_MIN_GAP = 26
/** The white space two chords keep between their ink. */
export const AIR = STEP * 3
/** The extra two chords keep when a bar line stands between them. */
const BAR_ROOM = STEP * 2
/** How far a bar number's ink rises above its own baseline, measured. */
const BAR_NUMBER_INK = 11

/** Half a time-signature numeral's measured width. */
const TIME_HALF = 9

export interface Measured {
  readonly step: SongStep
  readonly index: number
  /**
   * Its notes as the page will draw them: spelled, handed, and each carrying
   * the sign to print in front of it.
   *
   * Decided here rather than in the drawing because an accidental holds for the
   * rest of its bar, so what one chord prints depends on the chords before it —
   * and the components that draw chords are memoised, so a chord that does not
   * redraw would never be asked and the bar would forget what it had said.
   */
  readonly notes: readonly DrawnNote[]
  /** What this chord is written as, per staff — the hands keep their own rhythm. */
  readonly value: { readonly treble: WrittenValue; readonly bass: WrittenValue }
  /** How far its ink reaches, so a page can make room for it. */
  readonly extent: { left: number; right: number; top: number; bottom: number }
  /** How far after the previous chord this one sits. Zero for the first. */
  readonly gap: number
  /** Which bar it falls in, counting from one. */
  readonly bar: number
  /**
   * The beam this chord is under on each staff: a number shared by every chord
   * of the group. Absent for a note that stands alone and keeps its flags.
   */
  readonly beam?: Partial<Record<Staff, number>>
  /** The tuplet its notes on each staff belong to, where the score said. */
  readonly tuplet?: Partial<Record<Staff, { readonly id: number; readonly actual: number }>>
}

/**
 * What measuring reads from a song: its pace, its key and where its bars fall.
 *
 * Four fields rather than the whole song, so music that is not a song can be
 * written out the same way — a scale is a run of steps in a key, and nothing
 * about engraving it needs a title or a track list. A song is one of these.
 */
export interface ScoreSource {
  readonly bpm: number
  readonly measureMs: number
  readonly key?: { readonly fifths: number } | null
  /** The bars as a file laid them out. Without them, a bar is `measureMs` long. */
  readonly measures?: Song['measures']
  /**
   * How much room a bar gets before clamping, in units. A song keeps the
   * default; a scale — even steps, no rhythm to show — asks for less, so a
   * two-octave run fits the paper instead of scrolling a third of itself away.
   */
  readonly barWidth?: number
  /** The least room between two chords, in units, where `MIN_GAP` is too much. */
  readonly minGap?: number
  /**
   * Join short notes into beats with beams.
   *
   * On for material whose rhythm is stated exactly — an exercise knows every
   * note's length, and so does a song read from a score. Off for a song that
   * is a performance: grouping by the beat needs a beat to group by, and a
   * rubato bar does not have one this code can trust.
   */
  readonly beams?: boolean
}

/**
 * Every chord of the song, measured and spaced but not placed.
 *
 * Spacing is proportional to the time before each chord, so the picture keeps
 * the rhythm, but clamped at both ends: without a floor a run of semiquavers
 * becomes a smear, and without a ceiling one long held chord pushes everything
 * after it off the end of the world. Under both, the ink has the last word —
 * a crowded bar is still readable and two chords printed on top of each other
 * are not.
 */
export function measureScore(
  song: ScoreSource | null,
  steps: readonly SongStep[],
  hints?: ReadonlySet<SongNote>,
): Measured[] {
  const beat = song ? 60000 / song.bpm : 500
  const fifths = song?.key?.fifths ?? 0
  /** The bars the file laid out. Absent only for a song stored before they were read. */
  const measures = song?.measures
  /** One bar length for the whole piece, which is what spacing needs and bar lines do not. */
  const measureMs = song?.measureMs ?? 2000

  /*
   * What each staff's current bar has already said.
   *
   * One memory per staff, because the two are engraved as separate lines: a
   * sharp printed in the left hand tells a reader nothing about the right.
   */
  const memory = {
    treble: new AccidentalMemory(fifths),
    bass: new AccidentalMemory(fifths),
  }
  let openBar = Number.NaN
  let previous = 0

  const onStaff = (candidate: SongStep, staff: Staff) =>
    candidate.notes.some((note) => staffFor(note.note, note.hand) === staff)

  const measured = steps.map((step, index): Measured => {
    /*
     * Which bar this chord falls in.
     *
     * Read off the bars the file wrote, which is the only way a pickup, a
     * change of metre or a change of tempo lands where the score puts it.
     * Dividing elapsed time by one bar length draws every bar line of a piece
     * with a pickup two beats late, and every one after a rallentando further
     * out than the last.
     */
    const bar = measures
      ? measures[barIndexAt(measures, step.startMs)]!.number
      : measureMs > 0
        ? Math.floor(step.startMs / measureMs) + 1
        : 1
    /** The first chord of a bar, which has that bar's line to make room for. */
    const opensBar = index > 0 && bar !== openBar
    if (bar !== openBar) {
      memory.treble.startBar()
      memory.bass.startBar()
      openBar = bar
    }

    // How long the notes are *written* as. Where the file said, that is the
    // answer; a performance only implies its durations and a score states them.
    // Otherwise it is the time until this staff next has something — not how
    // long a key was held, because a player releasing early has played a short
    // crotchet, not a quaver.
    //
    // Per staff, because the hands keep their own rhythm. A bar-long chord
    // under a run of quavers is a semibreve, and taking the melody's value for
    // it writes it as a crotchet with a stem.
    const value = { treble: valueOn('treble'), bass: valueOn('bass') }
    function valueOn(staff: Staff): WrittenValue {
      const here = step.notes.filter((note) => staffFor(note.note, note.hand) === staff)
      if (here.length === 0) return writtenValue(beat, beat)

      // One stem per staff, so one value for the chord under it: the longest,
      // which is the same note the held-duration fallback below would pick.
      const stated = here
        .map((note) => note.written)
        .filter((given) => given !== undefined)
        .sort((a, b) => valueQuarters(b.value, b.dots) - valueQuarters(a.value, a.dots))[0]
      if (stated) return written(stated.value, stated.dots)

      let next: SongStep | undefined
      for (let i = index + 1; i < steps.length; i++) {
        if (onStaff(steps[i]!, staff)) {
          next = steps[i]
          break
        }
      }
      const held = Math.max(...here.map((note) => note.durationMs))
      return writtenValue(next ? next.startMs - step.startMs : held, beat)
    }

    /*
     * The chord as it will be drawn.
     *
     * Including which fingerings the page prints: the extent is what decides
     * how much room the next chord gets, and reserving space for a numeral
     * that the reader's density setting suppresses spaces the whole score for
     * ink that is never laid down.
     */
    const notes: DrawnNote[] = [...step.notes]
      .sort((a, b) => a.note - b.note)
      .map((note) => {
        const drawn = {
          note: note.note,
          finger: !hints || hints.has(note) ? note.finger : undefined,
          rolled: note.rolled,
          spelling: note.spelling,
          hand: note.hand,
        }
        const staff = staffOf(drawn)
        return {
          ...drawn,
          accidental: memory[staff].printFor(staffPlacement(note.note, note.spelling, staff)),
        }
      })

    const extent = chordExtent(notes, value, fifths)
    let gap = 0
    if (index > 0) {
      const elapsed = step.startMs - steps[index - 1]!.startMs
      const rhythmic = Math.min(MAX_GAP, (elapsed / measureMs) * (song?.barWidth ?? MEASURE_WIDTH))
      gap = Math.max(
        song?.minGap ?? MIN_GAP,
        rhythmic,
        previous + extent.left + AIR + (opensBar ? BAR_ROOM : 0),
      )
    }
    previous = extent.right

    /** The tuplet a staff's notes are written inside, if the score put them in one. */
    const tupletOn = (staff: Staff) =>
      step.notes.find((note) => staffFor(note.note, note.hand) === staff && note.written?.tuplet)
        ?.written?.tuplet
    const tuplet = {
      ...(tupletOn('treble') ? { treble: tupletOn('treble')! } : {}),
      ...(tupletOn('bass') ? { bass: tupletOn('bass')! } : {}),
    }

    return {
      step,
      index,
      notes,
      value,
      extent,
      gap,
      bar,
      ...(tuplet.treble || tuplet.bass ? { tuplet } : {}),
    }
  })

  return song?.beams ? beamed(measured, beat, measureMs, measures) : measured
}

/**
 * Says which chords share a beam.
 *
 * A beam joins the short notes of one beat: notes with a flag, one straight
 * after another, on the same staff, in the same bar. A rest breaks it, and so
 * does a note long enough to stand without a flag. Quavers in common time are
 * the one case that runs further — four to a beam, half a bar — because that is
 * how every scale book prints a scale in quavers, and two-note beams the length
 * of a page read as hiccups.
 *
 * Each staff is grouped by itself. The hands keep their own rhythm, and a beam
 * never joins them.
 */
function beamed(
  measured: readonly Measured[],
  beat: number,
  measureMs: number,
  /** The bars as the score wrote them, where it did: each has its own start, tempo and metre. */
  measures?: Song['measures'],
): Measured[] {
  const beamOf: Record<Staff, Map<number, number>> = { treble: new Map(), bass: new Map() }
  let nextId = 0

  /**
   * The bar a moment falls in: where it starts, how long a crotchet lasts in
   * it, how long its beat is, and how many crotchets it holds.
   *
   * A beat is a crotchet, except in compound time — six, nine or twelve
   * quavers to the bar, and three to a bar of 3/8 — where it is three quavers
   * and the beam runs across all three.
   */
  const barAt = (startMs: number, bar: number) => {
    const written = measures?.[barIndexAt(measures, startMs)]
    if (!written)
      return {
        startMs: (bar - 1) * measureMs,
        quarterMs: beat,
        beatMs: beat,
        quarters: Math.round(measureMs / beat),
      }
    const compound = written.beatType === 8 && written.beats % 3 === 0
    return {
      startMs: written.startMs,
      quarterMs: written.quarterMs,
      beatMs: written.quarterMs * (compound ? 1.5 : 1),
      quarters: compound ? 0 : Math.round((written.beats * 4) / written.beatType),
    }
  }

  for (const staff of ['treble', 'bass'] as const) {
    /** The beam being gathered, if one is open. */
    interface Group {
      members: number[]
      bar: number
      beat: number
      end: number
      plain: boolean
    }
    const open: { group: Group | null } = { group: null }
    const close = () => {
      if (open.group && open.group.members.length > 1) {
        const id = nextId++
        for (const index of open.group.members) beamOf[staff].set(index, id)
      }
      open.group = null
    }

    for (const entry of measured) {
      const mine = entry.step.notes.filter((note) => staffFor(note.note, note.hand) === staff)
      if (mine.length === 0) continue
      const value = entry.value[staff]
      const tuplet = mine.find((note) => note.written?.tuplet)?.written?.tuplet
      const start = entry.step.startMs
      const bar = barAt(start, entry.bar)
      const length =
        valueQuarters(value.value, value.dots) *
        bar.quarterMs *
        (tuplet ? tuplet.normal / tuplet.actual : 1)
      // Which beat of its bar it starts on. The small allowance is for thirds
      // of a beat, which do not add up to a whole one in floating point.
      const inBar = start - bar.startMs
      const onBeat = Math.floor(inBar / bar.beatMs + 1e-6)
      const plain = value.flags === 1 && !value.dotted && !tuplet

      if (value.flags === 0) {
        close()
        continue
      }
      const current = open.group
      if (
        current !== null &&
        current.bar === entry.bar &&
        // Two milliseconds: a bar read from a score puts its notes where its
        // tempo marks say, and they add up to within a rounding of each other.
        Math.abs(start - current.end) < 2 &&
        (onBeat === current.beat ||
          // Plain quavers in four: beats one and two, or three and four.
          (current.plain &&
            plain &&
            bar.quarters === 4 &&
            Math.floor(onBeat / 2) === Math.floor(current.beat / 2)))
      ) {
        current.members.push(entry.index)
        current.end = start + length
        current.plain = current.plain && plain
      } else {
        close()
        open.group = {
          members: [entry.index],
          bar: entry.bar,
          beat: onBeat,
          end: start + length,
          plain,
        }
      }
    }
    close()
  }

  return measured.map((entry) => {
    const treble = beamOf.treble.get(entry.index)
    const bass = beamOf.bass.get(entry.index)
    if (treble === undefined && bass === undefined) return entry
    return {
      ...entry,
      beam: {
        ...(treble !== undefined ? { treble } : {}),
        ...(bass !== undefined ? { bass } : {}),
      },
    }
  })
}

/**
 * The song's chords, measured, kept until the song, the part or the printed
 * fingering changes.
 *
 * The fingering belongs in here rather than in the drawing because a printed
 * numeral takes room on the page, and a score spaced for numbers it does not
 * print is spaced wrong.
 */
export function useMeasuredScore(
  song: Song | null,
  part: SongPart,
  hints?: ReadonlySet<SongNote>,
  /**
   * Spaced for the printed page rather than for the moving staff.
   *
   * The moving staff shows a few bars and gives them room; a page is read a
   * line at a time and wants as many bars on the line as an engraver would
   * set. Same notes, same ink, less air between them.
   */
  page = false,
) {
  const steps = React.useMemo(() => (song ? songSteps(song, part) : []), [song, part])
  const source = React.useMemo<ScoreSource | null>(
    () =>
      song && {
        ...song,
        // A score states every length, so its short notes can be beamed. A
        // performance only implies them.
        beams: song.provides?.rhythm === true,
        ...(page ? { barWidth: PAGE_BAR_WIDTH, minGap: PAGE_MIN_GAP } : {}),
      },
    [song, page],
  )
  const measured = React.useMemo(() => measureScore(source, steps, hints), [source, steps, hints])
  return { steps, measured }
}

/** Where the time signature's numerals are centred, after the key. */
export function timeX(fifths: number): number {
  return KEY_X + keyWidth(fifths) + (fifths === 0 ? 0 : STEP * 2) + TIME_HALF
}

/**
 * Where a system's first chord can sit.
 *
 * After the clefs, the key and — on the opening system only — the metre, with
 * room left over: an engraver does not begin the first bar hard against the
 * time signature. Measured rather than fixed, because a system that reserves
 * room for seven sharps it does not have has thrown away a bar of a short line.
 */
export function headerEnd(fifths: number, withTime: boolean): number {
  const after = withTime ? timeX(fifths) + TIME_HALF : KEY_X + keyWidth(fifths)
  return after + STEP * 4
}

/**
 * How tall a run of chords needs its frame to be.
 *
 * `HALF_HEIGHT` holds a grand staff and its clefs, and for most music that is
 * the whole answer. It is not always: a chord in the top octave
 * carries four ledger lines and its fingering above them, and a fixed frame
 * cuts them off — noteheads and all, with the staff beneath looking perfectly
 * correct.
 *
 * Each edge is measured on its own. A piece that climbs is not a reason to
 * open up room underneath it: growing both ways would shrink the staff twice
 * as much as the music asks for, and the extra would be blank paper.
 */
export function frameOf(measured: readonly Measured[]): { top: number; bottom: number } {
  let top = Math.min(-HALF_HEIGHT, yOn(14, 'treble') - BAR_NUMBER_INK)
  let bottom = HALF_HEIGHT
  for (const { extent } of measured) {
    top = Math.min(top, extent.top)
    bottom = Math.max(bottom, extent.bottom)
  }
  return { top: Math.floor(top), bottom: Math.ceil(bottom) }
}

export interface Placed extends Measured {
  readonly x: number
}

/**
 * Lay a run of chords out from a starting point, keeping their measured gaps.
 *
 * `stretch` justifies a system: engraved music fills its line, and a page of
 * lines that each stop wherever the music happened to run out reads as a
 * draft rather than as a score.
 */
export function place(measured: readonly Measured[], startX: number, stretch = 1): Placed[] {
  let x = startX
  return measured.map((entry, index) => {
    if (index > 0) x += entry.gap * stretch
    return { ...entry, x }
  })
}

/** How far a bar line stands in front of the first ink of its bar. */
const BAR_LEAD = STEP * 2.4
/** The least a bar line keeps from the ink of the bar it closes. */
const BAR_TRAIL = STEP * 0.8
/** The most bars with nothing struck in them that get a line each between two chords. */
const MAX_EMPTY_BARS = 16

/**
 * The bar lines of a run of chords: one for every bar, each numbered.
 *
 * A line stands just in front of the bar it opens — a bar's first note follows
 * its line closely, and the room a long note is given is after it, inside its
 * own bar. Halfway between the two chords, which is where these used to be
 * drawn, put the line in the middle of that room and left a semibreve looking
 * as though it belonged to neither bar.
 *
 * And every bar gets one, including a bar in which nothing is struck: a chord
 * held across three bars has three bar lines over it, and counting bars on a
 * page that skips the quiet ones gives the wrong number. Those lines share the
 * room between the two chords evenly.
 */
export function barLinesIn(placed: readonly Placed[]): { x: number; bar: number }[] {
  const lines: { x: number; bar: number }[] = []
  for (let i = 1; i < placed.length; i++) {
    const before = placed[i - 1]!
    const after = placed[i]!
    if (after.bar === before.bar) continue
    const earliest = before.x + before.extent.right + BAR_TRAIL
    const last = Math.max(earliest, after.x - after.extent.left - BAR_LEAD)
    const count = Math.min(MAX_EMPTY_BARS, Math.max(1, after.bar - before.bar))
    for (let n = 1; n <= count; n++)
      lines.push({
        x: earliest + ((last - earliest) * n) / count,
        bar: after.bar - (count - n),
      })
  }
  return lines
}

/** Where the music of a run ends, for the line that closes it. */
export function endOf(placed: readonly Placed[]): number {
  const last = placed.at(-1)
  return last ? last.x + last.extent.right + BAR_LEAD : 0
}

/** The most a system's gaps may be opened up to fill its line. */
const MAX_STRETCH = 2.5
/** Below this much of the line, a system is left short rather than pulled apart. */
const MIN_FILL = 0.55
/** The air kept at the end of a system, before its closing bar line. */
const RIGHT_MARGIN = STEP * 6

export interface System {
  /** The half-open run of chords this line holds. */
  readonly from: number
  readonly to: number
  /** How much its gaps are opened up to fill the line. */
  readonly stretch: number
}

/**
 * Where the lines break.
 *
 * Chords are added until the next one would not fit, and then the break moves
 * back to the last bar line — engraved music breaks between bars, and a system
 * that ends mid-bar reads as a mistake even to someone who could not say why.
 * If a single bar is wider than the line there is nowhere to move back to, so
 * it breaks where it overflows and stays readable.
 *
 * Every system takes at least one chord, so a chord too wide for any line
 * still ends the loop.
 */
export function breakIntoSystems(
  measured: readonly Measured[],
  fifths: number,
  width: number,
): System[] {
  const systems: System[] = []
  let from = 0

  while (from < measured.length) {
    const start = headerEnd(fifths, from === 0)
    let x = start
    let to = from + 1
    let lastBar = -1
    for (let i = from + 1; i < measured.length; i++) {
      const at = x + measured[i]!.gap
      if (at + measured[i]!.extent.right + RIGHT_MARGIN > width) break
      x = at
      to = i + 1
      if (measured[i]!.bar !== measured[i - 1]!.bar) lastBar = i
    }
    // Back up to the bar line, unless that would empty the system or we have
    // reached the end of the piece and there is nothing to back up for.
    if (to < measured.length && lastBar > from) to = lastBar

    systems.push({ from, to, stretch: stretchFor(measured, from, to, fifths, width) })
    from = to
  }

  return systems
}

/**
 * How far to open a system's gaps so it fills its line.
 *
 * Never on the shortest lines: a final system holding two chords, stretched to
 * the full width, puts half a bar of white space between them and looks like a
 * fault rather than an ending. Those are left short, which is what an engraver
 * does with a last line.
 */
function stretchFor(
  measured: readonly Measured[],
  from: number,
  to: number,
  fifths: number,
  width: number,
): number {
  if (to >= measured.length) return 1
  const start = headerEnd(fifths, from === 0)
  let gaps = 0
  for (let i = from + 1; i < to; i++) gaps += measured[i]!.gap
  if (gaps <= 0) return 1
  const last = measured[to - 1]!.extent.right
  const natural = start + gaps + last
  if (natural < width * MIN_FILL) return 1
  const target = width - RIGHT_MARGIN
  return Math.min(MAX_STRETCH, Math.max(1, (target - start - last) / gaps))
}
