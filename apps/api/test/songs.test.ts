import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { songCategoryChoiceSchema } from '@sonara/shared'
import { createTestApp } from './helpers.js'

describe('song categories', () => {
  let app: FastifyInstance
  beforeEach(async () => {
    app = await createTestApp()
  })
  afterEach(async () => {
    await app.close()
  })

  const moved = async () =>
    (await app.inject({ method: 'GET', url: '/api/v1/songs/categories' })).json().items
  const move = (songId: string, category: string) =>
    app.inject({
      method: 'PUT',
      url: `/api/v1/songs/${songId}/category`,
      payload: { category },
    })

  it('starts with no song moved: each is on the shelf the app gives it', async () => {
    expect(await moved()).toEqual([])
  })

  it('remembers a move, in the shape the client parses', async () => {
    const res = await move('bach-air-on-the-g-string', 'reflective')
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ songId: 'bach-air-on-the-g-string', category: 'reflective' })
    const items = await moved()
    expect(items).toEqual([{ songId: 'bach-air-on-the-g-string', category: 'reflective' }])
    for (const item of items) expect(() => songCategoryChoiceSchema.parse(item)).not.toThrow()
  })

  it('keeps only the latest move of a song', async () => {
    await move('pachelbel-canon-in-d', 'joyful')
    await move('pachelbel-canon-in-d', 'dreamy')
    expect(await moved()).toEqual([{ songId: 'pachelbel-canon-in-d', category: 'dreamy' }])
  })

  it('refuses a category that is not one of the shelves, and an id that is not a song id', async () => {
    expect((await move('pachelbel-canon-in-d', 'baroque')).statusCode).toBe(400)
    expect((await move('Not%20A%20Song', 'dreamy')).statusCode).toBe(400)
    expect(await moved()).toEqual([])
  })
})
