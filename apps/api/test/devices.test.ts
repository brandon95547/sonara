import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createTestApp } from './helpers.js'

const register = (app: FastifyInstance, name: string, manufacturer = '') =>
  app.inject({ method: 'POST', url: '/api/v1/devices', payload: { name, manufacturer } })

describe('device registration', () => {
  let app: FastifyInstance
  beforeEach(async () => {
    app = await createTestApp()
  })
  afterEach(async () => {
    await app.close()
  })

  it('creates a device on first sight and recognises a known keyboard', async () => {
    const res = await register(app, 'P-125', 'Yamaha')
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.created).toBe(true)
    expect(body.detection.source).toBe('profile')
    expect(body.detection.profileLabel).toBe('Yamaha P-series')
    expect(body.device.keyCount).toBe(88)
    expect(body.device.config.range).toEqual({ low: 21, high: 108 })
  })

  it('is idempotent — re-announcing never resets saved settings', async () => {
    // The browser re-announces every port on every page load. If that wiped
    // the config, no setting would survive a refresh.
    const first = await register(app, 'MPK Mini Mk3', 'AKAI')
    const id = first.json().device.id

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/devices/${id}/config`,
      payload: { transpose: 5 },
    })

    const second = await register(app, 'MPK Mini Mk3', 'AKAI')
    expect(second.statusCode).toBe(200)
    expect(second.json().created).toBe(false)
    expect(second.json().device.config.transpose).toBe(5)
  })

  it('collapses the port-index suffix browsers append onto one device', async () => {
    await register(app, 'P-125', 'Yamaha')
    await register(app, 'P-125 MIDI 1', 'Yamaha')

    const list = await app.inject({ method: 'GET', url: '/api/v1/devices' })
    expect(list.json().items).toHaveLength(1)
  })

  it('guesses a size from the product name when no profile matches', async () => {
    const res = await register(app, 'Q-Board 49', 'Generic Audio')
    expect(res.json().detection.source).toBe('name-heuristic')
    expect(res.json().device.keyCount).toBe(49)
  })

  it('falls back to 61 keys for an anonymous port', async () => {
    const res = await register(app, 'Port A', '')
    expect(res.json().detection.source).toBe('default')
    expect(res.json().device.keyCount).toBe(61)
  })

  it('picks the velocity curve that suits the action', async () => {
    const weighted = await register(app, 'FP-30X', 'Roland')
    expect(weighted.json().device.config.velocityCurve).toBe('linear')

    const mini = await register(app, 'MiniLab 3', 'Arturia')
    expect(mini.json().device.config.velocityCurve).toBe('soft')
  })

  it('rejects an empty device name', async () => {
    const res = await register(app, '')
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('validation_failed')
  })
})

describe('device configuration', () => {
  let app: FastifyInstance
  let id: string
  beforeEach(async () => {
    app = await createTestApp()
    id = (await register(app, 'Keystation 61 MK3', 'M-Audio')).json().device.id
  })
  afterEach(async () => {
    await app.close()
  })

  it('merges a partial patch over the stored config', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/devices/${id}/config`,
      payload: { transpose: -3, velocityCurve: 'hard' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().config).toMatchObject({
      transpose: -3,
      velocityCurve: 'hard',
      // Untouched fields survive the patch.
      sustainEnabled: true,
      octaveShift: 0,
    })
  })

  it('validates the merged result, not just the patch', async () => {
    // `low` alone is a valid number; it is only invalid against the stored
    // `high`. Validating the patch in isolation would let this through.
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/devices/${id}/config`,
      payload: { range: { low: 100, high: 40 } },
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejects an out-of-range transpose', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/devices/${id}/config`,
      payload: { transpose: 99 },
    })
    expect(res.statusCode).toBe(400)
  })

  it('accepts omni via a null channel filter', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/devices/${id}/config`,
      payload: { channelFilter: null },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().config.channelFilter).toBeNull()
  })

  it('restores detection defaults on reset', async () => {
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/devices/${id}/config`,
      payload: { transpose: 7, octaveShift: 2 },
    })
    const res = await app.inject({ method: 'POST', url: `/api/v1/devices/${id}/config/reset` })
    expect(res.json().config).toMatchObject({ transpose: 0, octaveShift: 0, velocityCurve: 'soft' })
    expect(res.json().config.range).toEqual({ low: 36, high: 96 })
  })

  it('forgets a device on delete', async () => {
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/devices/${id}` })).statusCode).toBe(
      204,
    )
    expect((await app.inject({ method: 'GET', url: `/api/v1/devices/${id}` })).statusCode).toBe(404)
  })

  it('404s config changes for an unknown device', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/devices/nothing-here/config',
      payload: { transpose: 1 },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('device profiles', () => {
  let app: FastifyInstance
  beforeEach(async () => {
    app = await createTestApp()
  })
  afterEach(async () => {
    await app.close()
  })

  it('seeds the built-in catalogue and orders it by priority', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/device-profiles' })
    const items = res.json().items as { priority: number }[]
    expect(items.length).toBeGreaterThan(20)
    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1]!.priority).toBeGreaterThanOrEqual(items[i]!.priority)
    }
  })

  it('has no two profiles sharing an id', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/device-profiles' })
    const ids = (res.json().items as { id: string }[]).map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('ships only patterns that compile', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/device-profiles' })
    for (const profile of res.json().items as { namePattern: string }[]) {
      expect(() => new RegExp(profile.namePattern, 'i')).not.toThrow()
    }
  })
})
