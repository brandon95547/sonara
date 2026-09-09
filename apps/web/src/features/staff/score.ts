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
/** The white space two chords keep between their ink. */
export const AIR = STEP * 3
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
  song: Song | null,
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

  return steps.map((step, index) => {
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
      const rhythmic = Math.min(MAX_GAP, (elapsed / measureMs) * MEASURE_WIDTH)
      gap = Math.max(MIN_GAP, rhythmic, previous + extent.left + AIR)
    }
    previous = extent.right

    return { step, index, notes, value, extent, gap, bar }
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
export function useMeasuredScore(song: Song | null, part: SongPart, hints?: ReadonlySet<SongNote>) {
  const steps = React.useMemo(() => (song ? songSteps(song, part) : []), [song, part])
  const measured = React.useMemo(() => measureScore(song, steps, hints), [song, steps, hints])
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

/** A bar line wherever the bar number changes, halfway between the two chords. */
export function barLinesIn(placed: readonly Placed[]): { x: number; bar: number }[] {
  const lines: { x: number; bar: number }[] = []
  for (let i = 1; i < placed.length; i++)
    if (placed[i]!.bar !== placed[i - 1]!.bar)
      lines.push({ x: (placed[i - 1]!.x + placed[i]!.x) / 2, bar: placed[i]!.bar })
  return lines
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
