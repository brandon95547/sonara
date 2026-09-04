import type { Database } from 'better-sqlite3'

/**
 * Migrations, applied in order and tracked with SQLite's own `user_version`
 * pragma. No migration table, no extra dependency, and the version travels
 * inside the database file so a copied file can never disagree with itself.
 *
 * Rules: append only, never edit a shipped migration, and each one has to be
 * safe to run against a database that already has data in it.
 */
export interface Migration {
  readonly version: number
  readonly name: string
  readonly up: string
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: /* sql */ `
      -- Known MIDI controllers. Seeded from code on boot (see seed.ts) but kept
      -- in a table rather than a constant so a user-contributed profile has a
      -- place to live without a schema change.
      CREATE TABLE device_profiles (
        id                      TEXT    PRIMARY KEY,
        label                   TEXT    NOT NULL,
        manufacturer            TEXT    NOT NULL,
        key_count               INTEGER NOT NULL,
        range_low               INTEGER NOT NULL,
        range_high              INTEGER NOT NULL,
        name_pattern            TEXT    NOT NULL,
        manufacturer_pattern    TEXT,
        default_velocity_curve  TEXT    NOT NULL,
        key_count_from_name     INTEGER NOT NULL DEFAULT 0,
        priority                INTEGER NOT NULL DEFAULT 50,
        builtin                 INTEGER NOT NULL DEFAULT 1,
        CHECK (range_low  BETWEEN 0 AND 127),
        CHECK (range_high BETWEEN 0 AND 127),
        CHECK (range_low <= range_high),
        CHECK (priority BETWEEN 0 AND 100)
      );

      CREATE INDEX device_profiles_priority_idx ON device_profiles (priority DESC);

      -- Devices the browser has actually reported. The primary key is a
      -- fingerprint of manufacturer + product name, NOT the Web MIDI port id,
      -- which is implementation-defined and changes with the USB socket.
      CREATE TABLE devices (
        id             TEXT PRIMARY KEY,
        name           TEXT NOT NULL,
        manufacturer   TEXT NOT NULL DEFAULT '',
        profile_id     TEXT REFERENCES device_profiles (id) ON DELETE SET NULL,
        key_count      INTEGER NOT NULL,
        -- The config is stored as JSON and validated by zod on the way in and
        -- out. A column per setting would mean a migration every time a new
        -- one is added, and nothing ever queries across these values.
        config         TEXT NOT NULL,
        first_seen_at  TEXT NOT NULL,
        last_seen_at   TEXT NOT NULL
      );

      CREATE INDEX devices_last_seen_idx ON devices (last_seen_at DESC);
    `,
  },
]

/** Applies every migration newer than the file's current `user_version`. */
export function migrate(db: Database, log?: (message: string) => void): number {
  const current = (db.pragma('user_version', { simple: true }) as number) ?? 0
  const pending = MIGRATIONS.filter((m) => m.version > current).sort(
    (a, b) => a.version - b.version,
  )

  for (const migration of pending) {
    // Each migration is one transaction: a half-applied schema is unrecoverable
    // without a backup, and there is no reason to ever risk one.
    const run = db.transaction(() => {
      db.exec(migration.up)
      db.pragma(`user_version = ${migration.version}`)
    })
    run()
    log?.(`migration ${migration.version} applied (${migration.name})`)
  }

  return pending.length
}
