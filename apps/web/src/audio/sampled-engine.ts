import type { Instrument } from '@sonara/shared'
import { decibelsToGain, type AudioEngine } from './types'

/**
 * Sample-based engine, backed by smplr.
 *
 * The samples are fetched from a public CDN on first use and then served from
 * the browser's cache, so selecting a piano costs one download and switching
 * back to it later costs nothing. Everything about that download can fail —
 * an offline laptop, a captive-portal wifi, a blocked CDN — so `create` has a
 * deadline and the caller falls back to the built-in engine when it expires.
 * Silence with no explanation is the one outcome this must never produce.
 */

/** Sampled instruments are a large download on a slow connection; be patient, but not forever. */
const LOAD_TIMEOUT_MS = 25_000

type SmplrInstrument = {
  start: (event: { note: number; velocity?: number }) => unknown
  stop: (target?: number) => void
  dispose: () => void
}

export interface SampledEngineOptions {
  context: AudioContext
  destination: AudioNode
  instrument: Instrument
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

export class SampledEngine implements AudioEngine {
  readonly kind = 'sampled' as const
  readonly instrumentId: string

  readonly #player: SmplrInstrument
  readonly #trim: GainNode
  readonly #sounding = new Set<number>()
  #disposed = false

  private constructor(instrumentId: string, player: SmplrInstrument, trim: GainNode) {
    this.instrumentId = instrumentId
    this.#player = player
    this.#trim = trim
  }

  static async create({
    context,
    destination,
    instrument,
    onProgress,
    signal,
  }: SampledEngineOptions): Promise<SampledEngine> {
    // Imported here rather than at module scope so the smplr runtime is only
    // fetched once a sampled piano is actually chosen. The on-screen keyboard
    // and the built-in engine never wait on it.
    const { SplendidGrandPiano, Soundfont } = await import('smplr')

    const onLoadProgress = ({ loaded, total }: { loaded: number; total: number }) =>
      onProgress?.(total > 0 ? loaded / total : 0)

    // Every engine applies its own catalogue trim, so the master gain node
    // upstream means one thing only: how loud the player asked for it. Two
    // places applying the same dB is how an instrument ends up half as loud as
    // its neighbours for reasons nobody can find later.
    const trim = context.createGain()
    trim.gain.value = decibelsToGain(instrument.gainDb)
    trim.connect(destination)

    // smplr's `volume` is on the MIDI 0-127 scale, not a linear gain, so it
    // stays at unity here and the trim node above owns level.
    const player =
      instrument.engine.kind === 'sampled-splendid'
        ? SplendidGrandPiano(context, { destination: trim, volume: 127, onLoadProgress })
        : Soundfont(context, {
            instrument:
              instrument.engine.kind === 'sampled-soundfont'
                ? instrument.engine.program
                : 'acoustic_grand_piano',
            destination: trim,
            volume: 127,
            onLoadProgress,
          })

    try {
      await withDeadline(player.ready, LOAD_TIMEOUT_MS, signal)
    } catch (error) {
      player.dispose()
      trim.disconnect()
      throw error
    }

    if (signal?.aborted) {
      player.dispose()
      trim.disconnect()
      throw new DOMException('Instrument load was superseded.', 'AbortError')
    }

    return new SampledEngine(instrument.id, player as unknown as SmplrInstrument, trim)
  }

  noteOn(note: number, velocity: number): void {
    if (this.#disposed) return
    // Re-striking a sounding note without stopping it first leaves two
    // overlapping samples that the later noteOff only half-silences.
    if (this.#sounding.has(note)) this.#player.stop(note)
    this.#sounding.add(note)
    this.#player.start({ note, velocity })
  }

  noteOff(note: number): void {
    if (this.#disposed) return
    this.#sounding.delete(note)
    this.#player.stop(note)
  }

  allNotesOff(): void {
    if (this.#disposed) return
    this.#sounding.clear()
    this.#player.stop()
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#sounding.clear()
    this.#player.dispose()
    this.#trim.disconnect()
  }
}

/**
 * Rejects if the promise has not settled by the deadline, or if the caller
 * aborts. A load with no deadline is a spinner that never stops — the failure
 * mode of a CDN behind a captive portal, where the request neither succeeds
 * nor errors.
 */
function withDeadline<T>(promise: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = globalThis.setTimeout(
      () => reject(new Error(`Samples did not load within ${Math.round(ms / 1000)}s.`)),
      ms,
    )
    const onAbort = () => {
      globalThis.clearTimeout(timer)
      reject(new DOMException('Instrument load was superseded.', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    promise.then(
      (value) => {
        globalThis.clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error: unknown) => {
        globalThis.clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        reject(error instanceof Error ? error : new Error(String(error)))
      },
    )
  })
}
