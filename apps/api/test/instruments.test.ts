import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { instrumentSchema } from '@sonara/shared'
import { createTestApp } from './helpers.js'

describe('instruments', () => {
  let app: FastifyInstance
  beforeEach(async () => {
    app = await createTestApp()
  })
  afterEach(async () => {
    await app.close()
  })

  it('lists the catalogue with a default selection', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/instruments' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.items.length).toBeGreaterThan(0)
    expect(body.items.some((i: { id: string }) => i.id === body.defaultInstrumentId)).toBe(true)
  })

  it('serves instruments that satisfy the shared schema', async () => {
    // The client parses with this schema. If the server can emit something it
    // rejects, the app breaks at runtime with no server-side error at all.
    const res = await app.inject({ method: 'GET', url: '/api/v1/instruments' })
    for (const item of res.json().items) {
      expect(() => instrumentSchema.parse(item)).not.toThrow()
    }
  })

  it('always includes an instrument that needs no network', async () => {
    // The offline guarantee. If every piano is sampled, a player with a slow
    // connection has a silent app.
    const res = await app.inject({ method: 'GET', url: '/api/v1/instruments' })
    expect(
      res.json().items.some((i: { engine: { kind: string } }) => i.engine.kind === 'synth'),
    ).toBe(true)
  })

  it('gives every sampled instrument a fallback voicing', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/instruments' })
    for (const item of res.json().items) {
      expect(item.voicing.partials.length).toBeGreaterThan(0)
    }
  })

  it('404s an unknown instrument with the error envelope', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/instruments/theremin' })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toMatchObject({ code: 'not_found' })
  })
})
