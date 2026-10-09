import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  collectionSchema,
  setSongCategorySchema,
  songCategoryChoiceSchema,
  songIdSchema,
  type SongCategoryChoice,
} from '@sonara/shared'

/**
 * Which shelf of the song chooser each built-in song is on, where it has been
 * moved from the one it came on.
 *
 * The songs and their own shelves are the app's. What is kept here is the
 * moving: it is the one thing about them that someone using the app decides,
 * and it is decided once for everybody rather than browser by browser.
 */
export const songRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/songs/categories',
    {
      schema: {
        tags: ['songs'],
        summary: 'The built-in songs that have been moved to another category',
        response: { 200: collectionSchema(songCategoryChoiceSchema) },
      },
    },
    async () => ({
      items: app.db
        .prepare('SELECT song_id AS songId, category FROM song_categories ORDER BY song_id')
        .all() as SongCategoryChoice[],
    }),
  )

  app.put(
    '/songs/:songId/category',
    {
      schema: {
        tags: ['songs'],
        summary: 'Move a built-in song to a category',
        description:
          'Idempotent. Stores the move, replacing any earlier one for the same song. The server does not know the catalog, so any well-formed song id is accepted.',
        params: z.object({ songId: songIdSchema }),
        body: setSongCategorySchema,
        response: { 200: songCategoryChoiceSchema },
      },
    },
    async (request) => {
      const choice = { songId: request.params.songId, category: request.body.category }
      app.db
        .prepare(
          `INSERT INTO song_categories (song_id, category, updated_at)
           VALUES (@songId, @category, @at)
           ON CONFLICT (song_id) DO UPDATE SET category = excluded.category, updated_at = excluded.updated_at`,
        )
        .run({ ...choice, at: new Date().toISOString() })
      return choice
    },
  )
}
