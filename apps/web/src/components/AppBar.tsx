import { AudioWaveform, Music4 } from 'lucide-react'
import type { Instrument } from '@sonara/shared'
import { InstrumentSelect } from '@/features/instruments/InstrumentSelect'
import { useMidi } from '@/midi/MidiProvider'
import { cn } from '@/lib/cn'

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
  catalogueFailed,
  statusSlot,
  overflow,
}: {
  instruments: readonly Instrument[]
  selectedId: string | null
  onSelectInstrument: (instrument: Instrument) => void
  catalogueFailed?: boolean
  /** The engine's state — loading, sampled, waiting for a gesture. */
  statusSlot?: React.ReactNode
  /** Everything past the two utilities the bar can hold at a narrow width. */
  overflow?: React.ReactNode
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
          {statusSlot}
          <MidiStatus />
          <InstrumentSelect
            instruments={instruments}
            selectedId={selectedId}
            onSelect={onSelectInstrument}
            failed={catalogueFailed}
          />
          {/* Set apart from the utilities: the overflow is not the next action
              in the row, it is where the rest of them went. */}
          <span className="ml-1">{overflow}</span>
        </div>
      </div>
    </header>
  )
}

/**
 * The keyboard's connection, as one icon in the bar.
 *
 * It used to be a strip above the piano — a title, a sentence and a button,
 * for a thing that is a single bit of state most of the time. The bit lives on
 * the icon now, as a dot on its corner, and everything that was in the strip
 * (the reason it is not connected, and the way to fix it) is behind the click.
 * That is the whole trade: a connection control is worth a glance and not a
 * row, and the row was coming out of the keyboard's height.
 */
/**
 * Whether a keyboard is connected, at a glance.
 *
 * A readout rather than a button: setting a keyboard up is a rare, considered
 * job that now lives in the overflow, and the bar can hold two utilities at a
 * narrow width. What is worth a permanent slot is the one bit — connected or
 * not — which is the thing you check without meaning to.
 */
function MidiStatus() {
  const midi = useMidi()
  const connected = midi.connectedPorts.length
  const name = connected === 1 ? (midi.connectedPorts[0]?.name ?? 'Keyboard') : null

  return (
    <span
      className="relative inline-flex shrink-0"
      role="img"
      aria-label={
        connected === 0
          ? 'No MIDI keyboard connected'
          : connected === 1
            ? `${name} connected`
            : `${connected} keyboards connected`
      }
      title={connected === 0 ? 'No MIDI keyboard connected' : `${name ?? connected} connected`}
    >
      <span className="grid h-8 w-8 place-items-center text-[var(--ds-fg-secondary)]" aria-hidden>
        <AudioWaveform size={17} />
      </span>
      {/* On the icon rather than beside it: the status belongs to the thing,
          and a separate dot would be one more item competing for the bar. */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute right-0.5 bottom-0.5 h-2 w-2 rounded-full ring-2 ring-[var(--ds-canvas)]',
          connected > 0 ? 'bg-[var(--ds-success)]' : 'bg-[var(--ds-fg-muted)]',
        )}
      />
    </span>
  )
}
