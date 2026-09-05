import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Cable, RotateCcw } from 'lucide-react'
import {
  KEY_COUNTS,
  noteName,
  STANDARD_RANGES,
  VELOCITY_CURVE_DESCRIPTIONS,
  VELOCITY_CURVE_LABELS,
  VELOCITY_CURVES,
  type Device,
  type KeyCount,
  type UpdateDeviceConfigInput,
  type VelocityCurve,
} from '@sonara/shared'
import { api } from '@/lib/api'
import { Button } from '@/ui/Button'
import { Drawer } from '@/ui/Drawer'
import { Chip, Divider, StatusDot } from '@/ui/Display'
import { Field, SegmentedControl, Select, Slider, Switch } from '@/ui/Controls'
import { useMidi } from '@/midi/MidiProvider'
import { MIDI_UNAVAILABLE_COPY } from '@/midi/midi-access'

/**
 * Per-keyboard configuration.
 *
 * Everything here is stored against the keyboard, not against the app, because
 * every one of these settings is a fact about a particular piece of hardware:
 * a 25-key controller needs an octave shift that an 88-key piano does not, and
 * a light synth action needs a velocity curve that a hammer action does not.
 * Settings that followed the app instead would be wrong the moment a player
 * plugged in a second keyboard.
 */
export function DeviceSettingsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const midi = useMidi()
  const queryClient = useQueryClient()
  const device = midi.activeDevice

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['devices'] })

  const updateConfig = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateDeviceConfigInput }) =>
      api.updateDeviceConfig(id, patch),
    onSuccess: invalidate,
  })

  const resetConfig = useMutation({
    mutationFn: (id: string) => api.resetDeviceConfig(id),
    onSuccess: invalidate,
  })

  const patch = (next: UpdateDeviceConfigInput) => {
    if (device) updateConfig.mutate({ id: device.id, patch: next })
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Keyboard"
      description="Connect a MIDI keyboard, and set it up. Settings are saved per keyboard and restored the next time you plug it in."
      footer={
        device && (
          <Button
            variant="outlined"
            size="sm"
            startIcon={<RotateCcw />}
            loading={resetConfig.isPending}
            onClick={() => resetConfig.mutate(device.id)}
          >
            Reset to detected
          </Button>
        )
      }
    >
      {/* Connecting used to live in a strip above the piano. It is here now,
          because this is where someone looking for their keyboard will come —
          and because every state of MIDI access needs a different sentence, and
          a drawer has room for the sentence where a toolbar icon does not. */}
      <ConnectionState />

      {midi.connectedPorts.length > 1 && (
        <Field label="Keyboard" className="mb-5">
          <Select
            value={midi.activePortId ?? ''}
            onChange={(event) => midi.setActivePortId(event.target.value)}
            options={midi.connectedPorts.map((port) => ({ value: port.id, label: port.name }))}
          />
        </Field>
      )}

      {!device ? (
        <p className="text-body-sm text-[var(--ds-fg-muted)]">
          {midi.connectedPorts.length === 0
            ? 'No keyboard is connected. Plug one in over USB and its settings will appear here.'
            : 'Reading this keyboard’s settings…'}
        </p>
      ) : (
        <DeviceForm device={device} onPatch={patch} pending={updateConfig.isPending} />
      )}
    </Drawer>
  )
}

/**
 * Why there is no keyboard, and what to do about it.
 *
 * Each state of Web MIDI gets its own sentence, because each one has a
 * different fix and "MIDI unavailable" helps with none of them.
 */
function ConnectionState() {
  const midi = useMidi()

  const body = (() => {
    switch (midi.access.state) {
      case 'idle':
        return {
          tone: 'neutral' as const,
          title: 'No keyboard connected',
          detail: 'Play with the mouse or your touchscreen, or connect a USB MIDI keyboard.',
        }
      case 'requesting':
        return {
          tone: 'info' as const,
          title: 'Asking for MIDI access',
          detail: 'Allow it in the browser prompt.',
        }
      case 'denied':
        return {
          tone: 'warning' as const,
          title: 'MIDI access was blocked',
          detail:
            'Allow MIDI for this site from the padlock in the address bar, then connect again.',
        }
      case 'unavailable':
        return { tone: 'warning' as const, ...MIDI_UNAVAILABLE_COPY[midi.access.reason] }
      case 'error':
        return {
          tone: 'danger' as const,
          title: 'MIDI could not start',
          detail: midi.access.message,
        }
      case 'ready':
        return midi.connectedPorts.length === 0
          ? {
              tone: 'warning' as const,
              title: 'MIDI is on, but no keyboard is plugged in',
              detail: 'Connect one over USB — it appears here as soon as the browser sees it.',
            }
          : {
              tone: 'success' as const,
              title:
                midi.connectedPorts.length === 1
                  ? 'Keyboard connected'
                  : `${midi.connectedPorts.length} keyboards connected`,
              detail: midi.connectedPorts
                .map(
                  (port) => `${port.name}${port.device ? ` · ${port.device.keyCount} keys` : ''}`,
                )
                .join(' · '),
            }
    }
  })()

  return (
    <div className="mb-5 flex flex-col gap-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-1.5 shrink-0">
          <StatusDot tone={body.tone} pulse={midi.access.state === 'requesting'} />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="text-ui text-[var(--ds-fg)]">{body.title}</span>
          <span className="text-body-sm text-[var(--ds-fg-muted)]">{body.detail}</span>
        </div>
      </div>
      {midi.canRequest && (
        <Button
          size="sm"
          startIcon={<Cable />}
          loading={midi.access.state === 'requesting'}
          onClick={midi.connect}
          className="w-fit"
        >
          Connect a keyboard
        </Button>
      )}
    </div>
  )
}

function DeviceForm({
  device,
  onPatch,
  pending,
}: {
  device: Device
  onPatch: (patch: UpdateDeviceConfigInput) => void
  pending: boolean
}) {
  const { config } = device

  // Local echo for the sliders. A slider that waits for a round trip before it
  // moves feels broken; the server value takes over again on the next render
  // after the mutation settles.
  const [transpose, setTranspose] = React.useState(config.transpose)
  const [fixedVelocity, setFixedVelocity] = React.useState(config.fixedVelocity)
  React.useEffect(() => setTranspose(config.transpose), [config.transpose])
  React.useEffect(() => setFixedVelocity(config.fixedVelocity), [config.fixedVelocity])

  const keyCount = String(device.keyCount) as `${KeyCount}`

  return (
    <div className="flex flex-col gap-6" aria-busy={pending}>
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-h4 text-[var(--ds-fg)]">{device.name}</span>
          <Chip tone={device.profileId ? 'success' : 'neutral'}>
            {device.profileId ? 'Recognised' : 'Detected from name'}
          </Chip>
        </div>
        <p className="text-caption text-[var(--ds-fg-muted)]">
          {device.manufacturer || 'Unknown manufacturer'} · {device.keyCount} keys ·{' '}
          {noteName(config.range.low)}–{noteName(config.range.high)}
        </p>
      </section>

      <Divider />

      <Field
        label="Keyboard size"
        hint="Sets the range Sonara expects from this controller. Change it if the detected size is wrong."
      >
        <Select
          value={keyCount}
          onChange={(event) =>
            onPatch({ range: STANDARD_RANGES[Number(event.target.value) as KeyCount] })
          }
          options={KEY_COUNTS.map((count) => ({
            value: String(count),
            label: `${count} keys · ${noteName(STANDARD_RANGES[count].low)}–${noteName(STANDARD_RANGES[count].high)}`,
          }))}
        />
      </Field>

      <Slider
        label="Transpose"
        min={-12}
        max={12}
        value={transpose}
        onChange={setTranspose}
        onCommit={(value) => value !== config.transpose && onPatch({ transpose: value })}
        formatValue={(value) => (value === 0 ? 'None' : `${value > 0 ? '+' : ''}${value} st`)}
        origin="center"
      />

      <Field label="Octave shift" hint="Reach notes a smaller controller does not physically have.">
        <SegmentedControl
          label="Octave shift"
          value={String(config.octaveShift)}
          onChange={(value) => onPatch({ octaveShift: Number(value) })}
          options={[
            { value: '-2', label: '−2' },
            { value: '-1', label: '−1' },
            { value: '0', label: '0' },
            { value: '1', label: '+1' },
            { value: '2', label: '+2' },
          ]}
        />
      </Field>

      <Field label="Velocity curve" hint={VELOCITY_CURVE_DESCRIPTIONS[config.velocityCurve]}>
        <Select
          value={config.velocityCurve}
          onChange={(event) => onPatch({ velocityCurve: event.target.value as VelocityCurve })}
          options={VELOCITY_CURVES.map((curve) => ({
            value: curve,
            label: VELOCITY_CURVE_LABELS[curve],
          }))}
        />
      </Field>

      {config.velocityCurve === 'fixed' && (
        <Slider
          label="Fixed velocity"
          min={1}
          max={127}
          value={fixedVelocity}
          onChange={setFixedVelocity}
          onCommit={(value) => value !== config.fixedVelocity && onPatch({ fixedVelocity: value })}
        />
      )}

      <Field
        label="MIDI channel"
        hint="Omni listens to everything. Pick a channel if this keyboard shares a cable with another instrument."
      >
        <Select
          value={config.channelFilter === null ? 'omni' : String(config.channelFilter)}
          onChange={(event) =>
            onPatch({
              channelFilter: event.target.value === 'omni' ? null : Number(event.target.value),
            })
          }
          options={[
            { value: 'omni', label: 'Omni — all channels' },
            ...Array.from({ length: 16 }, (_, index) => ({
              value: String(index),
              // MIDI channels are 0-15 on the wire and 1-16 everywhere a
              // musician reads them. The UI shows the number on the hardware.
              label: `Channel ${index + 1}`,
            })),
          ]}
        />
      </Field>

      <Divider />

      <Switch
        label="Sustain pedal"
        description="Honour CC 64 from this keyboard."
        checked={config.sustainEnabled}
        onChange={(checked) => onPatch({ sustainEnabled: checked })}
      />
    </div>
  )
}
