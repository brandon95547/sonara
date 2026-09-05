import * as React from 'react'
import { ListMusic, Pause, Play, Repeat, SkipBack, SkipForward, Timer } from 'lucide-react'
import { Button, IconButton } from '@/ui/Button'
import { Select } from '@/ui/Controls'
import { cn } from '@/lib/cn'
import { useCurrentSong, useSongStore, type SongPart } from '@/state/song-store'
import { useSongPlayback } from './use-song-playback'

/**
 * The controls for working on a piece, in the row the scale pickers use.
 *
 * Everything here answers "which bit, how fast, how many times" — the three
 * questions practising a passage actually consists of. It replaces the scale
 * row rather than joining it, because a song and a scale are never being
 * practised at the same moment.
 */
export function SongControlRow({ onBrowse }: { onBrowse: () => void }) {
  const song = useCurrentSong()
  const store = useSongStore()
  useSongPlayback(song)

  if (!song) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--ds-border-subtle)] bg-[var(--ds-surface)] p-3.5">
        <p className="text-body-sm text-[var(--ds-fg-secondary)]">
          No song open. Import a MIDI or MusicXML file to practise along with it — the keyboard
          works either way.
        </p>
        <Button size="sm" startIcon={<ListMusic />} onClick={onBrowse} className="ml-auto">
          My songs
        </Button>
      </div>
    )
  }

  const bar = Math.min(song.measureCount, Math.floor(store.positionMs / song.measureMs) + 1)
  const skip = (measures: number) =>
    store.seek(Math.max(0, Math.min(song.durationMs, store.positionMs + measures * song.measureMs)))

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--ds-border-subtle)] bg-[var(--ds-surface)] p-3.5 lg:flex-row lg:items-end lg:gap-4">
      <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-[1.6fr_0.9fr_1fr_1.4fr]">
        <Labelled label="Song">
          <button
            type="button"
            onClick={onBrowse}
            className="flex h-9 w-full items-center gap-2 truncate rounded-[var(--radius-md)] border border-[var(--ds-border-interactive)] bg-[var(--ds-field)] px-3 text-left text-ui text-[var(--ds-fg)] hover:bg-[var(--ds-layer-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-focus-ring)]"
          >
            <ListMusic size={14} className="shrink-0 text-[var(--ds-fg-muted)]" />
            <span className="truncate">{song.title}</span>
          </button>
        </Labelled>

        <Labelled label="Part">
          <Select
            size="sm"
            aria-label="Part"
            value={store.part}
            onChange={(event) => store.setPart(event.target.value as SongPart)}
            options={[
              { value: 'both', label: 'Both' },
              { value: 'right', label: 'Right' },
              { value: 'left', label: 'Left' },
            ]}
          />
        </Labelled>

        <Labelled label="Tempo">
          <Select
            size="sm"
            aria-label="Tempo"
            value={String(store.tempoScale)}
            onChange={(event) => store.setTempoScale(Number(event.target.value))}
            options={[
              { value: '0.5', label: '50%' },
              { value: '0.75', label: '75%' },
              { value: '1', label: '100%' },
              ...(![0.5, 0.75, 1].includes(store.tempoScale)
                ? [
                    {
                      value: String(store.tempoScale),
                      label: `${Math.round(store.tempoScale * 100)}%`,
                    },
                  ]
                : []),
            ]}
          />
        </Labelled>

        <Labelled label={`Loop · bar ${bar} of ${song.measureCount}`}>
          <LoopControl />
        </Labelled>
      </div>

      <div className="flex items-end gap-2 coarse:gap-3">
        <Labelled label="Metronome">
          <button
            type="button"
            aria-pressed={store.metronome}
            onClick={() => store.setMetronome(!store.metronome)}
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] border px-2.5 text-label-sm transition-colors duration-[120ms]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-focus-ring)]',
              store.metronome
                ? 'border-[var(--ds-accent-border)] bg-[var(--ds-accent-subtle)] text-[var(--ds-accent-text)]'
                : 'border-[var(--ds-border-interactive)] text-[var(--ds-fg-secondary)] hover:bg-[var(--ds-layer-hover)]',
            )}
          >
            <Timer size={13} aria-hidden />
            {Math.round(song.bpm * store.tempoScale)} BPM
          </button>
        </Labelled>

        <div className="mb-0 flex items-center gap-1">
          <IconButton
            size="md"
            variant="outlined"
            label="Back a bar"
            icon={<SkipBack />}
            onClick={() => skip(-1)}
          />
          <IconButton
            size="md"
            variant="filled"
            label={store.playing ? 'Pause' : 'Play the song'}
            icon={store.playing ? <Pause /> : <Play />}
            onClick={() => store.setPlaying(!store.playing)}
          />
          <IconButton
            size="md"
            variant="outlined"
            label="Forward a bar"
            icon={<SkipForward />}
            onClick={() => skip(1)}
          />
        </div>
      </div>
    </div>
  )
}

/**
 * The loop, in bar numbers.
 *
 * Bars rather than seconds because that is what a player reads off the music
 * and what a teacher says out loud — "take it from twelve to sixteen".
 */
function LoopControl() {
  const song = useCurrentSong()
  const loop = useSongStore((state) => state.loop)
  const setLoop = useSongStore((state) => state.setLoop)
  const [from, setFrom] = React.useState(1)
  const [to, setTo] = React.useState(4)

  if (!song) return null
  const on = loop !== null

  const apply = (nextFrom: number, nextTo: number) => {
    const low = Math.max(1, Math.min(song.measureCount, nextFrom))
    const high = Math.max(low, Math.min(song.measureCount, nextTo))
    setFrom(low)
    setTo(high)
    if (on) setLoop({ from: low, to: high })
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-pressed={on}
        title={on ? 'Stop looping' : `Repeat bars ${from} to ${to}`}
        onClick={() => setLoop(on ? null : { from, to })}
        className={cn(
          'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] border px-2.5 text-label-sm transition-colors duration-[120ms]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-focus-ring)]',
          on
            ? 'border-[var(--ds-accent-border)] bg-[var(--ds-accent-subtle)] text-[var(--ds-accent-text)]'
            : 'border-[var(--ds-border-interactive)] text-[var(--ds-fg-secondary)] hover:bg-[var(--ds-layer-hover)]',
        )}
      >
        <Repeat size={13} aria-hidden />
        Loop
      </button>
      <BarInput label="Loop from bar" value={from} onChange={(value) => apply(value, to)} />
      <span className="text-label-sm text-[var(--ds-fg-muted)]">–</span>
      <BarInput label="Loop to bar" value={to} onChange={(value) => apply(from, value)} />
    </div>
  )
}

function BarInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <input
      type="number"
      min={1}
      aria-label={label}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="h-9 w-14 rounded-[var(--radius-md)] border border-[var(--ds-border-interactive)] bg-[var(--ds-field)] px-2 text-ui text-[var(--ds-fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-focus-ring)]"
      data-tabular
    />
  )
}

function Labelled({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="truncate text-label-sm text-[var(--ds-fg-muted)]">{label}</span>
      {children}
    </div>
  )
}
