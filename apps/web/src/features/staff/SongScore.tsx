import * as React from 'react'
import {
  fingeringHints,
  playedSteps,
  scoreMsAt,
  type SongNote,
  type SongStep,
} from '@sonara/shared'
import { useSongStore, useCurrentSong } from '@/state/song-store'
import { barMarksOf, useMeasuredScore } from './score'
import { FlowView } from './FlowView'
import { SheetView } from './SheetView'
import type { Role } from './score-parts'

/**
 * The song, written out, with your place in it.
 *
 * `GrandStaff` draws what is sounding at this instant and nothing else, which
 * is right for free play — there is no score to follow. A song has one (and so
 * does a scale — see `ScaleScore`), and reading a single chord at a time out of
 * it is like being handed sheet music through a letterbox.
 *
 * So this draws the whole piece and marks where you are, in the same three
 * states the keyboard uses: what is behind you stays visible but quiet, what
 * you are on is the accent, and the next few carry the lighter wash. The two
 * pictures say the same thing about the same moment, which is the point — the
 * staff is where you learn to read it and the keys are where you learn to play
 * it, and a learner has to be able to look from one to the other.
 *
 * Two ways to lay it out, and everything above is true of both. The measuring,
 * the fingering and the position are worked out here, once, and handed to
 * whichever view is showing — so the toggle changes the picture and nothing
 * else.
 *
 * What is *sounding* deliberately does not come from here. This component
 * holds every chord in the piece, so subscribing it to the keyboard means
 * reconciling all of them on every note-on and every note-off. The chords near
 * the playhead watch the keys themselves instead.
 *
 * And it takes no props, so `memo` holds the whole score still while the stage
 * around it redraws. The stage watches the last note played, to follow the
 * player along the keyboard — which means it renders on every note-on, and
 * without this it took two hundred chords with it every time.
 */

/** How many steps ahead keep a marking, matching the keyboard's lookahead. */
const LOOKAHEAD = 4

/** The last step that has begun by `positionMs`, or -1 before the first. */
function stepAt(steps: readonly SongStep[], positionMs: number): number {
  let low = 0
  let high = steps.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (steps[middle]!.startMs <= positionMs) low = middle + 1
    else high = middle
  }
  return low - 1
}

export const SongScore = React.memo(function SongScore() {
  const song = useCurrentSong()
  const part = useSongStore((state) => state.part)
  const density = useSongStore((state) => state.fingering)
  const view = useSongStore((state) => state.staffView)

  /*
   * Which fingerings the page prints.
   *
   * Worked out before the score is measured, because a printed numeral takes
   * room and the spacing has to know. Computed once for the song rather than
   * per view: it is a property of the music and not of how it is being looked
   * at, and Sheet and Flow must agree about what the page says.
   *
   * The finger stays on every note either way. This decides what the staff
   * prints; the hand card and the keys still show whatever is under them.
   */
  const hints = React.useMemo(() => {
    if (!song || density === 'off') return new Set<SongNote>()
    if (density === 'all') return new Set(song.notes)
    return fingeringHints(song)
  }, [song, density])

  const { steps, measured } = useMeasuredScore(song, part, hints, view === 'sheet')

  /**
   * Which step is "here".
   *
   * In Learn it is the one you have to play. Anywhere else the song may be
   * playing itself, and the playhead is the truth.
   *
   * Asked of the store as a step, not worked out here from the time. The
   * playhead moves forty times a second and the step a few: subscribed to the
   * time, this component redrew the whole score on every tick of the clock,
   * which kept the browser too busy to strike the notes when they were due.
   * A song played with its staff showing came out late and uneven by a third
   * of a second, and in time with it hidden.
   */
  // The steps in the order they are played. With a repeat in the score that is
  // not the order they are written in: Learn counts along this, and the page
  // marks the written step it has come to.
  const order = React.useMemo(() => (song ? playedSteps(song, steps) : []), [song, steps])
  const here = useSongStore(
    React.useCallback(
      (state: { mode: string; stepIndex: number; positionMs: number }) =>
        state.mode === 'learn'
          ? (order[state.stepIndex] ?? -1)
          : // The playhead is in the performance's time; the steps are on the page.
            stepAt(steps, song ? scoreMsAt(song, state.positionMs) : state.positionMs),
      [steps, order, song],
    ),
  )

  const roleFor = React.useCallback(
    (index: number): Role => {
      if (here < 0) return 'ahead'
      if (index < here) return 'played'
      if (index === here) return 'target'
      return index - here <= LOOKAHEAD ? 'upcoming' : 'ahead'
    },
    [here],
  )

  // The bars that carry a repeat sign or stand under an ending bracket.
  const marks = React.useMemo(() => barMarksOf(song?.measures), [song])

  const shared = {
    measured,
    marks,
    here,
    fifths: song?.key?.fifths ?? 0,
    beats: song?.timeSignature?.beats ?? 4,
    beatType: song?.timeSignature?.beatType ?? 4,
    roleFor,
    label: song
      ? `${song.title}, ${steps.length} steps, showing step ${Math.max(here, 0) + 1}`
      : 'Grand staff',
  }

  return view === 'sheet' ? <SheetView {...shared} /> : <FlowView {...shared} />
})
