import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  applyVelocityCurve,
  decodeMidiMessage,
  DEFAULT_DEVICE_CONFIG,
  fingerprintDevice,
  isSustainDown,
  MIDI_CC,
  MIDI_NOTE_MAX,
  MIDI_NOTE_MIN,
  type Device,
  type DeviceConfig,
} from '@sonara/shared'
import { api } from '@/lib/api'
import { useAudio } from '@/audio/AudioProvider'
import { keyboardActions } from '@/state/keyboard-store'
import { learningActions } from '@/state/learning-store'
import { requestMidiAccess, detectMidiSupport, type MidiAccessState } from './midi-access'

/**
 * Connects USB MIDI keyboards to the app.
 *
 * ## The ingest pipeline
 *
 * Every byte from a port goes through the same four steps, in this order, and
 * the order matters:
 *
 *   1. decode        raw bytes to a typed message (note-on velocity 0 becomes
 *                    a note-off here, not later — see the shared decoder)
 *   2. channel       drop anything the device's filter excludes
 *   3. velocity      apply the device's curve, so a light action and a hammer
 *                    action feel the same to everything downstream
 *   4. pitch         transpose and octave shift
 *
 * Doing pitch before channel would waste work on filtered messages; doing
 * velocity after pitch would be harmless but implies the two interact, and
 * they do not. Downstream — the keyboard and the engines — sees notes that
 * are already correct, and needs to know nothing about devices at all.
 *
 * ## Why every port is listened to
 *
 * Not "the selected device". A player with a controller and a digital piano
 * plugged in at once expects both to work, and each port carries its own
 * configuration, so there is no reason to make them choose. The device panel
 * picks which one you are *configuring*, not which one plays.
 */

export interface MidiPort {
  /** Stable fingerprint — the same id the API stores settings under. */
  id: string
  /** The browser's own port id. Not stable across USB sockets; used only to bind listeners. */
  portId: string
  name: string
  manufacturer: string
  connected: boolean
  /** Null until registration with the API returns. */
  device: Device | null
}

interface MidiApi {
  access: MidiAccessState
  /** True before any request has been made — the connect button's state. */
  canRequest: boolean
  connect: () => void
  ports: MidiPort[]
  connectedPorts: MidiPort[]
  /** The port whose settings the device panel is editing. */
  activePortId: string | null
  setActivePortId: (id: string | null) => void
  activeDevice: Device | null
}

const MidiContextValue = React.createContext<MidiApi | null>(null)

/** Applies transpose and octave shift. Returns null when the result leaves MIDI's range. */
function transposeNote(note: number, config: DeviceConfig): number | null {
  const shifted = note + config.transpose + config.octaveShift * 12
  // Dropped rather than clamped: clamping would pile every over-transposed note
  // onto note 127, which sounds like a fault and hides the real one.
  if (shifted < MIDI_NOTE_MIN || shifted > MIDI_NOTE_MAX) return null
  return shifted
}

export function MidiProvider({ children }: { children: React.ReactNode }) {
  const audio = useAudio()
  const queryClient = useQueryClient()

  const [access, setAccess] = React.useState<MidiAccessState>({ state: 'idle' })
  const [ports, setPorts] = React.useState<MidiPort[]>([])
  const [activePortId, setActivePortId] = React.useState<string | null>(null)

  const accessRef = React.useRef<MIDIAccess | null>(null)
  /**
   * Device configs, read on the MIDI hot path. A ref rather than state on
   * purpose: a note-on must not depend on a React render having happened, and
   * re-rendering the provider on every message would re-render the app.
   */
  const configsRef = React.useRef(new Map<string, DeviceConfig>())
  const audioRef = React.useRef(audio)
  audioRef.current = audio

  const devicesQuery = useQuery({
    queryKey: ['devices'],
    queryFn: ({ signal }) => api.listDevices(signal),
    staleTime: 30_000,
  })

  // Keep the hot-path lookup in step with the server's view of each device.
  React.useEffect(() => {
    const map = new Map<string, DeviceConfig>()
    for (const device of devicesQuery.data?.items ?? []) map.set(device.id, device.config)
    configsRef.current = map
    setPorts((current) =>
      current.map((port) => ({
        ...port,
        device: devicesQuery.data?.items.find((d) => d.id === port.id) ?? port.device,
      })),
    )
  }, [devicesQuery.data])

  const registerDevice = useMutation({
    mutationFn: api.registerDevice,
    onSuccess: (result) => {
      configsRef.current.set(result.device.id, result.device.config)
      void queryClient.invalidateQueries({ queryKey: ['devices'] })
    },
  })
  const registerRef = React.useRef(registerDevice.mutate)
  registerRef.current = registerDevice.mutate

  const handleMessage = React.useCallback((deviceId: string, data: Uint8Array) => {
    const message = decodeMidiMessage(data)
    if (!message) return

    // A port whose registration has not come back yet still has to play. The
    // defaults are the same ones the server would have given it.
    const config = configsRef.current.get(deviceId) ?? DEFAULT_DEVICE_CONFIG
    if (config.channelFilter !== null && message.channel !== config.channelFilter) return

    switch (message.type) {
      case 'noteOn': {
        const note = transposeNote(message.note, config)
        if (note === null) return
        const velocity = applyVelocityCurve(
          message.velocity,
          config.velocityCurve,
          config.fixedVelocity,
        )
        keyboardActions.noteOn(note, velocity, 'midi')
        audioRef.current.noteOn(note, velocity)
        // The learning session sees the note AFTER the device's transpose and
        // octave shift, which is the note that actually sounded — so a player
        // transposing to reach a scale is judged on what they played, not on
        // what their controller sent.
        learningActions.noteOn(note)
        return
      }
      case 'noteOff': {
        const note = transposeNote(message.note, config)
        if (note === null) return
        keyboardActions.noteOff(note)
        audioRef.current.noteOff(note)
        return
      }
      case 'controlChange': {
        if (message.controller === MIDI_CC.sustain && config.sustainEnabled) {
          const down = isSustainDown(message.value)
          keyboardActions.setSustain(down)
          audioRef.current.setSustain(down)
          return
        }
        // Both are "stop everything" messages. Keyboards send them on power-up
        // and on a panic button, and honouring them is what clears a stuck note.
        if (
          message.controller === MIDI_CC.allNotesOff ||
          message.controller === MIDI_CC.allSoundOff
        ) {
          keyboardActions.panic()
          audioRef.current.panic()
        }
        return
      }
      default:
        return
    }
  }, [])
  const handleMessageRef = React.useRef(handleMessage)
  handleMessageRef.current = handleMessage

  /** Re-reads the port list and re-binds listeners. Runs on connect and on every hot-plug. */
  const syncPorts = React.useCallback((midiAccess: MIDIAccess) => {
    const next: MidiPort[] = []

    for (const input of midiAccess.inputs.values()) {
      const identity = {
        name: input.name ?? 'Unknown device',
        manufacturer: input.manufacturer ?? '',
      }
      const id = fingerprintDevice(identity)

      next.push({
        id,
        portId: input.id,
        name: identity.name,
        manufacturer: identity.manufacturer,
        connected: input.state === 'connected',
        device: null,
      })

      // Assigning `onmidimessage` rather than addEventListener: the property
      // form replaces any previous handler, so re-running this after a
      // hot-plug cannot leave two handlers on one port firing every note twice.
      input.onmidimessage = (event) => {
        const data = (event as MIDIMessageEvent).data
        if (data) handleMessageRef.current(id, data)
      }

      if (input.state === 'connected') registerRef.current(identity)
    }

    setPorts((current) => {
      const known = new Map(current.map((port) => [port.id, port]))
      return next.map((port) => ({ ...port, device: known.get(port.id)?.device ?? null }))
    })
    setActivePortId((current) => current ?? next.find((port) => port.connected)?.id ?? null)
  }, [])

  const connect = React.useCallback(() => {
    if (access.state === 'requesting' || access.state === 'ready') return
    setAccess({ state: 'requesting' })

    void (async () => {
      const result = await requestMidiAccess()
      if (!result.ok) {
        setAccess(result.state)
        return
      }

      accessRef.current = result.access
      setAccess({ state: 'ready' })
      syncPorts(result.access)

      // Hot-plug. Unplugging a keyboard mid-performance leaves its notes held
      // down for ever, so the panic is not optional.
      result.access.onstatechange = () => {
        keyboardActions.panic()
        audioRef.current.panic()
        syncPorts(result.access)
      }
    })()
  }, [access.state, syncPorts])

  React.useEffect(
    () => () => {
      const midiAccess = accessRef.current
      if (!midiAccess) return
      midiAccess.onstatechange = null
      for (const input of midiAccess.inputs.values()) input.onmidimessage = null
    },
    [],
  )

  const value = React.useMemo<MidiApi>(() => {
    const connectedPorts = ports.filter((port) => port.connected)
    return {
      access,
      canRequest: detectMidiSupport().supported && access.state !== 'ready',
      connect,
      ports,
      connectedPorts,
      activePortId,
      setActivePortId,
      activeDevice: ports.find((port) => port.id === activePortId)?.device ?? null,
    }
  }, [access, connect, ports, activePortId])

  return <MidiContextValue.Provider value={value}>{children}</MidiContextValue.Provider>
}

export function useMidi(): MidiApi {
  const value = React.useContext(MidiContextValue)
  if (!value) throw new Error('useMidi must be used inside <MidiProvider>')
  return value
}
