import { Music4 } from 'lucide-react'
import type { Instrument } from '@sonara/shared'
import { InstrumentSelect } from '@/features/instruments/InstrumentSelect'
import { StatusDot } from '@/ui/Display'
import { useMidi } from '@/midi/MidiProvider'

/**
 * The app bar reads the layout tokens rather than carrying its own gutter, so
 * the brand lines up with the first column of the content beneath it. A bar
 * with its own numbers agrees with the page by coincidence and stops agreeing
 * the moment either one moves.
 *
 * It carries the two things that are true of the whole session rather than of
 * any one exercise: which keyboard is connected, and which piano it is playing.
 */
export function AppBar({
  instruments,
  selectedId,
  onSelectInstrument,
}: {
  instruments: readonly Instrument[]
  selectedId: string | null
  onSelectInstrument: (instrument: Instrument) => void
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--ds-border-subtle)] bg-[var(--ds-canvas)]/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[var(--ds-layout-container)] items-center gap-3 px-[var(--ds-layout-gutter)] sm:px-[var(--ds-layout-gutter-lg)]">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[var(--ds-accent)] text-[var(--ds-accent-fg)]"
          aria-hidden
        >
          <Music4 size={17} />
        </span>
        <div className="flex min-w-0 items-baseline gap-2.5">
          <span className="text-h3 text-[var(--ds-fg)]">Sonara</span>
          {/* Hidden below lg rather than shrunk: a tagline that wraps to two
              lines in a 56px bar is worse than a tagline that waits. */}
          <span className="hidden truncate text-label text-[var(--ds-fg-muted)] lg:inline">
            Next Level Piano Mastery
          </span>
        </div>

        <div className="ml-auto flex min-w-0 items-center gap-3">
          <ConnectionPill />
          <InstrumentSelect
            instruments={instruments}
            selectedId={selectedId}
            onSelect={onSelectInstrument}
          />
        </div>
      </div>
    </header>
  )
}

/** Connection at a glance. The detail, and the fix, live in the device bar. */
function ConnectionPill() {
  const midi = useMidi()
  const connected = midi.connectedPorts.length

  return (
    <span className="hidden items-center gap-2 whitespace-nowrap md:inline-flex">
      <StatusDot tone={connected > 0 ? 'success' : 'neutral'} />
      <span className="text-label text-[var(--ds-fg-secondary)]">
        {connected === 0
          ? 'No keyboard'
          : connected === 1
            ? (midi.connectedPorts[0]!.name ?? 'Keyboard connected')
            : `${connected} keyboards`}
      </span>
    </span>
  )
}
