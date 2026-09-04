import { z } from 'zod'

/**
 * The API's error envelope. One shape for every failure, so the client has one
 * thing to parse and one thing to render.
 */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
})
export type ApiError = z.infer<typeof apiErrorSchema>

/** Collections are wrapped so a response can grow a cursor without a breaking change. */
export function collectionSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({ items: z.array(item) })
}

export const API_VERSION = 'v1' as const
export const API_PREFIX = `/api/${API_VERSION}` as const

export const healthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  uptimeSeconds: z.number(),
})
export type Health = z.infer<typeof healthSchema>
