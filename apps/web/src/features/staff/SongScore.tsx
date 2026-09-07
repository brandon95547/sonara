import * as React from 'react'
import {
  songSteps,
  staffPlacement,
  writtenValue,
  type SongStep,
  type WrittenValue,
} from '@sonara/shared'
import { useSongStore, useCurrentSong } from '@/state/song-store'
import { useElementSize } from '@/lib/hooks'
import { GUTTER, StaffGutter, StaffLines, STEP, HALF_HEIGHT, y } from './staff-frame'
import { Chord, KeySignature, TimeSignature } from './StaffNotes'

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
const MEASURE_WIDTH = 210
/** Never closer than this: a notehead with an accidental needs the room. */
const MIN_GAP = 26
/** Never further than this: a held note should not push the next page away. */
const MAX_GAP = 150
/** The first note sits clear of the pinned clefs, key and time signatures. */
const FIRST_X = GUTTER + 60
/** How many steps ahead keep a marking, matching the keyboard's lookahead. */
const LOOKAHEAD = 4

type Role = 'played' | 'target' | 'upcoming' | 'ahead'

interface Placed {
  readonly x: number
  readonly step: SongStep
  readonly index: number
  readonly value: { readonly treble: WrittenValue; readonly bass: WrittenValue }
}

export function SongScore() {
  const song = useCurrentSong()
  const part = useSongStore((state) => state.part)
  const mode = useSongStore((state) => state.mode)
  const stepIndex = useSongStore((state) => state.stepIndex)
  const positionMs = useSongStore((state) => state.positionMs)
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
    let x = FIRST_X
    return steps.map((step, index) => {
      if (index > 0) {
        const gap = step.startMs - steps[index - 1]!.startMs
        x += Math.min(MAX_GAP, Math.max(MIN_GAP, (gap / measure) * MEASURE_WIDTH))
      }
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
      return { x, step, index, value }
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

  // The drawing scales with the panel's height, so the width in pixels follows
  // from it — which is what makes the container scroll by the right amount.
  const scale = size.height > 0 ? size.height / (HALF_HEIGHT * 2) : 1
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
          viewBox={`0 -${HALF_HEIGHT} ${totalWidth} ${HALF_HEIGHT * 2}`}
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
          <KeySignature x={GUTTER + 4} fifths={song?.key?.fifths ?? 0} />
          <TimeSignature
            x={GUTTER + 8 + Math.min(7, Math.abs(song?.key?.fifths ?? 0)) * STEP * 2.1}
            beats={song?.beatsPerMeasure ?? 4}
          />

          {song &&
            barLines(song.measureMs, steps, placed).map((x) => (
              <line key={x} x1={x} y1={y(10)} x2={x} y2={y(-10)} className="staff__bar" />
            ))}

          {placed.map(({ x, step, index, value }) => (
            <Step
              key={index}
              x={x}
              step={step}
              value={value}
              role={roleFor(index)}
              fifths={song?.key?.fifths ?? 0}
            />
          ))}
        </svg>
      </div>

      {/* Pinned over the music, which scrolls behind it. */}
      <svg
        className="staff-gutter"
        viewBox={`0 -${HALF_HEIGHT} ${GUTTER} ${HALF_HEIGHT * 2}`}
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
  const lines: number[] = []
  for (let i = 1; i < steps.length; i++) {
    const before = Math.floor(steps[i - 1]!.startMs / measureMs)
    const now = Math.floor(steps[i]!.startMs / measureMs)
    if (now > before) lines.push((placed[i - 1]!.x + placed[i]!.x) / 2)
  }
  return lines
}

function Step({
  x,
  step,
  value,
  role,
  fifths,
}: {
  x: number
  step: SongStep
  value: { readonly treble: WrittenValue; readonly bass: WrittenValue }
  role: Role
  fifths: number
}) {
  const notes = [...step.notes].sort((a, b) => a.note - b.note)
  const lowest = Math.min(...notes.map((note) => staffPlacement(note.note).steps))
  const highest = Math.max(...notes.map((note) => staffPlacement(note.note).steps))

  return (
    <g className="staff__step" data-role={role}>
      {role === 'target' && (
        // Behind the notes, and tall enough to gather a chord into one mark.
        <rect
          x={x - STEP * 2.6}
          y={y(Math.max(highest, 10) + 1.5)}
          width={STEP * 5.6}
          height={(Math.max(highest, 10) - Math.min(lowest, -10) + 3) * STEP}
          rx={STEP}
          className="staff__cursor"
        />
      )}
      <Chord
        x={x}
        notes={notes.map((note) => ({ note: note.note, finger: note.finger }))}
        value={value}
        fifths={fifths}
      />
    </g>
  )
}
