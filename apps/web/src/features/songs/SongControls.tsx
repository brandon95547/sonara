import { Hand, ListMusic, Pause, Play, RotateCcw, SkipBack, SkipForward, Timer } from 'lucide-react'
import { cn } from '@/lib/cn'
import { SelectMenu } from '@/ui/Menu'
import { MetronomeIcon } from '@/ui/MetronomeIcon'
import { BarGlyph } from '@/ui/BarGlyph'
import { MODE_ICONS } from '@/features/learning/ScaleControls'
import { useCurrentSong, useSongStore, type SongPart } from '@/state/song-store'
import { panelActions } from '@/state/panel-store'
import { useSongPlayback } from './use-song-playback'
import { useSongLearning } from './use-song-learning'

/**
 * The Songs controls, as they sit in the app bar — which bit, how fast, how
 * many times, the three questions practising a passage consists of.
 *
 * The playback and step-tracking engine is its own component, mounted whenever
 * the topic is Songs, and deliberately not part of any control. It used to live
 * inside the song row, which was fine while the row was always on screen; now
 * that controls fold into menus at narrow widths, an engine inside one would
 * stop the song every time a menu closed.
 */
export function SongEngine() {
  const song = useCurrentSong()
  useSongPlayback(song)
  useSongLearning(song)
  return null
}

export function SongPicker() {
  const song = useCurrentSong()
  const label = song ? `Song: ${song.title}. Open my songs` : 'My songs'
  return (
    <button
      type="button"
      className="bar-icon-button"
      aria-label={label}
      title={label}
      onClick={() => panelActions.open('library')}
    >
      <ListMusic size={18} aria-hidden />
    </button>
  )
}

const PART_OPTIONS: readonly { value: SongPart; label: string }[] = [
  { value: 'both', label: 'Both Hands' },
  { value: 'right', label: 'Right Hand' },
  { value: 'left', label: 'Left Hand' },
]

const PART_BADGES: Record<SongPart, string> = { both: 'LR', right: 'R', left: 'L' }

/**
 * `iconOnly` in the bar, spelled out in Settings — the same control, and the
 * panel has the room the bar does not.
 */
export function PartMenu({ iconOnly = false }: { iconOnly?: boolean }) {
  const part = useSongStore((state) => state.part)
  const setPart = useSongStore((state) => state.setPart)
  return (
    <SelectMenu
      label="Part"
      value={part}
      options={PART_OPTIONS}
      onChange={setPart}
      iconOnly={iconOnly}
      icon={iconOnly ? <BarGlyph icon={<Hand size={18} />} badge={PART_BADGES[part]} /> : undefined}
      className={iconOnly ? 'bar-wide' : undefined}
    />
  )
}

export function SongGuidanceMenu({ iconOnly = false }: { iconOnly?: boolean }) {
  const mode = useSongStore((state) => state.mode)
  const setMode = useSongStore((state) => state.setMode)
  const Icon = MODE_ICONS[mode]
  return (
    <SelectMenu
      label={iconOnly ? 'Mode' : 'Guidance'}
      value={mode}
      options={[
        { value: 'explore', label: 'Explore', description: 'Play the song and listen' },
        {
          value: 'learn',
          label: 'Learn',
          description: 'Light the keys and wait for you to play them',
        },
      ]}
      onChange={setMode}
      iconOnly={iconOnly}
      icon={iconOnly ? <Icon size={18} aria-hidden /> : undefined}
      align={iconOnly ? 'end' : 'start'}
    />
  )
}

export function SongTempoMenu({ iconOnly = false }: { iconOnly?: boolean }) {
  const song = useCurrentSong()
  const tempoScale = useSongStore((state) => state.tempoScale)
  const setTempoScale = useSongStore((state) => state.setTempoScale)
  const percent = (scale: number) => `${Math.round(scale * 100)}%`
  const bpm = (scale: number) => (song ? ` · ${Math.round(song.bpm * scale)} BPM` : '')
  const steps = [0.5, 0.75, 1]
  // A custom speed set elsewhere stays visible and selectable rather than
  // being shown as whichever preset happens to be nearest.
  const values = steps.includes(tempoScale) ? steps : [...steps, tempoScale].sort((a, b) => a - b)
  return (
    <SelectMenu
      label="Tempo"
      value={tempoScale}
      display={`${percent(tempoScale)}${bpm(tempoScale)}`}
      options={values.map((scale) => ({ value: scale, label: `${percent(scale)}${bpm(scale)}` }))}
      onChange={setTempoScale}
      iconOnly={iconOnly}
      icon={
        iconOnly ? (
          <BarGlyph
            icon={<Timer size={18} />}
            badge={song ? String(Math.round(song.bpm * tempoScale)) : undefined}
          />
        ) : undefined
      }
      align={iconOnly ? 'end' : 'start'}
    />
  )
}

export function SongMetronomeToggle({ className }: { className?: string }) {
  const song = useCurrentSong()
  const on = useSongStore((state) => state.metronome)
  const tempoScale = useSongStore((state) => state.tempoScale)
  const setMetronome = useSongStore((state) => state.setMetronome)
  const bpm = song ? Math.round(song.bpm * tempoScale) : null
  return (
    <button
      type="button"
      className={cn('bar-icon-button', className)}
      aria-pressed={on}
      aria-label={`Metronome ${on ? 'on' : 'off'}${bpm ? `, ${bpm} BPM` : ''}`}
      title={on ? 'Metronome on' : 'Metronome'}
      // The click follows the song's own pulse, which is only there while the
      // song is playing — so it is offered where it can be heard.
      disabled={!song}
      onClick={() => setMetronome(!on)}
    >
      <MetronomeIcon />
    </button>
  )
}

/**
 * Explore plays the piece; Learn waits for you. So Explore gets a transport and
 * Learn gets a Start, in the same place, and never both.
 */
export function SongTransport() {
  const song = useCurrentSong()
  const mode = useSongStore((state) => state.mode)
  const learning = useSongStore((state) => state.learning)
  const playing = useSongStore((state) => state.playing)
  const positionMs = useSongStore((state) => state.positionMs)
  const { startLearning, resetLearning, setPlaying, seek } = useSongStore.getState()

  if (!song) {
    return (
      <button
        type="button"
        className="bar-start"
        title="Open a song"
        onClick={() => panelActions.open('library')}
      >
        <ListMusic size={18} aria-hidden />
        <span className="bar-start__label">Open a song</span>
      </button>
    )
  }

  if (mode === 'learn') {
    return learning ? (
      <button
        type="button"
        className="bar-start bar-start--stop"
        title="Stop"
        onClick={resetLearning}
      >
        <RotateCcw size={18} aria-hidden />
        <span className="bar-start__label">Stop</span>
      </button>
    ) : (
      <button type="button" className="bar-start" title="Start" onClick={startLearning}>
        <Play size={18} aria-hidden />
        <span className="bar-start__label">Start</span>
      </button>
    )
  }

  const skip = (measures: number) =>
    seek(Math.max(0, Math.min(song.durationMs, positionMs + measures * song.measureMs)))

  return (
    <div className="flex items-center gap-1 coarse:gap-3">
      <button
        type="button"
        className="bar-icon-button bar-wide"
        aria-label="Back a bar"
        title="Back a bar"
        onClick={() => skip(-1)}
      >
        <SkipBack size={18} aria-hidden />
      </button>
      <button
        type="button"
        className="bar-start"
        title={playing ? 'Pause' : 'Play'}
        onClick={() => setPlaying(!playing)}
      >
        {playing ? <Pause size={18} aria-hidden /> : <Play size={18} aria-hidden />}
        <span className="bar-start__label">{playing ? 'Pause' : 'Play'}</span>
      </button>
      <button
        type="button"
        className="bar-icon-button bar-wide"
        aria-label="Forward a bar"
        title="Forward a bar"
        onClick={() => skip(1)}
      >
        <SkipForward size={18} aria-hidden />
      </button>
    </div>
  )
}
