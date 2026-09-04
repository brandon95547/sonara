import Fastify, { type FastifyError, type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import swagger from '@fastify/swagger'
import scalar from '@scalar/fastify-api-reference'
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import { API_PREFIX } from '@sonara/shared'
import type { Config } from './config.js'
import { AppError } from './errors.js'
import { dbPlugin } from './plugins/db.js'
import { healthRoutes } from './routes/health.js'
import { instrumentRoutes } from './routes/instruments.js'
import { deviceRoutes } from './routes/devices.js'

declare module 'fastify' {
  interface FastifyInstance {
    sonaraVersion: string
  }
}

export async function buildApp(config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      ...(config.isProduction
        ? {}
        : {
            transport: {
              target: 'pino-pretty',
              options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
            },
          }),
    },
    // Trust the proxy's forwarded headers so request logs and any future rate
    // limiting see the real client address rather than the reverse proxy's.
    trustProxy: config.isProduction,
    // A MIDI device announcement is a few hundred bytes. Nothing this API
    // accepts is large, so the default 1MB body limit is an open door.
    bodyLimit: 64 * 1024,
    // Fastify's built-in request logging serialises the whole request object
    // and the whole reply object — about fifteen lines per request, which
    // buries the messages actually worth reading (a boot failure, a new
    // device, a migration) under a wall of routine traffic. One line is
    // logged instead, from the hook below.
    disableRequestLogging: true,
    // Destroy idle keep-alive sockets on close instead of waiting for them to
    // time out. The browser and the dev proxy both hold connections open, and
    // waiting on them is what turns a shutdown into a hang that keeps the port.
    forceCloseConnections: 'idle',
  }).withTypeProvider<ZodTypeProvider>()

  // Zod is the single source of truth for validation, serialisation and the
  // OpenAPI document — one schema, not three that drift.
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  app.decorate('sonaraVersion', config.version)

  /**
   * Error handling is installed BEFORE any route is registered.
   *
   * `await app.register(...)` builds that plugin's encapsulation context
   * immediately, and a child context captures its parent's error handler at
   * the moment it is created. Setting the handler afterwards leaves every
   * already-registered route on Fastify's default one — which produces a
   * completely different error body, silently.
   */
  /**
   * One error handler, one envelope. Validation failures are the only case
   * that needs unpacking — everything else is either an AppError thrown by a
   * route or a genuine bug, and the two must not look alike to a client.
   */
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      request.log.info({ err: error }, 'request failed validation')
      return reply.code(400).send({
        error: {
          code: 'validation_failed',
          message: 'The request did not match the expected shape.',
          details: error.validation.map((issue) => ({
            path: issue.instancePath,
            message: issue.message,
          })),
        },
      })
    }

    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
      })
    }

    const status = error.statusCode ?? 500
    if (status >= 500) {
      request.log.error({ err: error }, 'unhandled error')
      // The message of an unexpected error can carry a file path, a query or a
      // stack frame. The client gets a code it can act on; the detail stays in
      // the log where it belongs.
      return reply
        .code(500)
        .send({ error: { code: 'internal_error', message: 'Something went wrong.' } })
    }

    return reply
      .code(status)
      .send({ error: { code: error.code ?? 'request_error', message: error.message } })
  })

  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({
      error: { code: 'not_found', message: `No route for ${request.method} ${request.url}.` },
    }),
  )

  app.addHook('onResponse', (request, reply, done) => {
    request.log.info(
      `${request.method} ${request.url} ${reply.statusCode} ${Math.round(reply.elapsedTime)}ms`,
    )
    done()
  })

  await app.register(helmet, {
    // The API serves JSON and the docs page; it never frames anything and is
    // never framed. CSP is left to whatever serves the SPA.
    contentSecurityPolicy: false,
  })

  await app.register(cors, {
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  })

  await app.register(dbPlugin, { databasePath: config.databasePath })

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Sonara API',
        version: config.version,
        description:
          'Backend for Sonara — the piano catalogue, and the MIDI device profile and configuration store.',
      },
      servers: [{ url: API_PREFIX }],
      tags: [
        { name: 'system', description: 'Health and diagnostics' },
        { name: 'instruments', description: 'The playable piano catalogue' },
        { name: 'devices', description: 'MIDI keyboard detection and configuration' },
      ],
    },
    transform: jsonSchemaTransform,
  })

  await app.register(scalar, { routePrefix: '/docs' })

  await app.register(
    async (api) => {
      await api.register(healthRoutes)
      await api.register(instrumentRoutes)
      await api.register(deviceRoutes)
    },
    { prefix: API_PREFIX },
  )

  return app
}
