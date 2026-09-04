import { Loader2, Piano } from 'lucide-react'
import type { Instrument } from '@sonara/shared'
import { Select } from '@/ui/Controls'
import { useAudio } from '@/audio/AudioProvider'
import { cn } from '@/lib/cn'

/**
 * The sound, as a control rather than a page.
 *
 * Choosing a piano is a setting on an instrument, not a decision you come back
 * to between exercises — so it belongs in the chrome, next to the keyboard
 * status, in one line. The card grid it replaced was the largest thing on the
 * screen and it was the least of what a player does here.
 *
 * The loading state stays visible, because it is the one moment the choice has
 * a consequence you can hear.
 */
export function InstrumentSelect({
  instruments,
  selectedId,
  onSelect,
  failed,
  className,
}: {
  instruments: readonly Instrument[]
  selectedId: string | null
  onSelect: (instrument: Instrument) => void
  /** The catalogue request failed. An empty list alone cannot say that. */
  failed?: boolean
  className?: string
}) {
  const { status } = useAudio()
  const loading = status.loadingSamples
  const fellBack = status.fallbackReason !== null

  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <span
        className={cn(
          'hidden h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-md)] sm:grid',
          fellBack
            ? 'bg-[var(--ds-warning-subtle)] text-[var(--ds-warning-text)]'
            : 'bg-[var(--ds-accent-subtle)] text-[var(--ds-accent-text)]',
        )}
        title={fellBack ? 'Samples unavailable — playing the built-in voice' : undefined}
        aria-hidden
      >
        {loading ? (
          <Loader2 size={15} className="animate-[spin_720ms_linear_infinite]" />
        ) : (
          <Piano size={15} />
        )}
      </span>

      <Select
        size="sm"
        aria-label="Piano"
        className="min-w-0 sm:w-52"
        value={selectedId ?? ''}
        disabled={instruments.length === 0}
        onChange={(event) => {
          const instrument = instruments.find((entry) => entry.id === event.target.value)
          if (instrument) onSelect(instrument)
        }}
        options={
          instruments.length > 0
            ? instruments.map((instrument) => ({ value: instrument.id, label: instrument.name }))
            : // "Loading" and "this failed" look identical from an empty list,
              // and only one of them is worth waiting for. Saying the wrong one
              // is how a broken app looks like a slow one.
              [{ value: '', label: failed ? 'Pianos unavailable' : 'Loading pianos…' }]
        }
      />
    </div>
  )
}
