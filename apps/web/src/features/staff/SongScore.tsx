import * as React from 'react'
import { useSongStore, useCurrentSong } from '@/state/song-store'
import { useKeyboardStore } from '@/state/keyboard-store'
import { useMeasuredScore } from './score'
import { FlowView } from './FlowView'
import { SheetView } from './SheetView'
import type { Role } from './score-parts'

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
 *
 * Two ways to lay it out, and everything above is true of both. The measuring,
 * the fingering, the position and what is sounding are worked out here, once,
 * and handed to whichever view is showing — so the toggle changes the picture
 * and nothing else.
 */

/** How many steps ahead keep a marking, matching the keyboard's lookahead. */
const LOOKAHEAD = 4

export function SongScore() {
  const song = useCurrentSong()
  const part = useSongStore((state) => state.part)
  const mode = useSongStore((state) => state.mode)
  const view = useSongStore((state) => state.staffView)
  const stepIndex = useSongStore((state) => state.stepIndex)
  const positionMs = useSongStore((state) => state.positionMs)
  // What is under a finger right now. The staff and the keys light the same
  // notes at the same moment, which is the whole reason for having both.
  const active = useKeyboardStore((state) => state.active)
  const sounding = React.useMemo(() => new Set(Object.keys(active).map(Number)), [active])

  const { steps, measured } = useMeasuredScore(song, part)

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

  const roleFor = React.useCallback(
    (index: number): Role => {
      if (here < 0) return 'ahead'
      if (index < here) return 'played'
      if (index === here) return 'target'
      return index - here <= LOOKAHEAD ? 'upcoming' : 'ahead'
    },
    [here],
  )

  const shared = {
    measured,
    here,
    fifths: song?.key?.fifths ?? 0,
    beats: song?.timeSignature?.beats ?? 4,
    beatType: song?.timeSignature?.beatType ?? 4,
    sounding,
    roleFor,
    label: song
      ? `${song.title}, ${steps.length} steps, showing step ${Math.max(here, 0) + 1}`
      : 'Grand staff',
  }

  return view === 'sheet' ? <SheetView {...shared} /> : <FlowView {...shared} />
}
