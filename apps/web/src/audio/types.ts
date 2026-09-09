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
  /**
   * Panic. Releases every voice at once, with the shortest fade that does not
   * click — a hard cut is itself a click. Used on device change and unmount.
   *
   * Returns how long that fade lasts, in milliseconds. A caller about to tear
   * the engine down needs it: `dispose` stops the sources outright, so calling
   * it straight after this cuts the fade off mid-ramp and produces exactly the
   * click the fade exists to avoid.
   */
  allNotesOff(): number
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
