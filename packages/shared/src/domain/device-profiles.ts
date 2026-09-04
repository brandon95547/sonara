import type { DeviceIdentity, DeviceProfile, KeyCount, NoteRange } from './device.js'

/**
 * Standard note ranges by key count.
 *
 * Manufacturers are consistent about this: controllers start on C, and 76- and
 * 88-key instruments start on E1 and A0 to match a real piano. So a key count
 * is enough to place the range. Used both as the profile default and as the
 * result for a keyboard we have never seen.
 */
export const STANDARD_RANGES: Record<KeyCount, NoteRange> = {
  25: { low: 48, high: 72 }, // C3-C5
  32: { low: 41, high: 72 }, // F2-C5
  37: { low: 36, high: 72 }, // C2-C5
  49: { low: 36, high: 84 }, // C2-C6
  61: { low: 36, high: 96 }, // C2-C7
  76: { low: 28, high: 103 }, // E1-G7
  88: { low: 21, high: 108 }, // A0-C8
}

export function standardRangeForKeyCount(keyCount: KeyCount): NoteRange {
  return STANDARD_RANGES[keyCount]
}

export interface ProfileMatch {
  profile: DeviceProfile | null
  keyCount: KeyCount
  range: NoteRange
  /** How we arrived at this. Surfaced in the UI so an auto-guess is never silent. */
  source: 'profile' | 'name-heuristic' | 'default'
}

/** Where an unrecognised keyboard lands. 61 keys is the most common size sold. */
export const FALLBACK_KEY_COUNT: KeyCount = 61

/**
 * Resolves a port's identity to a keyboard layout.
 *
 * Three tiers, in order:
 *
 *  1. **Profile** — a curated entry matched the reported name. Highest priority
 *     wins, so a specific `P-125` entry beats the generic Yamaha one.
 *  2. **Name heuristic** — most controllers put the key count in the product
 *     name (`Keystation 49 MK3`, `KOMPLETE KONTROL M32`). Reading it is right
 *     far more often than a blind default.
 *  3. **Default** — 61 keys.
 *
 * For a family that states its size in the product name (`keyCountFromName`),
 * the name wins over the profile's default — so one `Launchkey` profile covers
 * the 25, 37, 49 and 61 without four near-identical rows. For every other
 * family the profile wins, because a model number that happens to contain "32"
 * is not a keyboard with 32 keys.
 *
 * The tier is returned rather than hidden — "we know this keyboard" and "we
 * guessed from the name" deserve different treatment in the UI.
 */
export function matchDeviceProfile(
  identity: DeviceIdentity,
  profiles: readonly DeviceProfile[],
): ProfileMatch {
  const name = identity.name ?? ''
  const manufacturer = identity.manufacturer ?? ''
  const stated = keyCountFromName(name)

  const ordered = [...profiles].sort((a, b) => b.priority - a.priority)
  for (const profile of ordered) {
    if (!safeTest(profile.namePattern, name)) continue
    if (profile.manufacturerPattern && !safeTest(profile.manufacturerPattern, manufacturer))
      continue

    const keyCount = (profile.keyCountFromName && stated) || profile.keyCount
    return {
      profile,
      keyCount,
      range: keyCount === profile.keyCount ? profile.range : standardRangeForKeyCount(keyCount),
      source: 'profile',
    }
  }

  if (stated) {
    return {
      profile: null,
      keyCount: stated,
      range: standardRangeForKeyCount(stated),
      source: 'name-heuristic',
    }
  }

  return {
    profile: null,
    keyCount: FALLBACK_KEY_COUNT,
    range: STANDARD_RANGES[FALLBACK_KEY_COUNT],
    source: 'default',
  }
}

/**
 * Pulls a key count out of a product name.
 *
 * Ordered from most to least explicit. The last rule requires the number to be
 * a standalone token, which is what keeps `P-125` from reading as 25 keys and
 * `PSR-E373` from reading as 37 — both would be wrong, and both are what a bare
 * `\d+` search returns.
 */
const KEY_COUNT_PATTERNS: readonly RegExp[] = [
  // "88 key", "61-note" — stated outright.
  /\b(25|32|37|49|61|76|88)\s*[-\s]?(?:key|note)/,
  // Akai's MPK2 line encodes the size after the series digit: MPK249, MPK261.
  /\bmpk\s*\d?(25|49|61)\b/,
  // Single-letter model prefixes: M32, A49, S61, V49, GX49, F49, SL61.
  /\b(?:m|a|s|f|v|gx|sl)\s?(25|32|37|49|61|76|88)\b/,
  // A standalone token: "Launchkey 61", "Keystation 49 MK3", "microKEY2-61".
  /\b(25|32|37|49|61|76|88)\b/,
]

export function keyCountFromName(name: string): KeyCount | null {
  const haystack = name.toLowerCase()
  for (const pattern of KEY_COUNT_PATTERNS) {
    const match = haystack.match(pattern)
    if (match?.[1]) return Number(match[1]) as KeyCount
  }
  return null
}

function safeTest(pattern: string, value: string): boolean {
  try {
    return new RegExp(pattern, 'i').test(value)
  } catch {
    // A malformed pattern is a data bug, not a reason to fail device detection.
    return false
  }
}
