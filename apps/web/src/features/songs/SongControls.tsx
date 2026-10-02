import { ListMusic, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/ui/Button'
import { Field, SegmentedControl } from '@/ui/Controls'
import { Divider } from '@/ui/Display'
import { BarTabs } from '@/ui/BarTabs'
import { TempoField } from '@/ui/TempoField'
import { MetronomeIcon } from '@/ui/MetronomeIcon'
import { MODE_ICONS, OptionGroup, StartStopButton } from '@/features/learning/ScaleControls'
import { useCurrentSong, useSongStore, type SongMode, type SongPart } from '@/state/song-store'
import { panelActions } from '@/state/panel-store'
import { useSongPlayback } from './use-song-playback'
import { useSongLearning } from './use-song-learning'

/**
 * The Songs controls: on the bar, how the song is practised — the mode, the
 * tempo, the transport — and in the options panel, what is — which song, and
 * which hand's part of it.
 *
 * The playback and step-tracking engine is its own component, mounted whenever
 * the topic is Songs, and deliberately not part of any control. It used to live
 * inside the song row, which was fine while the row was always on screen; now
 * that controls fold away at narrow widths and live in a panel that closes, an
 * engine inside one would stop the song every time it did.
 */
export function SongEngine() {
  const song = useCurrentSong()
  useSongPlayback(song)
  useSongLearning(song)
  return null
}

const PART_OPTIONS: readonly { value: SongPart; label: string }[] = [
  { value: 'both', label: 'Both' },
  { value: 'right', label: 'Right' },
  { value: 'left', label: 'Left' },
]

/** The speeds a passage is usually practised at, as a share of the song's own. */
const SPEEDS = [0.5, 0.75, 1]
const percent = (scale: number) => `${Math.round(scale * 100)}%`

/**
 * The options of the Songs area, for the panel the bar's Options button opens:
 * which song, which hand's part, and how much of its speed.
 */
export function SongOptions() {
  const song = useCurrentSong()
  const part = useSongStore((state) => state.part)
  const setPart = useSongStore((state) => state.setPart)
  const tempoScale = useSongStore((state) => state.tempoScale)
  const setTempoScale = useSongStore((state) => state.setTempoScale)

  return (
    <>
      <OptionGroup>
        <Field label="Song">
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-ui text-[var(--ds-fg)]">
              {song ? song.title : 'No song is open'}
            </span>
            <Button
              variant="outlined"
              size="sm"
              startIcon={<ListMusic />}
              className="shrink-0"
              // The library is a panel of its own, and takes this one's place.
              onClick={() => panelActions.open('library')}
            >
              My songs
            </Button>
          </div>
        </Field>
      </OptionGroup>
      {song && (
        <>
          <Divider />
          <OptionGroup>
            <Field label="Hands">
              <SegmentedControl<SongPart>
                label="Hands"
                value={part}
                onChange={setPart}
                options={PART_OPTIONS}
              />
            </Field>
            {/* The bar's tempo moves it a step at a time; these are the three
                speeds worth one press. A speed that is none of them lights none. */}
            <Field
              label="Speed"
              hint={`${Math.round(song.bpm * tempoScale)} BPM. The song is written at ${Math.round(song.bpm)}.`}
            >
              <SegmentedControl
                label="Speed"
                value={String(tempoScale)}
                onChange={(scale) => setTempoScale(Number(scale))}
                options={SPEEDS.map((scale) => ({ value: String(scale), label: percent(scale) }))}
              />
            </Field>
          </OptionGroup>
        </>
      )}
    </>
  )
}

const SONG_MODES: readonly { value: SongMode; label: string; description: string }[] = [
  { value: 'explore', label: 'Explore', description: 'Play the song and listen' },
  { value: 'learn', label: 'Learn', description: 'Light the keys and wait for you to play them' },
]

/** Explore or Learn, side by side on the bar — the two a song has. */
export function SongModeTabs() {
  const mode = useSongStore((state) => state.mode)
  const setMode = useSongStore((state) => state.setMode)
  return (
    <BarTabs<SongMode>
      label="Mode"
      value={mode}
      onChange={setMode}
      options={SONG_MODES.map((option) => {
        const Icon = MODE_ICONS[option.value]
        return { ...option, icon: <Icon size={18} /> }
      })}
    />
  )
}

/** The slowest and fastest the store lets a song go, as a share of its own tempo. */
const MIN_SCALE = 0.25
const MAX_SCALE = 2

/**
 * The song's tempo, in beats a minute: on the bar, and in Settings for a bar
 * too narrow to hold it.
 *
 * The song keeps its speed as a share of the tempo it is written at, so that
 * opening another song keeps the share. The player thinks in beats a minute,
 * so that is what the field shows and what is typed into it.
 */
export function SongTempoControl({ className, panel }: { className?: string; panel?: boolean }) {
  const song = useCurrentSong()
  const tempoScale = useSongStore((state) => state.tempoScale)
  const setTempoScale = useSongStore((state) => state.setTempoScale)
  // No song, no tempo to set — and the bar needs the room for "Open a song".
  if (!song) return null
  const written = song.bpm
  return (
    <TempoField
      value={Math.round(written * tempoScale)}
      min={Math.ceil(written * MIN_SCALE)}
      max={Math.floor(written * MAX_SCALE)}
      // An arrow is a twentieth of the song's tempo: a step that can be heard.
      step={Math.max(1, Math.round(written * 0.05))}
      onChange={(bpm) => setTempoScale(bpm / written)}
      detail={`${percent(tempoScale)} of the song's tempo`}
      panel={panel}
      className={className}
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
 *
 * In the same place, and the same width. The mode tabs sit to the left of this,
 * and a transport that shrank to one button when Learn was pressed would slide
 * them out from under the pointer that had just pressed them. So Learn's Start
 * stands in the middle of the room the transport takes, where Play was.
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

  const learn = mode === 'learn'
  const skip = (measures: number) =>
    seek(Math.max(0, Math.min(song.durationMs, positionMs + measures * song.measureMs)))

  return (
    <div className="bar-swap">
      {/* Hidden rather than gone in Learn: it still holds the room open, and
          `visibility` takes it out of the Tab order and the accessibility tree. */}
      <div className={cn('bar-swap__layer', learn && 'bar-swap__layer--held')}>
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
      {learn && (
        <div className="bar-swap__layer">
          <StartStopButton running={learning} onStart={startLearning} onStop={resetLearning} />
        </div>
      )}
    </div>
  )
}
