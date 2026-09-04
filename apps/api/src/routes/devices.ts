import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  collectionSchema,
  deviceProfileSchema,
  deviceSchema,
  registerDeviceSchema,
  updateDeviceConfigSchema,
} from '@sonara/shared'
import { AppError } from '../errors.js'

const deviceIdParams = z.object({ id: z.string().min(1).max(200) })

const registerResponseSchema = z.object({
  device: deviceSchema,
  created: z.boolean(),
  detection: z.object({
    source: z.enum(['profile', 'name-heuristic', 'default']),
    profileLabel: z.string().nullable(),
  }),
})

export const deviceRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/device-profiles',
    {
      schema: {
        tags: ['devices'],
        summary: 'Known controller profiles used for auto-detection',
        response: { 200: collectionSchema(deviceProfileSchema) },
      },
    },
    async () => ({ items: app.devices.listProfiles() }),
  )

  app.get(
    '/devices',
    {
      schema: {
        tags: ['devices'],
        summary: 'Every keyboard this install has seen, most recent first',
        response: { 200: collectionSchema(deviceSchema) },
      },
    },
    async () => ({ items: app.devices.list() }),
  )

  app.post(
    '/devices',
    {
      schema: {
        tags: ['devices'],
        summary: 'Announce a MIDI port the browser has reported',
        description:
          'Idempotent. The browser calls this for every port on every page load and on every hot-plug; a keyboard already known keeps its saved configuration and only has its last-seen time refreshed. Responds 201 the first time a keyboard is seen and 200 afterwards.',
        body: registerDeviceSchema,
        response: { 200: registerResponseSchema, 201: registerResponseSchema },
      },
    },
    async (request, reply) => {
      const result = app.devices.register(request.body)
      if (result.created) {
        request.log.info(
          { deviceId: result.device.id, detection: result.detection },
          'new MIDI device registered',
        )
      }
      return reply.code(result.created ? 201 : 200).send(result)
    },
  )

  app.get(
    '/devices/:id',
    {
      schema: {
        tags: ['devices'],
        summary: 'One keyboard and its configuration',
        params: deviceIdParams,
        response: { 200: deviceSchema },
      },
    },
    async (request) => {
      const device = app.devices.find(request.params.id)
      if (!device) throw AppError.notFound('device', request.params.id)
      return device
    },
  )

  app.patch(
    '/devices/:id/config',
    {
      schema: {
        tags: ['devices'],
        summary: 'Change how a keyboard is interpreted',
        description:
          'A partial update — send only the fields that changed. The merged result is validated as a whole, so a patch that would produce an inverted key range is rejected rather than stored.',
        params: deviceIdParams,
        body: updateDeviceConfigSchema,
        response: { 200: deviceSchema },
      },
    },
    async (request) => {
      const device = app.devices.updateConfig(request.params.id, request.body)
      if (!device) throw AppError.notFound('device', request.params.id)
      return device
    },
  )

  app.post(
    '/devices/:id/config/reset',
    {
      schema: {
        tags: ['devices'],
        summary: 'Restore the configuration auto-detection would produce today',
        params: deviceIdParams,
        response: { 200: deviceSchema },
      },
    },
    async (request) => {
      const device = app.devices.resetConfig(request.params.id)
      if (!device) throw AppError.notFound('device', request.params.id)
      return device
    },
  )

  app.delete(
    '/devices/:id',
    {
      schema: {
        tags: ['devices'],
        summary: 'Forget a keyboard and its settings',
        params: deviceIdParams,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      if (!app.devices.delete(request.params.id)) {
        throw AppError.notFound('device', request.params.id)
      }
      return reply.code(204).send(null)
    },
  )
}
