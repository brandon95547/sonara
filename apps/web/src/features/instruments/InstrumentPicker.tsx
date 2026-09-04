import { Check, Loader2, Piano, Zap, WifiOff } from 'lucide-react'
import type { Instrument } from '@sonara/shared'
import { Card } from '@/ui/Surface'
import { Chip } from '@/ui/Display'
import { cn } from '@/lib/cn'
import type { AudioStatus } from '@/audio/AudioProvider'

/**
 * The piano picker.
 *
 * Cards rather than a dropdown: choosing a piano is the one creative decision
 * on this screen, and each option has a name, a character and a state worth
 * showing. A `<select>` would reduce all of that to seven strings.
 *
 * The cards are radios, not buttons, which is what gives the group arrow-key
 * navigation and one tab stop instead of seven.
 */

export interface InstrumentPickerProps {
  instruments: readonly Instrument[]
  selectedId: string | null
  onSelect: (instrument: Instrument) => void
  status: AudioStatus
}

export function InstrumentPicker({
  instruments,
  selectedId,
  onSelect,
  status,
}: InstrumentPickerProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Piano"
      className={cn(
        // A scrolling row on a phone and a grid once there is room for one.
        'grid auto-cols-[15rem] grid-flow-col gap-3 overflow-x-auto pb-1 scrollbar-none',
        'sm:auto-cols-auto sm:grid-flow-row sm:grid-cols-2 sm:overflow-visible',
        'lg:grid-cols-3 xl:grid-cols-4',
      )}
    >
      {instruments.map((instrument) => (
        <InstrumentCard
          key={instrument.id}
          instrument={instrument}
          selected={instrument.id === selectedId}
          status={status}
          onSelect={() => onSelect(instrument)}
        />
      ))}
    </div>
  )
}

function InstrumentCard({
  instrument,
  selected,
  status,
  onSelect,
}: {
  instrument: Instrument
  selected: boolean
  status: AudioStatus
  onSelect: () => void
}) {
  const isCurrent = selected && status.instrumentId === instrument.id
  const loading = isCurrent && status.loadingSamples
  const fellBack = isCurrent && status.fallbackReason !== null
  const offlineByDesign = instrument.engine.kind === 'synth'

  return (
    <Card
      as="button"
      // Radio semantics: one tab stop for the group, arrow keys between options.
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      interactive
      selected={selected}
      variant="elevated"
      padding="none"
      className="flex flex-col gap-2 p-4 text-left"
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            'grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-md)]',
            selected
              ? 'bg-[var(--ds-accent)] text-[var(--ds-accent-fg)]'
              : 'bg-[var(--ds-accent-subtle)] text-[var(--ds-accent-text)]',
          )}
          aria-hidden
        >
          {instrument.family === 'electric' ? <Zap size={16} /> : <Piano size={16} />}
        </span>
        {selected && (
          <span className="text-[var(--ds-accent-text)]" aria-hidden>
            {loading ? (
              <Loader2 size={16} className="animate-[spin_720ms_linear_infinite]" />
            ) : (
              <Check size={16} />
            )}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-h4 text-[var(--ds-fg)]">{instrument.name}</span>
        <span className="text-body-sm leading-relaxed text-[var(--ds-fg-muted)]">
          {instrument.description}
        </span>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
        {offlineByDesign && (
          <Chip tone="success" icon={<WifiOff size={11} />}>
            Offline
          </Chip>
        )}
        {instrument.character.map((trait) => (
          <Chip key={trait}>{trait}</Chip>
        ))}
      </div>

      {/* State is announced in words, not just by a spinner: "still loading"
          and "loaded, but as the built-in voice" are different facts and a
          player deserves to know which one they are hearing. */}
      {loading && (
        <p className="text-caption text-[var(--ds-fg-muted)]">
          Loading samples{status.progress > 0 ? ` — ${Math.round(status.progress * 100)}%` : ''}.
          Playable now with the built-in voice.
        </p>
      )}
      {fellBack && (
        <p className="text-caption text-[var(--ds-warning-text)]">
          Samples unavailable — playing the built-in voice.
        </p>
      )}
    </Card>
  )
}
