/**
 * Velocity response curves.
 *
 * Controllers differ enormously in how hard you have to hit them for 127.
 * Rather than asking a player to relearn their touch per device, the curve is
 * part of the device's config and is applied once, on ingest, before anything
 * downstream sees the note.
 */

export const VELOCITY_CURVES = ['linear', 'soft', 'hard', 'fixed'] as const
export type VelocityCurve = (typeof VELOCITY_CURVES)[number]

export const VELOCITY_CURVE_LABELS: Record<VelocityCurve, string> = {
  linear: 'Linear',
  soft: 'Soft touch',
  hard: 'Hard touch',
  fixed: 'Fixed',
}

export const VELOCITY_CURVE_DESCRIPTIONS: Record<VelocityCurve, string> = {
  linear: 'Passes the controller through untouched.',
  soft: 'Reaches full volume with less force — for light or unweighted actions.',
  hard: 'Needs more force for full volume — for weighted hammer actions.',
  fixed: 'Ignores how hard you play and uses one velocity for every note.',
}

/**
 * Maps a raw 1-127 controller velocity to a 1-127 playback velocity.
 *
 * `soft` and `hard` are gamma curves on the normalised value. Gamma rather than
 * a lookup table so the curve is continuous — a table with 8 breakpoints is
 * audible as steps when a player crescendos slowly.
 */
export function applyVelocityCurve(
  velocity: number,
  curve: VelocityCurve,
  fixedVelocity = 100,
): number {
  if (curve === 'fixed') return clampVelocity(fixedVelocity)

  const raw = clampVelocity(velocity)
  if (curve === 'linear') return raw

  const normalised = raw / 127
  const gamma = curve === 'soft' ? 0.6 : 1.7
  return clampVelocity(Math.round(normalised ** gamma * 127))
}

export function clampVelocity(velocity: number): number {
  if (!Number.isFinite(velocity)) return 1
  return Math.min(127, Math.max(1, Math.round(velocity)))
}

/** 0..1, for gain staging in the audio engine. */
export function velocityToGain(velocity: number): number {
  // Squared rather than linear: perceived loudness tracks roughly the square of
  // amplitude over this range, and a linear map makes pianissimo inaudible.
  const normalised = clampVelocity(velocity) / 127
  return normalised * normalised
}
