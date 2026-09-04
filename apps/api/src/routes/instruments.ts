import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { collectionSchema, instrumentSchema } from '@sonara/shared'
import { INSTRUMENTS, DEFAULT_INSTRUMENT_ID, findInstrument } from '../data/instruments.js'
import { AppError } from '../errors.js'

export const instrumentRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/instruments',
    {
      schema: {
        tags: ['instruments'],
        summary: 'The playable piano catalogue',
        response: {
          200: collectionSchema(instrumentSchema).extend({
            defaultInstrumentId: z.string(),
          }),
        },
      },
    },
    async () => ({ items: [...INSTRUMENTS], defaultInstrumentId: DEFAULT_INSTRUMENT_ID }),
  )

  app.get(
    '/instruments/:id',
    {
      schema: {
        tags: ['instruments'],
        summary: 'One piano',
        params: z.object({ id: z.string().min(1) }),
        response: { 200: instrumentSchema },
      },
    },
    async (request) => {
      const instrument = findInstrument(request.params.id)
      if (!instrument) throw AppError.notFound('instrument', request.params.id)
      return instrument
    },
  )
}
