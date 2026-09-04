import { z } from 'zod'
import { VELOCITY_CURVES } from '../midi/velocity.js'
import { PIANO_HIGHEST_NOTE, PIANO_LOWEST_NOTE } from '../midi/notes.js'

/**
 * MIDI device identity, profiles and per-device configuration.
 *
 * ## Why devices are fingerprinted rather than keyed by `MIDIInput.id`
 *
 * The Web MIDI `id` is explicitly implementation-defined. Chrome derives it
 * from the port's OS handle, so it changes when the keyboard is plugged into a
 * different USB socket; Firefox numbers ports sequentially per session. Keying
 * saved settings on it means a player's transpose and velocity curve vanish
 * because they used the other port on the back of their laptop.
 *
 * So a device is identified by what it says it is — manufacturer plus product
 * name — normalised. That is stable across ports, sessions and browsers, and
 * the only thing it cannot tell apart is two identical keyboards plugged in at
 * once, which is a trade we are happy to make.
 */

export const KEY_COUNTS = [25, 32, 37, 49, 61, 76, 88] as const
export const keyCountSchema = z.union([
  z.literal(25),
  z.literal(32),
  z.literal(37),
  z.literal(49),
  z.literal(61),
  z.literal(76),
  z.literal(88),
])
export type KeyCount = (typeof KEY_COUNTS)[number]

export const noteNumberSchema = z.number().int().min(0).max(127)

export const noteRangeSchema = z
  .object({ low: noteNumberSchema, high: noteNumberSchema })
  .refine((r) => r.low <= r.high, { message: 'low must be <= high' })
export type NoteRange = z.infer<typeof noteRangeSchema>

/**
 * A known controller. Profiles let the app configure itself the moment a
 * keyboard is plugged in: the right number of keys, starting on the right note,
 * with a velocity curve that suits the action.
 */
export const deviceProfileSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  manufacturer: z.string().min(1),
  keyCount: keyCountSchema,
  range: noteRangeSchema,
  /** Case-insensitive regular expression matched against the reported port name. */
  namePattern: z.string().min(1),
  /** Optional extra constraint on the reported manufacturer. */
  manufacturerPattern: z.string().min(1).nullable(),
  /**
   * Default curve for this action. A weighted hammer action already spans the
   * full velocity range under normal playing, so it wants `linear`; light synth
   * and mini-key actions rarely reach 127, so they want `soft`.
   */
  defaultVelocityCurve: z.enum(VELOCITY_CURVES),
  /**
   * True when this family states its size in the product name, so one profile
   * can cover `Launchkey 25/37/49/61`. False for families whose model number
   * merely contains digits — a Yamaha NP-32 has 76 keys, and reading "32" out
   * of its name is exactly the mistake this flag exists to prevent.
   */
  keyCountFromName: z.boolean(),
  /** More specific patterns must win. Higher is checked first. */
  priority: z.number().int().min(0).max(100),
})
export type DeviceProfile = z.infer<typeof deviceProfileSchema>

export const deviceConfigSchema = z.object({
  /** Semitones. Applied before octave shift. */
  transpose: z.number().int().min(-24).max(24),
  /** Octaves. Separate from transpose because players think of them separately: transpose is for a key change, octave shift is for reaching notes a 25-key controller does not have. */
  octaveShift: z.number().int().min(-4).max(4),
  velocityCurve: z.enum(VELOCITY_CURVES),
  fixedVelocity: z.number().int().min(1).max(127),
  /** `null` means omni — accept every channel. Otherwise 0-15. */
  channelFilter: z.number().int().min(0).max(15).nullable(),
  /** Honour CC 64. Off for controllers whose pedal jack is miswired or inverted. */
  sustainEnabled: z.boolean(),
  /** The keys this controller physically has. Drives the on-screen range. */
  range: noteRangeSchema,
})
export type DeviceConfig = z.infer<typeof deviceConfigSchema>

export const DEFAULT_DEVICE_CONFIG: DeviceConfig = {
  transpose: 0,
  octaveShift: 0,
  velocityCurve: 'linear',
  fixedVelocity: 100,
  channelFilter: null,
  sustainEnabled: true,
  range: { low: PIANO_LOWEST_NOTE, high: PIANO_HIGHEST_NOTE },
}

/** What the browser hands us about a port, before we know anything about it. */
export const deviceIdentitySchema = z.object({
  name: z.string().min(1).max(200),
  manufacturer: z.string().max(200).default(''),
})
export type DeviceIdentity = z.infer<typeof deviceIdentitySchema>

export const deviceSchema = z.object({
  /** Stable fingerprint. See the note at the top of this file. */
  id: z.string().min(1),
  name: z.string(),
  manufacturer: z.string(),
  /** The profile that matched, or `null` when we fell back to a heuristic. */
  profileId: z.string().nullable(),
  keyCount: keyCountSchema,
  config: deviceConfigSchema,
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
})
export type Device = z.infer<typeof deviceSchema>

/** Body of `POST /devices` — announcing a port the browser has just reported. */
export const registerDeviceSchema = deviceIdentitySchema
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>

/** Body of `PATCH /devices/:id/config`. Every field optional — this is a patch. */
export const updateDeviceConfigSchema = deviceConfigSchema.partial()
export type UpdateDeviceConfigInput = z.infer<typeof updateDeviceConfigSchema>

/**
 * Builds a stable id from what the port reports.
 *
 * Lower-cased, non-alphanumerics collapsed to a single dash, trimmed. Chrome
 * reports `"Yamaha P-125"` and Firefox `"Yamaha P-125 MIDI 1"` for the same
 * hardware; the trailing port index is stripped so both land on one record.
 */
export function fingerprintDevice(identity: DeviceIdentity): string {
  const name = identity.name
    .replace(/\s+(midi|port)\s*\d+$/i, '')
    .replace(/\s+\d+$/, '')
    .trim()
  const raw = `${identity.manufacturer} ${name}`.trim() || name
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'unknown-device'
}
