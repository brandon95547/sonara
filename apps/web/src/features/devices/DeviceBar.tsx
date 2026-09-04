import * as React from 'react'
import { Cable, Settings2, ShieldAlert, Usb } from 'lucide-react'
import { Button, IconButton } from '@/ui/Button'
import { Chip, StatusDot } from '@/ui/Display'
import { useMidi } from '@/midi/MidiProvider'
import { MIDI_UNAVAILABLE_COPY } from '@/midi/midi-access'

/**
 * The connection strip.
 *
 * Every state of MIDI access gets its own sentence, because each one has a
 * different fix and "MIDI unavailable" helps with none of them. The one filled
 * button on this screen lives here — the UI Bible's rule is one per view, and
 * until a keyboard is connected, connecting one is what you came to do.
 */
export function DeviceBar({ onConfigure }: { onConfigure: () => void }) {
  const midi = useMidi()

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-lg)] border border-[var(--ds-border-subtle)] bg-[var(--ds-surface)] px-3.5 py-3">
      <Status />
      <div className="ml-auto flex items-center gap-2 coarse:gap-3">
        {midi.access.state === 'ready' && (
          <IconButton
            label="Keyboard settings"
            icon={<Settings2 />}
            size="sm"
            variant="outlined"
            onClick={onConfigure}
            disabled={midi.connectedPorts.length === 0}
          />
        )}
        {midi.canRequest && (
          <Button
            size="sm"
            startIcon={<Cable />}
            loading={midi.access.state === 'requesting'}
            onClick={midi.connect}
          >
            Connect a keyboard
          </Button>
        )}
      </div>
    </div>
  )
}

function Status() {
  const midi = useMidi()

  switch (midi.access.state) {
    case 'idle':
      return (
        <Line
          tone="neutral"
          title="No keyboard connected"
          detail="Play with the mouse or your touchscreen, or plug in a USB MIDI keyboard."
        />
      )

    case 'requesting':
      return (
        <Line
          tone="info"
          pulse
          title="Asking for MIDI access"
          detail="Allow it in the browser prompt."
        />
      )

    case 'denied':
      return (
        <Line
          tone="warning"
          icon={<ShieldAlert size={14} />}
          title="MIDI access was blocked"
          detail="Allow MIDI for this site from the padlock in the address bar, then reconnect."
        />
      )

    case 'unavailable': {
      const copy = MIDI_UNAVAILABLE_COPY[midi.access.reason]
      return <Line tone="warning" title={copy.title} detail={copy.detail} />
    }

    case 'error':
      return <Line tone="danger" title="MIDI could not start" detail={midi.access.message} />

    case 'ready': {
      if (midi.connectedPorts.length === 0) {
        return (
          <Line
            tone="warning"
            title="MIDI is on, but no keyboard is plugged in"
            detail="Connect one over USB — it will appear here as soon as the browser sees it."
          />
        )
      }
      return (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <StatusDot tone="success" />
          <span className="text-ui text-[var(--ds-fg)]">
            {midi.connectedPorts.length === 1
              ? 'Keyboard connected'
              : `${midi.connectedPorts.length} keyboards connected`}
          </span>
          {midi.connectedPorts.map((port) => (
            <Chip key={port.id} tone="success" icon={<Usb size={11} />}>
              {port.name}
              {port.device ? ` · ${port.device.keyCount} keys` : ''}
            </Chip>
          ))}
        </div>
      )
    }
  }
}

function Line({
  tone,
  title,
  detail,
  icon,
  pulse,
}: {
  tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger'
  title: string
  detail: string
  icon?: React.ReactNode
  pulse?: boolean
}) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <span className="mt-1.5 shrink-0">{icon ?? <StatusDot tone={tone} pulse={pulse} />}</span>
      <div className="flex min-w-0 flex-col">
        <span className="text-ui text-[var(--ds-fg)]">{title}</span>
        <span className="text-caption text-[var(--ds-fg-muted)]">{detail}</span>
      </div>
    </div>
  )
}
