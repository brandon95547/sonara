import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { healthSchema } from '@sonara/shared'
import { z } from 'zod'

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/health',
    {
      schema: {
        tags: ['system'],
        summary: 'Liveness and readiness',
        description:
          'Returns `degraded` rather than failing when the database is unreachable, so a load balancer can tell "the process is up but cannot serve" apart from "the process is gone".',
        response: { 200: healthSchema, 503: healthSchema },
      },
    },
    async (request, reply) => {
      let databaseOk = true
      try {
        app.db.prepare('SELECT 1').get()
      } catch (error) {
        databaseOk = false
        request.log.error({ err: error }, 'health check: database unreachable')
      }

      const body = {
        status: databaseOk ? ('ok' as const) : ('degraded' as const),
        version: app.sonaraVersion,
        uptimeSeconds: Math.round(process.uptime()),
      }
      return reply.code(databaseOk ? 200 : 503).send(body)
    },
  )

  app.get(
    '/health/live',
    {
      schema: {
        tags: ['system'],
        summary: 'Process liveness only — never touches the database',
        response: { 200: z.object({ status: z.literal('ok') }) },
      },
    },
    async () => ({ status: 'ok' as const }),
  )
}
