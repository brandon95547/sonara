import { fingerPassage } from '../music/finger-passage.js'
import type { Hand } from '../music/fingering.js'
import { songSteps, type Song, type SongNote } from './song.js'

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
 * Single notes, in runs. Each hand's part is cut into stretches of one note at
 * a time and each stretch is fingered by `fingerPassage`, which searches every
 * possibility against a published model of what a hand finds difficult.
 *
 * Chords are left alone. The ergonomic model is for melodic fragments, and the
 * method books finger triads without regard for what follows them, which the
 * books' own cadences disprove. An empty finger on a chord is a gap you can
 * see; a confident wrong one is not.
 *
 * A run also ends at a rest long enough for the hand to reposition, because
 * after that the fingering before it constrains nothing.
 */

/** Long enough that the hand can lift, move and land somewhere new. */
const REPOSITION_MS = 700

interface Run {
  readonly hand: Hand
  readonly notes: SongNote[]
}

function runsFor(song: Song, hand: Hand): Run[] {
  const runs: Run[] = []
  let current: SongNote[] = []

  const end = () => {
    if (current.length > 0) runs.push({ hand, notes: current })
    current = []
  }

  for (const step of songSteps(song, hand)) {
    // A chord is not a melodic fragment; it ends the run rather than joining it.
    if (step.notes.length !== 1) {
      end()
      continue
    }
    const note = step.notes[0]!
    const previous = current.at(-1)
    if (previous && note.startMs - (previous.startMs + previous.durationMs) > REPOSITION_MS) end()
    current.push(note)
  }
  end()
  return runs.filter((run) => run.notes.length > 1)
}

/**
 * Returns the song with a finger on every note it could work one out for.
 *
 * A song that already carries fingering from its score is returned untouched:
 * whoever edited it knew more than this does.
 */
export function fingerSong(song: Song): Song {
  if (song.hasFingering) return song

  const chosen = new Map<SongNote, number>()
  for (const hand of ['right', 'left'] as const) {
    for (const run of runsFor(song, hand)) {
      const result = fingerPassage(
        run.notes.map((note) => note.note),
        hand,
      )
      if (result.fingers.length !== run.notes.length) continue // nothing playable
      run.notes.forEach((note, index) => chosen.set(note, result.fingers[index]!))
    }
  }
  if (chosen.size === 0) return song

  const notes = song.notes.map((note) => {
    const finger = chosen.get(note)
    return finger === undefined ? note : { ...note, finger }
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
