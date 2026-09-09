/**
 * Dynamics as a velocity, so a marked score plays with its own shape.
 *
 * One table for every importer. MusicXML and MuseScore both name the marking
 * — `mf`, `pp` — and used to be read into different velocities, or in the
 * MusicXML case into none at all: a score marked pianissimo played at the
 * same fixed velocity as one marked fortissimo. The values are the ones
 * MuseScore's own playback uses, which is as near a standard as there is.
 */
const VELOCITIES: Record<string, number> = {
  pppp: 10,
  ppp: 16,
  pp: 33,
  p: 49,
  mp: 64,
  mf: 80,
  f: 96,
  ff: 112,
  fff: 126,
  ffff: 127,
  sfz: 112,
  sf: 112,
  fp: 96,
  rfz: 112,
}

/** Mezzo-forte for a score that never says. */
export const DEFAULT_VELOCITY = 80

export function velocityForDynamic(dynamic: string | undefined): number {
  if (!dynamic) return DEFAULT_VELOCITY
  return VELOCITIES[dynamic.trim().toLowerCase()] ?? DEFAULT_VELOCITY
}
