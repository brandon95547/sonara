import { useCurrentSong, useSongStore } from '@/state/song-store'
import { RunMeter } from '@/features/learning/RunMeter'

/**
 * Where you are in the piece, above the staff.
 *
 * Scrubbable, because the reason to look at a progress bar during practice is
 * almost always to go back to the bit that went wrong. Bars rather than
 * seconds under it: that is the number on the page in front of you.
 *
 * In Learn it is the run meter instead: nothing is playing, the only progress
 * there is is yours, and it cannot be dragged.
 */
export function SongProgress() {
  const song = useCurrentSong()
  const positionMs = useSongStore((state) => state.positionMs)
  const seek = useSongStore((state) => state.seek)
  const mode = useSongStore((state) => state.mode)
  const stepIndex = useSongStore((state) => state.stepIndex)
  const stepCount = useSongStore((state) => state.stepCount)
  if (!song) return null

  const learning = mode === 'learn'
  const fraction = song.durationMs > 0 ? positionMs / song.durationMs : 0
  const bar = Math.min(song.measureCount, Math.floor(positionMs / song.measureMs) + 1)

  // Learn cannot be scrubbed — it advances by playing — so it gets the same
  // meter a scale run does rather than a slider that will not move.
  if (learning) {
    return (
      <RunMeter done={stepIndex} total={stepCount} label="the song" className="run-meter--wide" />
    )
  }

  return (
    <div className="song-progress">
      <input
        type="range"
        className="sonara-slider song-progress__range"
        min={0}
        max={1000}
        step={1}
        value={Math.round(Math.min(1, Math.max(0, fraction)) * 1000)}
        aria-label="Position in the song"
        aria-valuetext={`Bar ${bar}`}
        onChange={(event) => seek((Number(event.target.value) / 1000) * song.durationMs)}
        style={
          {
            '--slider-from': '0%',
            '--slider-to': `${Math.min(1, Math.max(0, fraction)) * 100}%`,
          } as React.CSSProperties
        }
      />
      <span className="song-progress__label" data-tabular>
        Bar {bar} / {song.measureCount}
      </span>
    </div>
  )
}
