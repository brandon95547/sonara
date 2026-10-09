import * as React from 'react'
import {
  playDuration,
  playbackVelocity,
  scoreWindows,
  type Song,
  type SongNote,
} from '@sonara/shared'
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
 * The clock here is the performance's, not the page's. A song's notes are in
 * score time, written once; where the score has a repeat, the same notes come
 * round again, and `scoreWindows` says which stretch of the page each stretch
 * of the performance plays.
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
 * A note is not struck by the look that finds it. Its sound is handed to the
 * audio clock there and then, to begin at the moment it is due, and a timer of
 * its own lights its key at that moment.
 *
 * The sound is on the audio clock because nothing else keeps time. Everything
 * here runs on the page's one thread, which is also what redraws the staff —
 * a few dozen milliseconds each time a chord changes, and a quarter of a
 * second when the page of music turns. A note struck by a timer waits for
 * that to finish. Measured, a third of the notes of a quick passage began
 * thirty to sixty-five milliseconds late: nothing at ninety beats a minute,
 * and most of the gap between two sixteenths at two hundred, which is why a
 * song played evenly when slow and stumbled when fast, and hung for a moment
 * at each page turn. A note the audio clock already holds starts on time
 * whatever the page is doing.
 *
 * Long enough to outlast the longest of those stalls; short enough that a
 * change of tempo is heard at once.
 */
const LOOKAHEAD_MS = 300

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
    // The notes the audio clock is holding: those not begun never sound, and
    // the rest are let go. Then the keys, and anything struck by hand.
    audioRef.current.stopPlayed()
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
    let originSong = useSongStore.getState().positionMs
    let originWall = performance.now()
    /** The tempo scale the two origins above were taken at. */
    let originScale = live.current.tempoScale
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

    /** As written: what a key is lit with, soft notes paler. */
    const velocityOf = (note: SongNote) => Math.min(127, Math.max(1, Math.round(note.velocity)))
    /**
     * As sounded: the written dynamics over half their range, so a pianissimo
     * can be heard and a fortissimo is not a jolt. See `playbackVelocity`.
     */
    const soundOf = (note: SongNote) => playbackVelocity(velocityOf(note))

    /**
     * Hands a note to the audio clock whole: when it begins, and how long it
     * lasts. False where there is no clock to hand it to — before the first
     * key press — and the strike below then sounds it itself.
     */
    const promise = (note: SongNote, delayMs: number, scale: number): boolean =>
      note.role !== 'percussion' &&
      audioRef.current.play(note.note, soundOf(note), delayMs, note.durationMs / scale)

    /**
     * A note's moment: its key goes down, and comes up when its time is over.
     * Its sound too, where the audio clock was not given it.
     */
    const strike = (note: SongNote, scale: number, promisedSound: boolean) => {
      const velocity = velocityOf(note)

      // A drum is not a note. On the percussion channel the number names an
      // instrument, so it goes to the kit and never near the piano or the
      // keys — and it has no duration to release, only a decay of its own.
      if (note.role === 'percussion') {
        hitDrum(note.note, soundOf(note))
        return
      }

      const strikeId = ++strikes.current
      if (!promisedSound) {
        // Struck again while it is still down: let go first, so the
        // instrument hears a new note rather than more of the old one.
        if (sounding.current.has(note.note)) audioRef.current.noteOff(note.note)
        audioRef.current.noteOn(note.note, soundOf(note))
      }
      sounding.current.set(note.note, strikeId)

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
        // A note the audio clock holds is let go by the clock, on time.
        if (!promisedSound) audioRef.current.noteOff(note.note)
        keyboardActions.noteOff(note.note)
      })
    }

    const look = () => {
      const { song: current, part: hands, tempoScale: scale, metronome: click } = live.current
      if (!current) return

      // A change of tempo starts the count again from where the song has got
      // to. Counted from the beginning at the new tempo, the playhead would
      // jump to where the song would have been had it always gone that fast —
      // forward into a burst of notes, or back into a silence.
      const wall = performance.now()
      if (scale !== originScale) {
        originSong += (wall - originWall) * originScale
        originWall = wall
        originScale = scale
      }
      const at = originSong + (wall - originWall) * scale

      if (at >= playDuration(current)) {
        silence()
        setPlaying(false)
        seek(0)
        return
      }

      // Everything due before the look after next, each on its own timer.
      const horizon = Math.max(cursor, at + LOOKAHEAD_MS * scale)
      for (const window of scoreWindows(current, cursor, horizon))
        for (const note of notesBetween(current, window.fromMs, window.toMs, hands)) {
          const delayMs = Math.max(0, (note.startMs + window.offsetMs - at) / scale)
          const promisedSound = promise(note, delayMs, scale)
          after(delayMs, () => strike(note, scale, promisedSound))
        }

      if (click) {
        const beat = Math.floor(at / (60000 / current.bpm))
        if (beat !== lastBeat) {
          lastBeat = beat
          playClick(beat % Math.max(1, Math.round(current.beatsPerMeasure)) === 0)
        }
      }

      cursor = horizon
      seek(at)
    }
    // Once now, so the note the song starts on is not kept waiting for the
    // first tick, and then on every tick after.
    look()
    const timer = window.setInterval(look, TICK_MS)

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
 * Notes beginning from `from` up to but not including `to`, in score time, for
 * the hands currently selected.
 *
 * Closed at the front, so the note a stretch opens on is in it: the first note
 * of the piece, and the first of a passage come back to by a repeat.
 *
 * The hand filter applies to the keyboard part only. Practising the left hand
 * of a song does not mean silencing its drummer.
 */
function notesBetween(song: Song, from: number, to: number, part: SongPart): SongNote[] {
  return song.notes.filter(
    (note) =>
      note.startMs >= from &&
      note.startMs < to &&
      (part === 'both' || note.role !== 'keyboard' || note.hand === part),
  )
}
