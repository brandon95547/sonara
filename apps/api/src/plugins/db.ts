import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { openDatabase, type Db } from '../db/index.js'
import { DeviceRepository } from '../repositories/device-repository.js'

declare module 'fastify' {
  interface FastifyInstance {
    db: Db
    devices: DeviceRepository
  }
}

export interface DbPluginOptions {
  databasePath: string
}

/**
 * Opens the database and decorates the instance with it and with the
 * repositories built on top of it.
 *
 * Registered as a plugin so the close hook is owned by Fastify: on SIGTERM the
 * server drains its requests and *then* closes the connection, rather than the
 * process exiting with a write in flight.
 */
export const dbPlugin = fp<DbPluginOptions>(
  async function dbPlugin(app: FastifyInstance, options: DbPluginOptions) {
    const db = openDatabase({
      path: options.databasePath,
      log: (message) => app.log.info({ scope: 'db' }, message),
    })

    app.decorate('db', db)
    app.decorate('devices', new DeviceRepository(db))

    app.addHook('onClose', async () => {
      db.close()
      app.log.info({ scope: 'db' }, 'database closed')
    })
  },
  { name: 'sonara-db' },
)
