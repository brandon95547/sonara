import * as React from 'react'
import {
  songSteps,
  staffPlacement,
  writtenValue,
  type SongStep,
  type WrittenValue,
} from '@sonara/shared'
import { useSongStore, useCurrentSong } from '@/state/song-store'
import { useKeyboardStore } from '@/state/keyboard-store'
import { useElementSize } from '@/lib/hooks'
import { GUTTER, StaffGutter, StaffLines, STEP, HALF_HEIGHT, yOn } from './staff-frame'
import { Chord, chordExtent, KeySignature, TimeSignature } from './StaffNotes'

/**
 * The song, written out, with your place in it.
 *
 * `GrandStaff` draws what is sounding at this instant and nothing else, which
 * is right for a scale and for free play — there is no score to follow. A song
 * has one, and reading a single chord at a time out of it is like being handed
 * sheet music through a letterbox.
 *
 * So this draws the whole piece and marks where you are, in the same three
 * states the keyboard uses: what is behind you stays visible but quiet, what
 * you are on is the accent, and the next few carry the lighter wash. The two
 * pictures say the same thing about the same moment, which is the point — the
 * staff is where you learn to read it and the keys are where you learn to play
 * it, and a learner has to be able to look from one to the other.
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
/** The white space two chords keep between their ink. */
const AIR = STEP * 3
/** Never further than this: a held note should not push the next page away. */
const MAX_GAP = 170
/**
 * Where the music starts.
 *
 * Clear of the pinned clefs, the key signature and the time signature, with
 * room left over — an engraver does not begin the first bar hard against the
 * metre, and neither should this.
 */
const FIRST_X = GUTTER + 110
/** How many steps ahead keep a marking, matching the keyboard's lookahead. */
const LOOKAHEAD = 4
/** How far a bar number's ink rises above its own baseline, measured. */
const BAR_NUMBER_INK = 11

type Role = 'played' | 'target' | 'upcoming' | 'ahead'

interface Placed {
  readonly x: number
  readonly step: SongStep
  readonly index: number
  readonly value: { readonly treble: WrittenValue; readonly bass: WrittenValue }
  /** How far this chord's ink reaches, so the page can make room for it. */
  readonly extent: { left: number; right: number; top: number; bottom: number }
}

export function SongScore() {
  const song = useCurrentSong()
  const part = useSongStore((state) => state.part)
  const mode = useSongStore((state) => state.mode)
  const stepIndex = useSongStore((state) => state.stepIndex)
  const positionMs = useSongStore((state) => state.positionMs)
  // What is under a finger right now. The staff and the keys light the same
  // notes at the same moment, which is the whole reason for having both.
  const active = useKeyboardStore((state) => state.active)
  const sounding = React.useMemo(() => new Set(Object.keys(active).map(Number)), [active])
  const [frameRef, size] = useElementSize<HTMLDivElement>()
  const scrollRef = React.useRef<HTMLDivElement>(null)

  const steps = React.useMemo(() => (song ? songSteps(song, part) : []), [song, part])

  /**
   * Where each step sits along the page.
   *
   * Proportional to the time before it, so the picture keeps the rhythm, but
   * clamped at both ends: without a floor a run of semiquavers becomes a smear,
   * and without a ceiling one long held chord pushes everything after it off
   * the end of the world.
   */
  const placed = React.useMemo<Placed[]>(() => {
    const measure = song?.measureMs ?? 2000
    const beat = song ? 60000 / song.bpm : 500
    const fifths = song?.key?.fifths ?? 0
    let x = FIRST_X
    let previous = 0
    return steps.map((step, index) => {
      // How long the notes are *written* as, which is the time until this
      // staff next has something — not how long a key was held. A player
      // releasing early has played a short crotchet, not a quaver.
      //
      // Per staff, because the hands keep their own rhythm. A bar-long chord
      // under a run of quavers is a semibreve, and taking the melody's value
      // for it writes it as a crotchet with a stem.
      const value = { treble: written('treble'), bass: written('bass') }
      function written(staff: 'treble' | 'bass'): WrittenValue {
        const on = (candidate: SongStep) =>
          candidate.notes.some((note) => staffPlacement(note.note).staff === staff)
        if (!on(step)) return writtenValue(beat, beat)
        const next = steps.slice(index + 1).find(on)
        const held = Math.max(
          ...step.notes
            .filter((note) => staffPlacement(note.note).staff === staff)
            .map((note) => note.durationMs),
        )
        return writtenValue(next ? next.startMs - step.startMs : held, beat)
      }

      // What this chord is made of decides how much room it needs, so it is
      // measured before it is placed. Rhythm sets the spacing until the ink
      // asks for more, and then the ink wins — a bar that is crowded is still
      // readable, and two chords printed on top of each other are not.
      const extent = chordExtent(
        step.notes.map((note) => ({ note: note.note, finger: note.finger })),
        value,
        fifths,
      )
      if (index > 0) {
        const gap = step.startMs - steps[index - 1]!.startMs
        const rhythmic = Math.min(MAX_GAP, (gap / measure) * MEASURE_WIDTH)
        x += Math.max(MIN_GAP, rhythmic, previous + extent.left + AIR)
      }
      previous = extent.right

      return { x, step, index, value, extent }
    })
  }, [steps, song])

  /**
   * Which step is "here".
   *
   * In Learn it is the one you have to play. Anywhere else the song may be
   * playing itself, and the playhead is the truth.
   */
  const here = React.useMemo(() => {
    if (mode === 'learn') return stepIndex
    let found = -1
    for (const [index, step] of steps.entries()) {
      if (step.startMs <= positionMs) found = index
      else break
    }
    return found
  }, [mode, stepIndex, positionMs, steps])

  const totalWidth = Math.max((placed.at(-1)?.x ?? FIRST_X) + 60, 320)

  /**
   * How tall the drawing has to be, and which way it has to grow.
   *
   * `HALF_HEIGHT` holds a grand staff with a comfortable margin, and for most
   * music that is the whole answer. It is not always: a chord in the top
   * octave carries four ledger lines and its fingering above them, and the
   * fixed frame simply cut them off — noteheads and all, with the staff
   * beneath looking perfectly correct.
   *
   * So the frame is the larger of the default and what the music needs, and
   * each edge is measured on its own. A piece that climbs is not a reason to
   * open up room underneath it: growing both ways would shrink the staff twice
   * as much as the music asks for, and the extra would be blank paper.
   */
  const frame = React.useMemo(() => {
    let top = Math.min(-HALF_HEIGHT, yOn(14, 'treble') - BAR_NUMBER_INK)
    let bottom = HALF_HEIGHT
    for (const { extent } of placed) {
      top = Math.min(top, extent.top)
      bottom = Math.max(bottom, extent.bottom)
    }
    return { top: Math.floor(top), height: Math.ceil(bottom) - Math.floor(top) }
  }, [placed])

  // The drawing scales with the panel's height, so the width in pixels follows
  // from it — which is what makes the container scroll by the right amount.
  const scale = size.height > 0 ? size.height / frame.height : 1
  const pixelWidth = Math.round(totalWidth * scale)

  // Keep the current step on screen, the way the keyboard follows what you
  // play. Nothing to do until the panel has been laid out — a width of zero
  // makes every margin zero, and the score scrolls its own clefs off the left
  // before the first note is played.
  React.useEffect(() => {
    const box = scrollRef.current
    const current = placed[here]
    // The panel's own measured width, not `box.clientWidth`. Reading layout
    // from inside the effect returns zero here — the element is in the
    // document and is the right one, and still measures nothing — so the
    // guard below rejected every scroll and the score silently never followed.
    // The observer that already sizes the drawing knows the answer.
    if (!box || !current || size.width === 0) return
    const x = current.x * scale
    const margin = size.width * 0.35
    if (x < box.scrollLeft + margin || x > box.scrollLeft + size.width - margin) {
      // A jump, on purpose. Smooth scrolling here — by CSS or by the
      // `behavior` option — does nothing at all on engines that have not
      // implemented it, and the score just stops following with no sign of
      // why. Arriving abruptly beats not arriving.
      box.scrollLeft = Math.max(0, x - margin)
    }
  }, [here, placed, scale, size.width])

  const roleFor = (index: number): Role => {
    if (here < 0) return 'ahead'
    if (index < here) return 'played'
    if (index === here) return 'target'
    return index - here <= LOOKAHEAD ? 'upcoming' : 'ahead'
  }

  return (
    <div ref={frameRef} className="staff-fit staff-score">
      <div ref={scrollRef} className="staff-scroll">
        <svg
          viewBox={`0 ${frame.top} ${totalWidth} ${frame.height}`}
          width={pixelWidth || undefined}
          height="100%"
          preserveAspectRatio="xMinYMid meet"
          className="staff"
          role="img"
          aria-label={
            song
              ? `${song.title}, ${steps.length} steps, showing step ${Math.max(here, 0) + 1}`
              : 'Grand staff'
          }
        >
          <StaffLines width={totalWidth} />
          {/* Clef, then key, then metre, each clear of the last. An engraver
              gives this run of symbols room; crowded, it reads as one blot. */}
          <KeySignature x={GUTTER + 10} fifths={song?.key?.fifths ?? 0} />
          <TimeSignature
            x={GUTTER + 26 + Math.min(7, Math.abs(song?.key?.fifths ?? 0)) * STEP * 2.4}
            beats={song?.timeSignature?.beats ?? 4}
            beatType={song?.timeSignature?.beatType ?? 4}
          />

          {song &&
            barLines(song.measureMs, steps, placed).map(({ x, bar }) => (
              <g key={x}>
                <line
                  x1={x}
                  y1={yOn(10, 'treble')}
                  x2={x}
                  y2={yOn(-10, 'bass')}
                  className="staff__bar"
                />
                {/* Numbered, the way a part is, so a player can say where they
                    are out loud. */}
                <text x={x + STEP * 1.4} y={yOn(14, 'treble')} className="staff__bar-number">
                  {bar}
                </text>
              </g>
            ))}

          {placed.map(({ x, step, index, value }) => (
            <Step
              key={index}
              x={x}
              step={step}
              value={value}
              role={roleFor(index)}
              fifths={song?.key?.fifths ?? 0}
              sounding={sounding}
            />
          ))}

          {/* The playhead. A line, not a column: a translucent block over the
              music dims the very notes it is pointing at, and the eye reads the
              block instead of them. */}
          {placed[here] && (
            <line
              x1={placed[here]!.x}
              y1={yOn(12, 'treble')}
              x2={placed[here]!.x}
              y2={yOn(-12, 'bass')}
              className="staff__playhead"
            />
          )}
        </svg>
      </div>

      {/* Pinned over the music, which scrolls behind it. */}
      <svg
        className="staff-gutter"
        viewBox={`0 ${frame.top} ${GUTTER} ${frame.height}`}
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

/** A bar line wherever a measure boundary falls between two steps. */
function barLines(measureMs: number, steps: readonly SongStep[], placed: readonly Placed[]) {
  if (measureMs <= 0 || steps.length === 0) return []
  const lines: { x: number; bar: number }[] = []
  for (let i = 1; i < steps.length; i++) {
    const before = Math.floor(steps[i - 1]!.startMs / measureMs)
    const now = Math.floor(steps[i]!.startMs / measureMs)
    if (now > before) lines.push({ x: (placed[i - 1]!.x + placed[i]!.x) / 2, bar: now + 1 })
  }
  return lines
}

function Step({
  x,
  step,
  value,
  role,
  fifths,
  sounding,
}: {
  x: number
  step: SongStep
  value: { readonly treble: WrittenValue; readonly bass: WrittenValue }
  role: Role
  fifths: number
  sounding: ReadonlySet<number>
}) {
  const notes = [...step.notes].sort((a, b) => a.note - b.note)

  return (
    <g className="staff__step" data-role={role}>
      <Chord
        x={x}
        notes={notes.map((note) => ({
          note: note.note,
          finger: note.finger,
          sounding: sounding.has(note.note),
        }))}
        value={value}
        fifths={fifths}
      />
    </g>
  )
}
