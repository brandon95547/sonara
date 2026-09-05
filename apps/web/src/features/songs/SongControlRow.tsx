import * as React from 'react'
import { ListMusic, Pause, Play, RotateCcw, SkipBack, SkipForward, Timer } from 'lucide-react'
import { Button, IconButton } from '@/ui/Button'
import { Select } from '@/ui/Controls'
import { cn } from '@/lib/cn'
import { useCurrentSong, useSongStore, type SongPart } from '@/state/song-store'
import { useSongPlayback } from './use-song-playback'
import { useSongLearning } from './use-song-learning'

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
  useSongLearning(song)

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

  const skip = (measures: number) =>
    store.seek(Math.max(0, Math.min(song.durationMs, store.positionMs + measures * song.measureMs)))

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--ds-border-subtle)] bg-[var(--ds-surface)] p-3.5 lg:flex-row lg:items-end lg:gap-4">
      <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-[1.9fr_0.8fr_1.1fr]">
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
          <div className="flex items-center gap-1.5">
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
            {/* Beside the tempo because it is the same question — how fast,
                and against what. The BPM it would print is the tempo already
                shown next to it. */}
            <IconButton
              size="sm"
              variant={store.metronome ? 'tonal' : 'outlined'}
              aria-pressed={store.metronome}
              label={
                store.metronome
                  ? `Metronome on, ${Math.round(song.bpm * store.tempoScale)} BPM`
                  : `Metronome off, ${Math.round(song.bpm * store.tempoScale)} BPM`
              }
              icon={<Timer />}
              onClick={() => store.setMetronome(!store.metronome)}
            />
          </div>
        </Labelled>
      </div>

      <div className="flex items-end gap-2 coarse:gap-3">
        <Labelled label="Guidance">
          <div
            role="radiogroup"
            aria-label="Guidance level"
            className="inline-flex items-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--ds-border-interactive)] bg-[var(--ds-field)] p-0.5"
          >
            {(['explore', 'learn'] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={option === store.mode}
                title={
                  option === 'explore'
                    ? 'Play the song and listen'
                    : 'Light the keys and wait for you to play them'
                }
                onClick={() => store.setMode(option)}
                className={cn(
                  'h-7 rounded-[var(--radius-sm)] px-2.5 text-label-sm transition-colors duration-[120ms]',
                  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ds-focus-ring)]',
                  option === store.mode
                    ? 'bg-[var(--ds-accent)] text-[var(--ds-accent-fg)]'
                    : 'text-[var(--ds-fg-secondary)] hover:bg-[var(--ds-layer-hover)] hover:text-[var(--ds-fg)]',
                )}
              >
                {option === 'explore' ? 'Explore' : 'Learn'}
              </button>
            ))}
          </div>
        </Labelled>

        {store.mode === 'learn' ? (
          store.learning ? (
            <Button
              size="md"
              variant="outlined"
              startIcon={<RotateCcw />}
              onClick={store.resetLearning}
            >
              Stop
            </Button>
          ) : (
            <Button size="md" startIcon={<Play />} onClick={store.startLearning}>
              Start
            </Button>
          )
        ) : (
          <div className="flex items-center gap-1">
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
        )}
      </div>
    </div>
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
