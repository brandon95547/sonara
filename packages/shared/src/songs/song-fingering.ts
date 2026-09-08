import { fingerSteps } from '../music/finger-steps.js'
import type { Hand } from '../music/fingering.js'
import { songSteps, type Song, type SongNote, type SongStep } from './song.js'

/**
 * Working out the fingering for a song that arrived without any.
 *
 * MIDI has nowhere to record which finger plays a note — the format has no
 * field for it — and plenty of scores are published unfingered. Until now
 * Sonara said so and left the hand card empty, which is honest but not much
 * help. This fills it in where it can, and still says so.
 *
 * ## What it fingers, and what it leaves alone
 *
 * A hand's part is cut into stretches and each stretch is fingered by
 * `fingerSteps`, which searches every way the hand could take it against a
 * published model of what a hand finds difficult. Single notes, intervals and
 * chords are all steps; the search does not care which is which, so a part that
 * alternates between them is fingered end to end rather than in the fragments
 * between its chords.
 *
 * A step nothing can hold — more notes than fingers, or a span no hand covers —
 * is left blank, and so is the fingering either side of it, because what
 * follows a jump like that is a fresh hand position with nothing to inherit.
 *
 * A stretch also ends at a rest long enough for the hand to reposition, after
 * which the fingering before it constrains nothing.
 */

/** Long enough that the hand can lift, move and land somewhere new. */
const REPOSITION_MS = 700

function runsFor(song: Song, hand: Hand): SongStep[][] {
  const runs: SongStep[][] = []
  let current: SongStep[] = []

  for (const step of songSteps(song, hand)) {
    const previous = current.at(-1)
    const gap = previous
      ? step.startMs - Math.max(...previous.notes.map((n) => n.startMs + n.durationMs))
      : 0
    if (previous && gap > REPOSITION_MS) {
      runs.push(current)
      current = []
    }
    current.push(step)
  }
  if (current.length > 0) runs.push(current)
  return runs
}

export function fingerSong(song: Song): Song {
  if (song.hasFingering) return song

  const chosen = new Map<SongNote, number>()
  // Chords the hand cannot close on at once. Kept per note rather than per
  // step, because a step can span both hands and only one of them may be
  // spread — and because the note is what everything downstream holds.
  const spread = new Set<SongNote>()
  for (const hand of ['right', 'left'] as const) {
    for (const run of runsFor(song, hand)) {
      // Each step's notes in pitch order, which is the order a grip is held in.
      const pitches = run.map((step) =>
        [...step.notes].sort((a, b) => a.note - b.note).map((note) => note.note),
      )
      const fingered = fingerSteps(pitches, hand)
      fingered.forEach((step, index) => {
        if (!step) return
        const ordered = [...run[index]!.notes].sort((a, b) => a.note - b.note)
        ordered.forEach((note, i) => {
          chosen.set(note, step.fingers[i]!)
          if (step.rolled) spread.add(note)
        })
      })
    }
  }
  if (chosen.size === 0) return song

  const notes = song.notes.map((note) => {
    const finger = chosen.get(note)
    if (finger === undefined) return note
    return spread.has(note) ? { ...note, finger, rolled: true } : { ...note, finger }
  })

  return {
    ...song,
    notes,
    hasFingering: true,
    // `provides` is about what the *file* held, and the file held nothing. What
    // changed is that we worked some out, which is a different claim and is
    // recorded separately so the card can say which it is showing.
    fingeringSource: 'derived',
  }
}
