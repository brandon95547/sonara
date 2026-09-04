import type { Database } from 'better-sqlite3'
import {
  DEFAULT_DEVICE_CONFIG,
  deviceConfigSchema,
  deviceProfileSchema,
  fingerprintDevice,
  matchDeviceProfile,
  type Device,
  type DeviceConfig,
  type DeviceIdentity,
  type DeviceProfile,
  type KeyCount,
  type ProfileMatch,
  type UpdateDeviceConfigInput,
} from '@sonara/shared'

interface ProfileRow {
  id: string
  label: string
  manufacturer: string
  key_count: number
  range_low: number
  range_high: number
  name_pattern: string
  manufacturer_pattern: string | null
  default_velocity_curve: string
  key_count_from_name: number
  priority: number
}

interface DeviceRow {
  id: string
  name: string
  manufacturer: string
  profile_id: string | null
  key_count: number
  config: string
  first_seen_at: string
  last_seen_at: string
}

function toProfile(row: ProfileRow): DeviceProfile {
  return deviceProfileSchema.parse({
    id: row.id,
    label: row.label,
    manufacturer: row.manufacturer,
    keyCount: row.key_count,
    range: { low: row.range_low, high: row.range_high },
    namePattern: row.name_pattern,
    manufacturerPattern: row.manufacturer_pattern,
    defaultVelocityCurve: row.default_velocity_curve,
    keyCountFromName: row.key_count_from_name === 1,
    priority: row.priority,
  })
}

function toDevice(row: DeviceRow): Device {
  return {
    id: row.id,
    name: row.name,
    manufacturer: row.manufacturer,
    profileId: row.profile_id,
    keyCount: row.key_count as KeyCount,
    // Parsed rather than cast: a config written by an older release may be
    // missing a field this one requires, and it is far better to notice that
    // here than to hand a half-built object to the audio engine.
    config: deviceConfigSchema.parse(JSON.parse(row.config)),
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
  }
}

export interface RegisterResult {
  device: Device
  /** True the first time this keyboard has ever been seen. */
  created: boolean
  /** How the layout was resolved. The client shows this so a guess is visible. */
  detection: Pick<ProfileMatch, 'source'> & { profileLabel: string | null }
}

/**
 * All device persistence. A class rather than loose functions so the prepared
 * statements are built once per connection instead of once per request —
 * better-sqlite3's prepare is the expensive half of a query.
 */
export class DeviceRepository {
  readonly #db: Database

  constructor(db: Database) {
    this.#db = db
  }

  listProfiles(): DeviceProfile[] {
    const rows = this.#db
      .prepare<[], ProfileRow>('SELECT * FROM device_profiles ORDER BY priority DESC, id ASC')
      .all()
    return rows.map(toProfile)
  }

  list(): Device[] {
    const rows = this.#db
      .prepare<[], DeviceRow>('SELECT * FROM devices ORDER BY last_seen_at DESC')
      .all()
    return rows.map(toDevice)
  }

  find(id: string): Device | null {
    const row = this.#db.prepare<[string], DeviceRow>('SELECT * FROM devices WHERE id = ?').get(id)
    return row ? toDevice(row) : null
  }

  /**
   * Announces a port the browser has just reported.
   *
   * Idempotent by design: the browser re-announces every device on every page
   * load and on every USB hot-plug, and doing so must never reset a player's
   * saved settings. A device we already know only has its `last_seen_at` and
   * its reported name refreshed; detection runs once, at first sight.
   */
  register(identity: DeviceIdentity): RegisterResult {
    const id = fingerprintDevice(identity)
    const now = new Date().toISOString()
    const existing = this.find(id)

    if (existing) {
      this.#db
        .prepare('UPDATE devices SET last_seen_at = ?, name = ? WHERE id = ?')
        .run(now, identity.name, id)
      const profileLabel = existing.profileId
        ? (this.#db
            .prepare<[string], { label: string }>('SELECT label FROM device_profiles WHERE id = ?')
            .get(existing.profileId)?.label ?? null)
        : null
      return {
        device: { ...existing, name: identity.name, lastSeenAt: now },
        created: false,
        detection: { source: existing.profileId ? 'profile' : 'name-heuristic', profileLabel },
      }
    }

    const match = matchDeviceProfile(identity, this.listProfiles())
    const config: DeviceConfig = {
      ...DEFAULT_DEVICE_CONFIG,
      velocityCurve: match.profile?.defaultVelocityCurve ?? DEFAULT_DEVICE_CONFIG.velocityCurve,
      range: match.range,
    }

    this.#db
      .prepare(
        `INSERT INTO devices (id, name, manufacturer, profile_id, key_count, config, first_seen_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        identity.name,
        identity.manufacturer,
        match.profile?.id ?? null,
        match.keyCount,
        JSON.stringify(config),
        now,
        now,
      )

    return {
      device: {
        id,
        name: identity.name,
        manufacturer: identity.manufacturer,
        profileId: match.profile?.id ?? null,
        keyCount: match.keyCount,
        config,
        firstSeenAt: now,
        lastSeenAt: now,
      },
      created: true,
      detection: { source: match.source, profileLabel: match.profile?.label ?? null },
    }
  }

  /** Merges a partial config over the stored one. Returns null if unknown. */
  updateConfig(id: string, patch: UpdateDeviceConfigInput): Device | null {
    const device = this.find(id)
    if (!device) return null

    const merged = deviceConfigSchema.parse({ ...device.config, ...patch })
    this.#db.prepare('UPDATE devices SET config = ? WHERE id = ?').run(JSON.stringify(merged), id)
    return { ...device, config: merged }
  }

  /** Restores the config detection would have produced for this device today. */
  resetConfig(id: string): Device | null {
    const device = this.find(id)
    if (!device) return null

    const match = matchDeviceProfile(
      { name: device.name, manufacturer: device.manufacturer },
      this.listProfiles(),
    )
    return this.updateConfig(id, {
      ...DEFAULT_DEVICE_CONFIG,
      velocityCurve: match.profile?.defaultVelocityCurve ?? DEFAULT_DEVICE_CONFIG.velocityCurve,
      range: match.range,
    })
  }

  delete(id: string): boolean {
    return this.#db.prepare('DELETE FROM devices WHERE id = ?').run(id).changes > 0
  }
}
