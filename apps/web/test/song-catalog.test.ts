import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SONG_CATEGORIES } from '@sonara/shared'
import { SONG_CATALOG, catalogSongTitle } from '@/features/songs/catalog'
import { readSongBytes } from '@/features/songs/read-song'

/**
 * The songs that come with the app.
 *
 * The catalog is a list written by hand and the scores are files in another
 * folder, so nothing but this keeps the two in step: a song listed with no
 * score is a row in the chooser that fails when pressed, and a score with no
 * entry is a file shipped to every player that nobody can open.
 *
 * And each is read here the way the chooser reads it. These scores were
 * engraved by many hands in many programs, and one that imports with a hand
 * missing is a piece that plays itself and never asks for half its notes.
 */

const SCORES = path.join(import.meta.dirname, '..', 'public', 'songs')

describe('the built-in songs', () => {
  it('has a score for every song, and a song for every score', () => {
    const listed = SONG_CATALOG.map((entry) => `${entry.id}.mxl`).sort()
    expect(new Set(listed).size).toBe(listed.length)
    expect(readdirSync(SCORES).sort()).toEqual(listed)
  })

  it('puts every song in a category the chooser lists, and leaves no category empty', () => {
    const categories: readonly string[] = SONG_CATEGORIES.map((category) => category.id)
    for (const entry of SONG_CATALOG) expect(categories, entry.id).toContain(entry.category)
    for (const category of categories) {
      expect(
        SONG_CATALOG.some((entry) => entry.category === category),
        category,
      ).toBe(true)
    }
  })

  it('never calls two songs the same thing', () => {
    // The same piece twice is told apart by its edition, and by nothing else.
    const names = SONG_CATALOG.map(catalogSongTitle)
    expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual([])
  })

  it.each(SONG_CATALOG.map((entry) => [entry.id]))('%s reads as a piece for two hands', (id) => {
    const result = readSongBytes(new Uint8Array(readFileSync(path.join(SCORES, `${id}.mxl`))), id)
    if (!('song' in result)) throw new Error(`${id} could not be read: ${result.failure}`)

    const { notes } = result.song
    const played = notes.filter((note) => note.role === 'keyboard')
    // Nearly all of it under the fingers. What is not is a line of ornaments
    // the engraver kept on a staff of its own.
    expect(played.length / notes.length).toBeGreaterThan(0.99)
    expect(played.some((note) => note.hand === 'right')).toBe(true)
    expect(played.some((note) => note.hand === 'left')).toBe(true)
    // From the staves, not guessed from how high each note is.
    expect(result.song.handsInferred).toBe(false)
    expect(result.song.measureCount).toBeGreaterThan(0)
  })
})
