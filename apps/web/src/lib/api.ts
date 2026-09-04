import { z } from 'zod'
import {
  API_PREFIX,
  apiErrorSchema,
  collectionSchema,
  deviceSchema,
  instrumentSchema,
  type Device,
  type DeviceIdentity,
  type Instrument,
  type UpdateDeviceConfigInput,
} from '@sonara/shared'

/**
 * The API client.
 *
 * Every response is parsed with the same zod schema the server validated it
 * against. That costs a few microseconds and buys the thing a typed client
 * otherwise only pretends to have: if the server and the client disagree, the
 * failure happens here, with a message that names the field — instead of three
 * layers down as `undefined is not an object`.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? API_PREFIX

export class ApiClientError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
    this.code = code
    this.details = details
  }

  /** True when retrying might work: a network blip or a 5xx. */
  get isTransient(): boolean {
    return this.status === 0 || this.status >= 500
  }
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit & { signal?: AbortSignal },
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        accept: 'application/json',
        ...init?.headers,
      },
    })
  } catch (error) {
    // fetch rejects only for network-level failures. Status 0 marks "we never
    // reached the server", which the UI treats differently from a 4xx.
    throw new ApiClientError(0, 'network_error', 'Could not reach the Sonara server.', error)
  }

  if (response.status === 204) return schema.parse(null)

  const payload: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(payload)
    throw parsed.success
      ? new ApiClientError(
          response.status,
          parsed.data.error.code,
          parsed.data.error.message,
          parsed.data.error.details,
        )
      : new ApiClientError(
          response.status,
          'unexpected_error',
          `Request failed (${response.status}).`,
        )
  }

  const result = schema.safeParse(payload)
  if (!result.success) {
    throw new ApiClientError(
      response.status,
      'response_shape_mismatch',
      `The server sent a response this build does not understand (${path}).`,
      result.error.issues,
    )
  }
  return result.data
}

const instrumentsResponse = collectionSchema(instrumentSchema).extend({
  defaultInstrumentId: z.string(),
})

const registerDeviceResponse = z.object({
  device: deviceSchema,
  created: z.boolean(),
  detection: z.object({
    source: z.enum(['profile', 'name-heuristic', 'default']),
    profileLabel: z.string().nullable(),
  }),
})
export type RegisterDeviceResponse = z.infer<typeof registerDeviceResponse>

export const api = {
  listInstruments: (signal?: AbortSignal) =>
    request('/instruments', instrumentsResponse, { signal }),

  listDevices: (signal?: AbortSignal) =>
    request('/devices', collectionSchema(deviceSchema), { signal }),

  registerDevice: (identity: DeviceIdentity) =>
    request('/devices', registerDeviceResponse, {
      method: 'POST',
      body: JSON.stringify(identity),
    }),

  updateDeviceConfig: (id: string, patch: UpdateDeviceConfigInput) =>
    request(`/devices/${encodeURIComponent(id)}/config`, deviceSchema, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  resetDeviceConfig: (id: string) =>
    request(`/devices/${encodeURIComponent(id)}/config/reset`, deviceSchema, { method: 'POST' }),

  forgetDevice: (id: string) =>
    request(`/devices/${encodeURIComponent(id)}`, z.null(), { method: 'DELETE' }),
}

export type { Device, Instrument }
