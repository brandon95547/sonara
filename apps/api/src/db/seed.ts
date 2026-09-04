import type { Database } from 'better-sqlite3'
import { BUILT_IN_DEVICE_PROFILES } from '../data/device-profiles.js'

/**
 * Upserts the built-in controller profiles.
 *
 * Runs on every boot so a new profile shipped in a release reaches an existing
 * install without a migration. `builtin = 1` marks rows this function owns; a
 * profile a user adds later carries 0 and is never touched here.
 */
export function seedDeviceProfiles(db: Database, log?: (message: string) => void): number {
  const upsert = db.prepare(/* sql */ `
    INSERT INTO device_profiles (
      id, label, manufacturer, key_count, range_low, range_high,
      name_pattern, manufacturer_pattern, default_velocity_curve,
      key_count_from_name, priority, builtin
    ) VALUES (
      @id, @label, @manufacturer, @keyCount, @rangeLow, @rangeHigh,
      @namePattern, @manufacturerPattern, @defaultVelocityCurve,
      @keyCountFromName, @priority, 1
    )
    ON CONFLICT (id) DO UPDATE SET
      label                  = excluded.label,
      manufacturer           = excluded.manufacturer,
      key_count              = excluded.key_count,
      range_low              = excluded.range_low,
      range_high             = excluded.range_high,
      name_pattern           = excluded.name_pattern,
      manufacturer_pattern   = excluded.manufacturer_pattern,
      default_velocity_curve = excluded.default_velocity_curve,
      key_count_from_name    = excluded.key_count_from_name,
      priority               = excluded.priority
    WHERE device_profiles.builtin = 1
  `)

  const run = db.transaction(() => {
    for (const profile of BUILT_IN_DEVICE_PROFILES) {
      upsert.run({
        id: profile.id,
        label: profile.label,
        manufacturer: profile.manufacturer,
        keyCount: profile.keyCount,
        rangeLow: profile.range.low,
        rangeHigh: profile.range.high,
        namePattern: profile.namePattern,
        manufacturerPattern: profile.manufacturerPattern,
        defaultVelocityCurve: profile.defaultVelocityCurve,
        keyCountFromName: profile.keyCountFromName ? 1 : 0,
        priority: profile.priority,
      })
    }
  })
  run()

  log?.(`seeded ${BUILT_IN_DEVICE_PROFILES.length} device profiles`)
  return BUILT_IN_DEVICE_PROFILES.length
}
