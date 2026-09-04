import { z } from 'zod'

/**
 * The instrument catalogue contract.
 *
 * The API owns *which* pianos exist and what they sound like; the web app owns
 * *how* to make that sound. The `engine` discriminator is the seam: the server
 * says "this is a soundfont program called electric_piano_1", and the client
 * picks an implementation that can honour that. Adding a piano is a server-side
 * data change, and adding a new synthesis technique is a client-side one.
 */

/**
 * Additive-synthesis voicing. Used by the built-in engine, which is both the
 * offline fallback and the guaranteed-available instrument: every sampled
 * instrument carries a voicing so it still plays, recognisably, when the sample
 * CDN is unreachable.
 */
export const synthVoicingSchema = z.object({
  /** Harmonic partials relative to the fundamental. */
  partials: z
    .array(
      z.object({
        ratio: z.number().positive(),
        gain: z.number().min(0).max(1),
        /** Seconds. Upper partials must decay faster or the tone turns to glass. */
        decay: z.number().positive(),
      }),
    )
    .min(1),
  attack: z.number().min(0).max(1),
  release: z.number().min(0.01).max(10),
  /** Low-pass cutoff at full velocity, in Hz. Velocity scales this — that is what makes a hard note sound bright rather than merely loud. */
  brightness: z.number().min(200).max(20000),
  /** Cents of detune between the doubled strings. 0 is a clean electric tone. */
  detune: z.number().min(0).max(30),
  /** Level of the hammer/attack noise transient, 0-1. */
  hammer: z.number().min(0).max(1),
})
export type SynthVoicing = z.infer<typeof synthVoicingSchema>

export const engineSpecSchema = z.discriminatedUnion('kind', [
  /** Multi-velocity sampled grand. The flagship, and the largest download. */
  z.object({ kind: z.literal('sampled-splendid') }),
  /** A General MIDI soundfont program name, e.g. `acoustic_grand_piano`. */
  z.object({ kind: z.literal('sampled-soundfont'), program: z.string().min(1) }),
  /** Synthesised in the browser. No network, no licence, always available. */
  z.object({ kind: z.literal('synth') }),
])
export type EngineSpec = z.infer<typeof engineSpecSchema>

export const INSTRUMENT_FAMILIES = ['acoustic', 'electric'] as const
export const instrumentFamilySchema = z.enum(INSTRUMENT_FAMILIES)
export type InstrumentFamily = z.infer<typeof instrumentFamilySchema>

export const instrumentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** One line, shown under the name in the picker. Keep it about the sound. */
  description: z.string().min(1),
  family: instrumentFamilySchema,
  /** Two or three words the ear can check against, e.g. "warm", "close-miked". */
  character: z.array(z.string()).min(1).max(4),
  engine: engineSpecSchema,
  /** Voicing for the built-in engine — the fallback when samples cannot load. */
  voicing: synthVoicingSchema,
  /** Output trim in dB so instruments sit at a comparable level. */
  gainDb: z.number().min(-24).max(12),
  /** Natural note range. Outside it, the engine transposes the nearest sample. */
  range: z.object({
    low: z.number().int().min(0).max(127),
    high: z.number().int().min(0).max(127),
  }),
})
export type Instrument = z.infer<typeof instrumentSchema>
