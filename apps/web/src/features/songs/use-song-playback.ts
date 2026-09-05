import * as React from 'react'
import type { Song, SongNote } from '@sonara/shared'
import { useAudio } from '@/audio/AudioProvider'
import { keyboardActions } from '@/state/keyboard-store'
import { useSongStore, type SongPart } from '@/state/song-store'

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

/** How often the scheduler looks. Short enough that a note lands on time. */
const TICK_MS = 25

export function useSongPlayback(song: Song | null) {
  const audio = useAudio()
  const playing = useSongStore((state) => state.playing)
  const part = useSongStore((state) => state.part)
  const tempoScale = useSongStore((state) => state.tempoScale)
  const loop = useSongStore((state) => state.loop)
  const metronome = useSongStore((state) => state.metronome)
  const setPlaying = useSongStore((state) => state.setPlaying)
  const seek = useSongStore((state) => state.seek)

  const audioRef = React.useRef(audio)
  audioRef.current = audio

  // Everything the tick reads goes through a ref: it runs forty times a second
  // and must not be rebuilt every time a control moves.
  const live = React.useRef({ song, part, tempoScale, loop, metronome })
  live.current = { song, part, tempoScale, loop, metronome }

  const sounding = React.useRef(new Set<number>())

  const silence = React.useCallback(() => {
    for (const note of sounding.current) {
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
    let originSong = useSongStore.getState().positionMs
    let originWall = performance.now()
    let cursor = originSong
    let lastBeat = -1

    const loopBounds = () => {
      const { song: current, loop: range } = live.current
      if (!current || !range) return null
      return {
        from: (range.from - 1) * current.measureMs,
        to: Math.min(range.to * current.measureMs, current.durationMs),
      }
    }

    const timer = window.setInterval(() => {
      const { song: current, part: hands, tempoScale: scale, metronome: click } = live.current
      if (!current) return

      const bounds = loopBounds()
      let at = originSong + (performance.now() - originWall) * scale

      if (bounds && at >= bounds.to) {
        // Back to the top of the loop, and the clock restarts with it.
        silence()
        originSong = bounds.from
        originWall = performance.now()
        cursor = bounds.from
        lastBeat = -1
        at = bounds.from
      }

      if (!bounds && at >= current.durationMs) {
        silence()
        setPlaying(false)
        seek(0)
        return
      }

      for (const note of notesBetween(current, cursor, at, hands)) {
        const velocity = Math.min(127, Math.max(1, Math.round(note.velocity)))
        audioRef.current.noteOn(note.note, velocity)
        keyboardActions.noteOn(note.note, velocity, 'pointer')
        sounding.current.add(note.note)
        // The release is stretched by the same scale the gaps are, so a slow
        // pass is slower playing rather than the same playing with long gaps.
        window.setTimeout(() => {
          audioRef.current.noteOff(note.note)
          keyboardActions.noteOff(note.note)
          sounding.current.delete(note.note)
        }, note.durationMs / scale)
      }

      if (click) {
        const beat = Math.floor(at / (60000 / current.bpm))
        if (beat !== lastBeat) {
          lastBeat = beat
          tick(beat % Math.max(1, Math.round(current.beatsPerMeasure)) === 0)
        }
      }

      cursor = at
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

/** Notes beginning in (from, to], for the hands currently selected. */
function notesBetween(song: Song, from: number, to: number, part: SongPart): SongNote[] {
  return song.notes.filter(
    (note) => note.startMs > from && note.startMs <= to && (part === 'both' || note.hand === part),
  )
}

/** A click, made rather than sampled: no asset, no load, no failure mode. */
let clickContext: AudioContext | null = null
function tick(accented: boolean) {
  try {
    clickContext ??= new AudioContext()
    const context = clickContext
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.value = accented ? 1600 : 1100
    gain.gain.setValueAtTime(accented ? 0.16 : 0.09, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.05)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.06)
  } catch {
    // A metronome that will not start is not a reason to stop the song.
  }
}
