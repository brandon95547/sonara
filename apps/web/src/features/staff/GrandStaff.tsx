import * as React from 'react'
import {
  normalisePitchClass,
  parsePitch,
  spellInKey,
  staffNoteName,
  writtenValue,
  type Spelling,
} from '@sonara/shared'
import { useKeyboardStore } from '@/state/keyboard-store'
import { useLearningStore } from '@/state/learning-store'
import { useElementSize } from '@/lib/hooks'
import { StaffFrame, HALF_HEIGHT, KEY_X, keyWidth, STEP } from './staff-frame'
import { Chord, KeySignature } from './StaffNotes'

/**
 * What you are playing, written down, as you play it.
 *
 * Deliberately knows nothing about the learning system: no expected notes, no
 * grading, no guidance. It reports the performance and stops there, which is
 * what makes it useful in Free Play and honest everywhere else.
 *
 * It does read the key, which is a different thing. A key is not a claim about
 * what you should have played — it is how the notes you did play are written
 * down, and a B♭ printed as A♯ while the signature carries a flat on B is not
 * a stricter picture of the performance, it is a wrong one. The signature is
 * drawn for the same reason: a B♭ under a flat signature prints no sign of its
 * own, so without the signature in front of it that notehead reads as B♮.
 *
 * Vertical position is diatonic — see `staffPlacement`. Horizontal position is
 * not time: every sounding note is drawn at the same x, because this is a
 * picture of a moment rather than a score. Notes a second apart are nudged
 * sideways, the way an engraver would, so their noteheads do not overlap.
 *
 * Which staff a note goes on is decided by middle C here, and only here. The
 * score knows which hand plays what and puts the left hand in the bass wherever
 * it reaches; a live note arrives from a keyboard that never says which hand
 * pressed it, so the seam is the honest answer rather than a guess that would
 * be wrong exactly where a player crosses hands.
 */

/** The least room to leave before the notes, clear of the clefs. */
const NOTE_X = 116
/** The air between the key signature and the first notehead. */
const AFTER_KEY = STEP * 4

export function GrandStaff() {
  // One subscription to the whole map: unlike a key, this draws every sounding
  // note at once, so there is nothing finer to subscribe to.
  const active = useKeyboardStore((state) => state.active)
  /*
   * The key the material is in, where the app is working on material at all.
   *
   * `keyFifths` is null when no signature fits what is being practised — a
   * chromatic or whole-tone scale — and then every accidental is printed, which
   * is what an editor does with those. Free play has no exercise and no key,
   * and C major is the right thing to say about a performance nobody has
   * declared a key for.
   */
  const fifths = useLearningStore((state) => state.exercise?.keyFifths ?? 0)
  const pitchNames = useLearningStore((state) => state.exercise?.pitchNames)
  const [measureRef, size] = useElementSize<HTMLDivElement>()

  /**
   * The viewBox width that makes the box's aspect and the drawing's identical.
   *
   * `preserveAspectRatio` scales by whichever axis is more constrained, so a
   * viewBox that is relatively wider than its element gets scaled down to fit
   * the height and leaves the remaining width empty — the element is full
   * width and the staff inside it is not. Deriving the width from the measured
   * aspect leaves nothing to letterbox, at any panel height, with no constant
   * to keep in step with the CSS.
   */
  const width =
    size.height > 0 ? Math.round((HALF_HEIGHT * 2 * size.width) / size.height) : HALF_HEIGHT * 4

  /** After the signature, however wide this one is. Seven sharps is not four. */
  const noteX = Math.max(NOTE_X, KEY_X + keyWidth(fifths) + AFTER_KEY)

  const sounding = React.useMemo(
    () =>
      Object.keys(active)
        .map(Number)
        .sort((a, b) => a - b),
    [active],
  )

  /**
   * How each sounding note is written.
   *
   * The exercise has already spelled its own notes and there is no better
   * answer than the one it gives — E♭ in A minor, D♯ in B major — so where it
   * names a pitch class, that name is used. Everything else is a note from
   * outside the material, and is spelled the way a piece in this key would
   * write it.
   */
  const spellingFor = React.useCallback(
    (note: number): Spelling => {
      const pitchClass = normalisePitchClass(note)
      const named = pitchNames?.[pitchClass]
      return (named ? parsePitch(named) : null) ?? spellInKey(pitchClass, fifths)
    },
    [pitchNames, fifths],
  )

  /**
   * A crotchet, always.
   *
   * A note being held has no written length yet — it ends when you let go, and
   * that has not happened. Drawing every one as a crotchet is the honest
   * choice: it is the value a reader assumes, and it puts a stem on the note so
   * this reads as notation rather than as dots on lines.
   */
  const value = React.useMemo(() => writtenValue(1, 1), [])

  return (
    <div ref={measureRef} className="staff-fit">
      <svg
        viewBox={`0 -${HALF_HEIGHT} ${width} ${HALF_HEIGHT * 2}`}
        preserveAspectRatio="xMinYMid meet"
        className="staff"
        role="img"
        aria-label={
          sounding.length === 0
            ? 'Grand staff, no notes sounding'
            : `Grand staff: ${sounding.map((note) => staffNoteName(note, spellingFor(note))).join(', ')}`
        }
      >
        <StaffFrame width={width} />
        <KeySignature x={KEY_X} fifths={fifths} />

        <Chord
          x={noteX}
          notes={sounding.map((note) => ({ note, spelling: spellingFor(note) }))}
          value={value}
          fifths={fifths}
        />
      </svg>
    </div>
  )
}
