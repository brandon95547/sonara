import type { Hand } from '../music/fingering.js'
import { songSteps, type Song, type SongNote } from './song.js'

/**
 * Which fingerings are worth printing.
 *
 * A derived fingering knows a number for every note, and printing all of them
 * buries the music: a page of a rag comes out with a thousand digits on it, one
 * under every notehead, and the notes stop being readable. No published edition
 * does that, and not because of ink — a fingering on every note tells you
 * nothing, because the ones that matter are indistinguishable from the ones
 * that follow from the note before.
 *
 * So this keeps the ones that say something the reader could not have worked
 * out, and drops the rest. Three cases earn a number:
 *
 *   · the first note of a run, since the hand has just arrived and could put
 *     any finger anywhere;
 *   · a move that breaks the pattern — a thumb turning under, a leap, any
 *     place the finger does not simply follow the pitch by one;
 *   · a grip the hand has not just been holding, because a chord is a shape and
 *     a shape has to be shown once.
 *
 * Everything it drops is still on the note. This decides what a *staff* prints;
 * the hand card and the keys still show the finger for whatever is under them,
 * which is where a player looks when they want the one they were not given.
 */

/** Long enough that the hand lifts and the next note starts a fresh position. */
const REPOSITION_MS = 700

/**
 * The grip, as the hand makes it — the fingers, not the keys.
 *
 * Comparing pitches instead was the first attempt and it thinned almost
 * nothing: a rag's chords change on every beat while the hand holds the same
 * shape throughout, so every one of them looked new. What a reader needs told
 * is that the shape has changed, not that the music has moved.
 */
const gripOf = (step: { notes: readonly SongNote[] }): string =>
  [...step.notes]
    .sort((a, b) => a.note - b.note)
    .map((note) => note.finger ?? '-')
    .join(',')

/** Far enough that the hand has left its position and has to find a new one. */
const LEAP = 12

/**
 * The notes whose fingering a staff should print.
 *
 * Returned as the note objects themselves, which are the same references the
 * song carries, so a caller can test membership without threading an id
 * through everything.
 */
export function fingeringHints(song: Song): Set<SongNote> {
  const shown = new Set<SongNote>()

  for (const hand of ['right', 'left'] as const) {
    let previous: {
      notes: readonly SongNote[]
      endMs: number
      shape: string
      anchor: number
    } | null = null

    for (const step of songSteps(song, hand as Hand)) {
      const notes = [...step.notes].sort((a, b) => a.note - b.note)
      const shape = gripOf(step)
      const gap = previous ? step.startMs - previous.endMs : Infinity
      const endMs = Math.max(...step.notes.map((n) => n.startMs + n.durationMs))

      const fresh = previous === null || gap >= REPOSITION_MS
      // The same grip, and the hand still near where it was. A leap needs the
      // fingering again even when the shape is unchanged, because the reader
      // has to re-anchor it somewhere new.
      const anchor = notes[0]!.note
      const moved = previous !== null && Math.abs(anchor - previous.anchor) > LEAP
      const repeated = previous !== null && previous.shape === shape && !moved

      let show = fresh
      if (!show && !repeated) {
        if (notes.length > 1 || (previous?.notes.length ?? 0) > 1) {
          // A grip, and not the one just held: the shape has to be shown.
          show = true
        } else {
          // Two single notes. The reader can infer the next finger when it
          // moves one with the pitch; anything else is a decision.
          const from = previous!.notes[0]!
          const to = notes[0]!
          const step_ = Math.sign(to.note - from.note)
          show = (to.finger ?? 0) - (from.finger ?? 0) !== step_
        }
      }

      if (show) for (const note of notes) if (note.finger !== undefined) shown.add(note)
      previous = { notes, endMs, shape, anchor }
    }
  }

  return shown
}
