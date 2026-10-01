import * as React from 'react'
import { KEY_X, STEP, yOn } from './staff-frame'
import { Chord, KeySignature, TimeSignature } from './StaffNotes'
import { useKeyboardStore } from '@/state/keyboard-store'
import { timeX, type Measured, type Placed } from './score'
import type { BeamShape, StepStems } from './beams'

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

/**
 * The bar lines of one system, each numbered the way a part is.
 *
 * One line per staff rather than one through both: each staff is on its own
 * sheet of paper, and a line joining them would cross the stage between.
 */
export function BarLines({
  lines,
  numbered = true,
}: {
  lines: readonly { x: number; bar: number }[]
  numbered?: boolean
}) {
  return (
    <>
      {lines.map(({ x, bar }) => (
        <g key={x}>
          <line x1={x} y1={yOn(10, 'treble')} x2={x} y2={yOn(2, 'treble')} className="staff__bar" />
          <line x1={x} y1={yOn(-2, 'bass')} x2={x} y2={yOn(-10, 'bass')} className="staff__bar" />
          {/* Numbered, so a player can say where they are out loud. */}
          {numbered && (
            <text x={x + STEP * 1.4} y={yOn(14, 'treble')} className="staff__bar-number">
              {bar}
            </text>
          )}
        </g>
      ))}
    </>
  )
}

/**
 * Where you are.
 *
 * A line, not a column: a translucent block over the music dims the very notes
 * it is pointing at, and the eye reads the block instead of them. Drawn under
 * the notes for the same reason — its glow laid over a note hanging off the
 * paper washed the notehead out until a crotchet read as a minim.
 *
 * Not drawn yet: it belongs to interactive playback, which is still to come,
 * and until then a line with nothing driving it is a promise the page cannot
 * keep. Your place is still marked on the notes themselves (see `Role`). Both
 * views check this one switch, so turning it back on is one line.
 */
export const PLAYHEAD_SHOWN = false

export function Playhead({ x }: { x: number }) {
  return (
    <line x1={x} y1={yOn(12, 'treble')} x2={x} y2={yOn(-12, 'bass')} className="staff__playhead" />
  )
}

/**
 * One chord of the score, with its reading state and whatever is sounding.
 *
 * Memoised, and told what is sounding as a plain string rather than handed the
 * set to look in. That is not tidiness. A set is a new object on every key
 * event, so every chord in the piece saw a changed prop and redrew — laying
 * itself out again, accidental columns and all — each time a finger went down.
 * On a real song that is a couple of hundred milliseconds per note, and a
 * chord played on a MIDI keyboard arrives as separate messages: the notes came
 * out one at a time, low to high, like an arpeggio nobody asked for.
 *
 * With a string, a chord with nothing sounding gets the same empty string it
 * had before and does not redraw at all.
 */
export const Step = React.memo(function Step({
  placed,
  role,
  fifths,
  lit,
  stems,
}: {
  placed: Placed
  role: Role
  fifths: number
  /** The sounding notes of this chord, comma separated. Almost always empty. */
  lit: string
  /**
   * Its stems, where a beam has decided them. The same object from one render
   * to the next for as long as the page is laid out the same way, so it does
   * not undo the memo.
   */
  stems?: StepStems
}) {
  const sounding = lit === '' ? null : new Set(lit.split(',').map(Number))

  return (
    <g className="staff__step" data-role={role}>
      <Chord
        x={placed.x}
        /* Spelled, handed, signed and fingered when the score was measured —
           which is the only place that can decide any of them, because all four
           depend on music this chord cannot see. */
        notes={placed.notes.map((note) => ({
          ...note,
          sounding: sounding?.has(note.note) ?? false,
        }))}
        value={placed.value}
        fifths={fifths}
        stems={stems}
      />
    </g>
  )
})

/**
 * The beams of a system, and the number over each tuplet.
 *
 * Drawn as their own layer rather than by the chords they join, because a beam
 * belongs to several chords at once and each chord is drawn — and memoised —
 * by itself. A beam goes quiet with its notes: once every chord under it is
 * behind the player, it takes the same ink they do.
 */
export function Beams({
  beams,
  roleFor,
}: {
  beams: readonly BeamShape[]
  roleFor: (index: number) => Role
}) {
  return (
    <>
      {beams.map((beam) => {
        const played = beam.indices.every((index) => roleFor(index) === 'played')
        return (
          <g key={beam.key} className="staff__beam" data-played={played ? 'true' : undefined}>
            {beam.bars.map((bar, at) => (
              <polygon key={at} points={bar.points} />
            ))}
            {beam.tuplet && (
              <text x={beam.tuplet.x} y={beam.tuplet.y} className="staff__tuplet">
                {beam.tuplet.text}
              </text>
            )}
          </g>
        )
      })}
    </>
  )
}

/** A chord whose keys are watched: where it falls in the piece, and its pitches. */
export interface Watched {
  readonly index: number
  readonly notes: readonly number[]
}

/** The chords of a score that watch the keys, as the lighting compares them. */
export function watchedIn(
  measured: readonly Measured[],
  live: (index: number) => boolean,
): Watched[] {
  return measured
    .filter((entry) => live(entry.index))
    .map((entry) => ({ index: entry.index, notes: entry.step.notes.map((note) => note.note) }))
}

/**
 * Which of a chord's notes light, out of the ones being held.
 *
 * A key is one pitch and a pitch is written in more than one place. A scale
 * comes back down through the notes it went up, and with both hands the left
 * reaches an octave later the very keys the right began on — so every key of a
 * two-octave scale in octaves is written four times, twice on each staff. A
 * chord that lit whenever one of its pitches was down lit all four: six
 * noteheads for the two notes actually sounding, the other four on steps
 * nobody was playing.
 *
 * So the writings of a pitch are compared, and the one that is being played
 * lights. Nearest to `position` first — where the playback head or the run is is
 * not a guess. Then, between chords equally near, or when nobody is known to be
 * anywhere, the chord with the most of itself held down: both hands on the
 * first step is that step, and not the left hand's half of one an octave on.
 *
 * What is still level after that lights everywhere it is level, because a key
 * does not say which hand pressed it and choosing one would be a guess.
 */
export function litNotes(
  step: Watched,
  watched: readonly Watched[],
  position: number,
  isDown: (note: number) => boolean,
): number[] {
  const claim = (chord: Watched) => ({
    away: position < 0 ? 0 : Math.abs(chord.index - position),
    held: chord.notes.filter(isDown).length / chord.notes.length,
  })
  const own = claim(step)

  return step.notes.filter(
    (note) =>
      isDown(note) &&
      !watched.some((other) => {
        if (other.index === step.index || !other.notes.includes(note)) return false
        const rival = claim(other)
        return rival.away !== own.away ? rival.away < own.away : rival.held > own.held
      }),
  )
}

/**
 * A chord close enough to the playhead to light up as you play it.
 *
 * It watches the keyboard itself rather than being told from above, and that
 * is the whole point: the score has a couple of hundred chords in it, and if
 * the component holding all of them subscribes to the keys, every one of them
 * is reconciled on every note-on and note-off. Here only the handful under the
 * player's hands is listening, so a chord costs what a chord costs.
 *
 * It is told which other chords are listening, because whether a held pitch
 * lights here depends on where else it is written — see `litNotes`.
 *
 * The selector returns a string, so holding a key down through some other
 * change to the store — the sustain pedal, a note somewhere else — comes back
 * equal and re-renders nothing.
 */
export function LiveStep({
  placed,
  role,
  fifths,
  watched,
  position,
  stems,
}: {
  placed: Placed
  role: Role
  fifths: number
  watched: readonly Watched[]
  /** The step the player is known to be on, or negative where nobody is. */
  position: number
  stems?: StepStems
}) {
  const lit = useKeyboardStore((state) =>
    litNotes(
      { index: placed.index, notes: placed.step.notes.map((note) => note.note) },
      watched,
      position,
      (note) => state.active[note] !== undefined,
    ).join(','),
  )
  return <Step placed={placed} role={role} fifths={fifths} lit={lit} stems={stems} />
}

/**
 * Whether a chord is near enough to the playhead to be worth watching.
 *
 * A pitch you are holding turns up all over a piece — middle C might appear
 * fifty times in it — and lighting every one says nothing about where you are.
 * What the colour is for is the chord under your hands.
 */
export const isLive = (role: Role) => role === 'target' || role === 'upcoming'
