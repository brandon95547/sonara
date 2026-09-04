import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import type { Database as Db } from 'better-sqlite3'
import { migrate } from './migrations.js'
import { seedDeviceProfiles } from './seed.js'

export type { Db }

export interface OpenDatabaseOptions {
  path: string
  log?: (message: string) => void
}

/**
 * Opens the database, applies migrations and seeds the built-in device
 * profiles. Safe to call repeatedly; every step is idempotent.
 *
 * Note on backups: WAL mode means the newest writes live in `-wal`, not in the
 * main file. Copying the `.sqlite` on its own silently loses them — take a
 * backup with `VACUUM INTO 'backup.sqlite'` instead of `cp`.
 */
export function openDatabase({ path: dbPath, log }: OpenDatabaseOptions): Db {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  }

  const db = new Database(dbPath)

  // WAL lets reads proceed during a write, which matters the moment more than
  // one browser tab is open. NORMAL sync is the standard pairing: durable
  // against a process crash, and only at risk from an OS-level power loss.
  if (dbPath !== ':memory:') db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  // Off by default in SQLite, for backwards compatibility. We want them on.
  db.pragma('foreign_keys = ON')
  // Fail fast rather than hanging forever behind another writer.
  db.pragma('busy_timeout = 5000')

  migrate(db, log)
  seedDeviceProfiles(db, log)

  return db
}
