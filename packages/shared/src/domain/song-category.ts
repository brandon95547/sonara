import { z } from 'zod'

/**
 * The shelves the built-in songs are sorted onto: by mood, which is how
 * someone choosing a piece to play thinks of it.
 *
 * Here, in the contract, because the server stores which shelf a song has been
 * moved to and has to know a shelf from a typo. The songs themselves, and the
 * shelf each starts on, are the app's (`features/songs/catalog.ts`).
 */
export const SONG_CATEGORIES = [
  { id: 'peaceful', label: 'Peaceful & Calm' },
  { id: 'reflective', label: 'Reflective' },
  { id: 'romantic', label: 'Romantic' },
  { id: 'joyful', label: 'Joyful & Uplifting' },
  { id: 'dramatic', label: 'Dramatic & Powerful' },
  { id: 'mysterious', label: 'Mysterious & Dark' },
  { id: 'dreamy', label: 'Dreamy & Atmospheric' },
  { id: 'playful', label: 'Playful & Energetic' },
] as const

export const songCategorySchema = z.enum(
  SONG_CATEGORIES.map((category) => category.id) as [
    (typeof SONG_CATEGORIES)[number]['id'],
    ...(typeof SONG_CATEGORIES)[number]['id'][],
  ],
)
export type SongCategory = z.infer<typeof songCategorySchema>

/** A built-in song's id: the name of its score, in lower case with hyphens. */
export const songIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/)

/**
 * A song that has been moved off the shelf it came on, and where to.
 *
 * Only the moves are stored. A song with none is on its own shelf, so a new
 * song, or a shelf the catalog changes its mind about, needs nothing done here.
 */
export const songCategoryChoiceSchema = z.object({
  songId: songIdSchema,
  category: songCategorySchema,
})
export type SongCategoryChoice = z.infer<typeof songCategoryChoiceSchema>

export const setSongCategorySchema = z.object({ category: songCategorySchema })
