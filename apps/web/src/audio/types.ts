import type { Instrument } from '@sonara/shared'

/**
 * What the rest of the app needs from a sound source.
 *
 * Deliberately narrow. Sustain is NOT here: the pedal is a property of the
 * performance, not of the instrument, so it is handled once in the audio
 * provider rather than reimplemented (differently) by every engine.
 */
export interface AudioEngine {
  readonly instrumentId: string
  readonly kind: 'sampled' | 'synth'
  noteOn(note: number, velocity: number): void
  noteOff(note: number): void
  /** Panic. Silences everything immediately — used on device change and unmount. */
  allNotesOff(): void
  dispose(): void
}

export type EngineStatus =
  | { state: 'idle' }
  | { state: 'loading'; instrument: Instrument; progress: number }
  | { state: 'ready'; instrument: Instrument; kind: AudioEngine['kind']; fellBack: boolean }
  | { state: 'error'; instrument: Instrument; message: string }

/** dB is how the catalogue expresses trim; Web Audio wants a linear multiplier. */
export function decibelsToGain(db: number): number {
  return 10 ** (db / 20)
}
