import * as React from 'react'
import { STEP, yOn } from './staff-frame'
import { Chord, KeySignature, TimeSignature } from './StaffNotes'
import { useKeyboardStore } from '@/state/keyboard-store'
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
}: {
  placed: Placed
  role: Role
  fifths: number
  /** The sounding notes of this chord, comma separated. Almost always empty. */
  lit: string
}) {
  const notes = [...placed.step.notes].sort((a, b) => a.note - b.note)
  const sounding = lit === '' ? null : new Set(lit.split(',').map(Number))

  return (
    <g className="staff__step" data-role={role}>
      <Chord
        x={placed.x}
        notes={notes.map((note) => ({
          note: note.note,
          finger: note.finger,
          sounding: sounding?.has(note.note) ?? false,
          rolled: note.rolled,
        }))}
        value={placed.value}
        fifths={fifths}
      />
    </g>
  )
})

/**
 * A chord close enough to the playhead to light up as you play it.
 *
 * It watches the keyboard itself rather than being told from above, and that
 * is the whole point: the score has a couple of hundred chords in it, and if
 * the component holding all of them subscribes to the keys, every one of them
 * is reconciled on every note-on and note-off. Here only the handful under the
 * player's hands is listening, so a chord costs what a chord costs.
 *
 * The selector returns a string, so holding a key down through some other
 * change to the store — the sustain pedal, a note somewhere else — comes back
 * equal and re-renders nothing.
 */
export function LiveStep({ placed, role, fifths }: { placed: Placed; role: Role; fifths: number }) {
  const lit = useKeyboardStore((state) =>
    placed.step.notes
      .filter((note) => state.active[note.note] !== undefined)
      .map((note) => note.note)
      .join(','),
  )
  return <Step placed={placed} role={role} fifths={fifths} lit={lit} />
}

/**
 * Whether a chord is near enough to the playhead to be worth watching.
 *
 * A pitch you are holding turns up all over a piece — middle C might appear
 * fifty times in it — and lighting every one says nothing about where you are.
 * What the colour is for is the chord under your hands.
 */
export const isLive = (role: Role) => role === 'target' || role === 'upcoming'
