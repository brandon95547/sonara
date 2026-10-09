import * as React from 'react'
import type { Song, SongNote } from '@sonara/shared'
import { useAudio } from '@/audio/AudioProvider'
import { hitDrum } from '@/audio/drum-kit'
import { keyboardActions } from '@/state/keyboard-store'
import { useSongStore, type SongPart } from '@/state/song-store'
import { click as playClick } from '@/audio/click'

/**
 * Plays a song through the same engine and the same keyboard the player uses.
 *
 * Scheduled on a timer against a wall clock rather than queued up front: the
 * tempo, the part and the loop can all change mid-phrase, and a queue built at
 * the start would have to be torn down and rebuilt on every one of them.
 *
 * Slowing down does not change pitch, and there is nothing to implement for
 * that — the tempo scale only stretches the gaps between notes. Nothing is
 * resampled, so nothing transposes. That is the advantage of playing a score
 * instead of an audio file.
 */

/** How often the scheduler looks. */
const TICK_MS = 25
/**
 * How far past the clock each look reaches, in real milliseconds.
 *
 * A note is not struck by the look that finds it. It is given a timer of its
 * own for the moment it is due, so it lands on that moment rather than on the
 * next look after it. Struck by the look, every note was up to a tick late and
 * no two were late by the same amount: a run of sixteenths at a hundred and
 * fifty milliseconds came out with gaps anywhere from a hundred and twenty-five
 * to a hundred and seventy-five. Two looks' worth, so a look that is itself
 * late still finds the notes in time.
 */
const LOOKAHEAD_MS = TICK_MS * 2

export function useSongPlayback(song: Song | null) {
  const audio = useAudio()
  const playing = useSongStore((state) => state.playing)
  const part = useSongStore((state) => state.part)
  const tempoScale = useSongStore((state) => state.tempoScale)
  const metronome = useSongStore((state) => state.metronome)
  const setPlaying = useSongStore((state) => state.setPlaying)
  const seek = useSongStore((state) => state.seek)

  const audioRef = React.useRef(audio)
  audioRef.current = audio

  // Everything the tick reads goes through a ref: it runs forty times a second
  // and must not be rebuilt every time a control moves.
  const live = React.useRef({ song, part, tempoScale, metronome })
  live.current = { song, part, tempoScale, metronome }

  /**
   * The keys that are down, each with the number of the strike holding it.
   *
   * A key is released by the strike that pressed it and by no other. Released
   * by pitch alone, a note repeated the moment the last one ended was let go by
   * the earlier note's timer as often as not, a few milliseconds after it had
   * been struck: it never sounded, and the phrase had a hole in it. Canon in D
   * has eighty-four notes placed like that.
   */
  const sounding = React.useRef(new Map<number, number>())
  const strikes = React.useRef(0)
  /** Every timer still to fire: the notes waiting to be struck, and the releases. */
  const timers = React.useRef(new Set<number>())

  const silence = React.useCallback(() => {
    for (const timer of timers.current) window.clearTimeout(timer)
    timers.current.clear()
    for (const note of sounding.current.keys()) {
      audioRef.current.noteOff(note)
      keyboardActions.noteOff(note)
    }
    sounding.current.clear()
  }, [])

  React.useEffect(() => {
    if (!playing || !song) {
      silence()
      return
    }

    // Where the playhead was when this run began, and the wall clock it began
    // at. Every position below is derived from those two and the tempo scale.
    const originSong = useSongStore.getState().positionMs
    const originWall = performance.now()
    let cursor = originSong
    let lastBeat = -1

    /** A timer that takes itself off the list when it fires. */
    const after = (delayMs: number, run: () => void) => {
      const timer = window.setTimeout(
        () => {
          timers.current.delete(timer)
          run()
        },
        Math.max(0, delayMs),
      )
      timers.current.add(timer)
    }

    const strike = (note: SongNote, scale: number) => {
      const velocity = Math.min(127, Math.max(1, Math.round(note.velocity)))

      // A drum is not a note. On the percussion channel the number names an
      // instrument, so it goes to the kit and never near the piano or the
      // keys — and it has no duration to release, only a decay of its own.
      if (note.role === 'percussion') {
        hitDrum(note.note, velocity)
        return
      }

      // Struck again while it is still down: let go first, so the instrument
      // hears a new note rather than more of the old one.
      if (sounding.current.has(note.note)) audioRef.current.noteOff(note.note)
      const strikeId = ++strikes.current
      sounding.current.set(note.note, strikeId)

      audioRef.current.noteOn(note.note, velocity)
      // Only the part being learned lights up. Bass and strings sound so the
      // piece makes sense, but they are not notes to put fingers on, and
      // lighting them would say they were.
      if (note.role === 'keyboard') keyboardActions.noteOn(note.note, velocity, 'pointer')

      // The release is stretched by the same scale the gaps are, so a slow
      // pass is slower playing rather than the same playing with long gaps.
      after(note.durationMs / scale, () => {
        // Struck again since: that strike holds the key now, and lets it go.
        if (sounding.current.get(note.note) !== strikeId) return
        sounding.current.delete(note.note)
        audioRef.current.noteOff(note.note)
        keyboardActions.noteOff(note.note)
      })
    }

    const timer = window.setInterval(() => {
      const { song: current, part: hands, tempoScale: scale, metronome: click } = live.current
      if (!current) return

      const at = originSong + (performance.now() - originWall) * scale

      if (at >= current.durationMs) {
        silence()
        setPlaying(false)
        seek(0)
        return
      }

      // Everything due before the look after next, each on its own timer.
      const horizon = Math.max(cursor, at + LOOKAHEAD_MS * scale)
      for (const note of notesBetween(current, cursor, horizon, hands))
        after((note.startMs - at) / scale, () => strike(note, scale))

      if (click) {
        const beat = Math.floor(at / (60000 / current.bpm))
        if (beat !== lastBeat) {
          lastBeat = beat
          playClick(beat % Math.max(1, Math.round(current.beatsPerMeasure)) === 0)
        }
      }

      cursor = horizon
      seek(at)
    }, TICK_MS)

    return () => {
      window.clearInterval(timer)
      silence()
    }
  }, [playing, song, silence, setPlaying, seek])

  // Dropping a hand mid-phrase must not leave that hand ringing.
  React.useEffect(() => {
    silence()
  }, [part, silence])
}

/**
 * Notes beginning in (from, to], for the hands currently selected.
 *
 * The hand filter applies to the keyboard part only. Practising the left hand
 * of a song does not mean silencing its drummer.
 */
function notesBetween(song: Song, from: number, to: number, part: SongPart): SongNote[] {
  return song.notes.filter(
    (note) =>
      note.startMs > from &&
      note.startMs <= to &&
      (part === 'both' || note.role !== 'keyboard' || note.hand === part),
  )
}
