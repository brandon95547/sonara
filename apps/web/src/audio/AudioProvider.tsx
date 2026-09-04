import * as React from 'react'
import type { Instrument } from '@sonara/shared'
import { SynthEngine } from './synth-engine'
import { SampledEngine } from './sampled-engine'
import type { AudioEngine } from './types'

/**
 * Owns the AudioContext, the current engine, and the sustain pedal.
 *
 * ## Play first, upgrade later
 *
 * Selecting a sampled piano starts its download AND immediately builds the
 * built-in engine from the same instrument's voicing, so the keyboard is
 * playable on the very next keystroke. When the samples arrive the engine is
 * swapped underneath; if they never arrive, nothing swaps and the player has a
 * piano either way. The alternative — a spinner over a dead keyboard — is the
 * one behaviour that makes a music app feel broken.
 *
 * ## Why sustain lives here
 *
 * The pedal is a property of the performance, not of the instrument. Holding
 * it here means every engine gets identical pedal behaviour for free, and an
 * engine swap mid-pedal cannot strand a note in the outgoing engine.
 */

export interface AudioStatus {
  /** Null until the first user gesture. Browsers will not start audio before one. */
  unlocked: boolean
  instrumentId: string | null
  kind: AudioEngine['kind'] | null
  /** True while samples download. The built-in engine is playing in the meantime. */
  loadingSamples: boolean
  /** 0-1. Only meaningful while `loadingSamples`. */
  progress: number
  /** Set when a sampled instrument could not load and we stayed on the synth. */
  fallbackReason: string | null
}

interface AudioApi {
  status: AudioStatus
  volume: number
  setVolume: (volume: number) => void
  loadInstrument: (instrument: Instrument) => void
  noteOn: (note: number, velocity: number) => void
  noteOff: (note: number) => void
  setSustain: (down: boolean) => void
  panic: () => void
}

const AudioContextValue = React.createContext<AudioApi | null>(null)

const INITIAL_STATUS: AudioStatus = {
  unlocked: false,
  instrumentId: null,
  kind: null,
  loadingSamples: false,
  progress: 0,
  fallbackReason: null,
}

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<AudioStatus>(INITIAL_STATUS)
  const [volume, setVolumeState] = React.useState(0.8)

  const contextRef = React.useRef<AudioContext | null>(null)
  const masterRef = React.useRef<GainNode | null>(null)
  const engineRef = React.useRef<AudioEngine | null>(null)
  const loadRef = React.useRef<AbortController | null>(null)

  // Notes released while the pedal is down. They keep sounding until it lifts.
  const pedalRef = React.useRef(false)
  const heldRef = React.useRef(new Set<number>())
  const pendingRef = React.useRef(new Set<number>())

  /**
   * Creates the AudioContext on demand. Safe to call repeatedly.
   *
   * Deliberately does NOT await `resume()`. A context created outside a user
   * gesture starts suspended, and in Chrome its resume promise simply never
   * settles until a gesture arrives — awaiting it would hang instrument
   * loading until the player happened to click something. So the resume is
   * fired and forgotten here, and the gesture listener below (plus the first
   * note-on) is what actually starts the clock. Downloading samples into a
   * suspended context works fine in the meantime.
   */
  const ensureContext = React.useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null

    if (!contextRef.current) {
      // `interactive` asks the browser for the smallest buffer it will give us.
      // On a keyboard, output latency is the entire experience: past roughly
      // 20ms a player hears their own playing as an echo of their hands.
      const context = new AudioContext({ latencyHint: 'interactive' })
      const master = context.createGain()
      master.gain.value = volume
      master.connect(context.destination)
      contextRef.current = context
      masterRef.current = master
    }

    const context = contextRef.current
    if (context.state === 'suspended') void context.resume().catch(() => {})
    return context
  }, [volume])

  // Any gesture anywhere unlocks audio. Kept live rather than run once: a
  // context can be suspended again by the browser when a tab is backgrounded,
  // and the next click has to bring it back.
  React.useEffect(() => {
    const unlock = () => {
      const context = contextRef.current
      if (!context) return
      void context.resume().then(
        () => setStatus((current) => (current.unlocked ? current : { ...current, unlocked: true })),
        () => {},
      )
    }
    globalThis.addEventListener('pointerdown', unlock)
    globalThis.addEventListener('keydown', unlock)
    return () => {
      globalThis.removeEventListener('pointerdown', unlock)
      globalThis.removeEventListener('keydown', unlock)
    }
  }, [])

  const swapEngine = React.useCallback((next: AudioEngine) => {
    const previous = engineRef.current
    engineRef.current = next
    if (previous) {
      previous.allNotesOff()
      previous.dispose()
    }
    // Anything held during the swap is re-struck on the new engine, so a
    // sustained chord does not vanish the moment the samples land.
    for (const note of heldRef.current) next.noteOn(note, 90)
  }, [])

  const loadInstrument = React.useCallback(
    (instrument: Instrument) => {
      loadRef.current?.abort()
      const controller = new AbortController()
      loadRef.current = controller

      const context = ensureContext()
      const master = masterRef.current
      if (!context || !master) return

      void (async () => {
        if (controller.signal.aborted) return

        // Step one, always: the built-in engine, built from this instrument's
        // own voicing. Instant, and correct on its own for `synth` instruments.
        swapEngine(new SynthEngine(context, master, instrument))
        const wantsSamples = instrument.engine.kind !== 'synth'
        setStatus({
          unlocked: context.state === 'running',
          instrumentId: instrument.id,
          kind: 'synth',
          loadingSamples: wantsSamples,
          progress: 0,
          fallbackReason: null,
        })
        if (!wantsSamples) return

        // Step two: the samples, in the background.
        try {
          const sampled = await SampledEngine.create({
            context,
            destination: master,
            instrument,
            signal: controller.signal,
            onProgress: (progress) =>
              setStatus((current) =>
                current.instrumentId === instrument.id ? { ...current, progress } : current,
              ),
          })
          if (controller.signal.aborted) {
            sampled.dispose()
            return
          }
          swapEngine(sampled)
          setStatus((current) =>
            current.instrumentId === instrument.id
              ? { ...current, kind: 'sampled', loadingSamples: false, progress: 1 }
              : current,
          )
        } catch (error) {
          if (controller.signal.aborted || (error as Error)?.name === 'AbortError') return
          setStatus((current) =>
            current.instrumentId === instrument.id
              ? {
                  ...current,
                  loadingSamples: false,
                  fallbackReason:
                    error instanceof Error ? error.message : 'The samples could not be loaded.',
                }
              : current,
          )
        }
      })()
    },
    [ensureContext, swapEngine],
  )

  const noteOn = React.useCallback((note: number, velocity: number) => {
    heldRef.current.add(note)
    pendingRef.current.delete(note)
    engineRef.current?.noteOn(note, velocity)
    // A first keystroke can arrive before the context has resumed — a click on
    // a key IS the unlocking gesture. Resuming here means that first note is
    // heard rather than swallowed.
    void contextRef.current?.resume()
  }, [])

  const noteOff = React.useCallback((note: number) => {
    heldRef.current.delete(note)
    if (pedalRef.current) {
      pendingRef.current.add(note)
      return
    }
    engineRef.current?.noteOff(note)
  }, [])

  const setSustain = React.useCallback((down: boolean) => {
    pedalRef.current = down
    if (down) return
    // Pedal up: release everything that was let go while it was held, but not
    // notes the player is still holding down.
    for (const note of pendingRef.current) {
      if (!heldRef.current.has(note)) engineRef.current?.noteOff(note)
    }
    pendingRef.current.clear()
  }, [])

  const panic = React.useCallback(() => {
    heldRef.current.clear()
    pendingRef.current.clear()
    pedalRef.current = false
    engineRef.current?.allNotesOff()
  }, [])

  const setVolume = React.useCallback((next: number) => {
    const clamped = Math.min(1, Math.max(0, next))
    setVolumeState(clamped)
    const master = masterRef.current
    if (master && contextRef.current) {
      // Ramped, not assigned: a step change in gain is a click.
      // Ramp target is the player's volume alone. Each engine applies the
      // catalogue's own dB trim internally.
      master.gain.setTargetAtTime(clamped, contextRef.current.currentTime, 0.02)
    }
  }, [])

  /**
   * Teardown.
   *
   * The refs are cleared, not just closed. React StrictMode mounts, unmounts
   * and remounts in development, and refs survive that round trip: leaving a
   * CLOSED AudioContext in `contextRef` means `ensureContext` hands it back on
   * the remount and every note after that is silent, with no error anywhere.
   * Nulling them makes the remount build a fresh context, which is what an
   * unmount/remount should mean.
   *
   * Today the catalogue request cannot resolve before StrictMode's second
   * pass, so no context exists yet when this runs and the bug does not fire —
   * but that is luck about network timing, not a design.
   */
  React.useEffect(
    () => () => {
      loadRef.current?.abort()
      loadRef.current = null
      engineRef.current?.dispose()
      engineRef.current = null
      const context = contextRef.current
      contextRef.current = null
      masterRef.current = null
      void context?.close().catch(() => {})
    },
    [],
  )

  const value = React.useMemo<AudioApi>(
    () => ({ status, volume, setVolume, loadInstrument, noteOn, noteOff, setSustain, panic }),
    [status, volume, setVolume, loadInstrument, noteOn, noteOff, setSustain, panic],
  )

  return <AudioContextValue.Provider value={value}>{children}</AudioContextValue.Provider>
}

export function useAudio(): AudioApi {
  const value = React.useContext(AudioContextValue)
  if (!value) throw new Error('useAudio must be used inside <AudioProvider>')
  return value
}
