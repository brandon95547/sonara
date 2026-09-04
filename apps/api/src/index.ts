import { buildApp } from './app.js'
import { loadConfig } from './config.js'

/**
 * Process entry point. Everything testable lives in `buildApp`; this file owns
 * only the parts that are about being a process — binding a port, and shutting
 * down without dropping a request.
 */
const config = loadConfig()
const app = await buildApp(config)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info(`${signal} received, closing`)
    // `close()` stops accepting connections, waits for in-flight requests and
    // then runs the onClose hooks, which is what closes the database cleanly.
    app.close().then(
      () => process.exit(0),
      (error) => {
        app.log.error({ err: error }, 'failed to close cleanly')
        process.exit(1)
      },
    )
  })
}

try {
  await app.listen({ port: config.port, host: config.host })
  app.log.info(`Sonara API ready — docs at http://localhost:${config.port}/docs`)
} catch (error) {
  app.log.error({ err: error }, 'failed to start')
  process.exit(1)
}
