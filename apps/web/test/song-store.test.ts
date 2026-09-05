import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The library outlives the code that wrote it.
 *
 * A song saved before parts and roles existed has neither, and the two failures
 * that causes look nothing alike: reading `parts.length` throws and takes the
 * whole library dialog down, while a note with no role is neither the part
 * being learned nor percussion — so it sounds, lights no keys, and says nothing
 * about why. The second is the worse one, and the only one a crash report would
 * never mention.
 */

const KEY = 'sonara.songs.v1'

/** Exactly the shape stored before roles and parts were added. */
const legacy = {
  id: 'midi:Old Song:1',
  title: 'Old Song',
  bpm: 120,
  beatsPerMeasure: 4,
  measureMs: 2000,
  measureCount: 2,
  durationMs: 2400,
  source: 'midi',
  handsInferred: false,
  notes: [
    { note: 72, velocity: 80, startMs: 0, durationMs: 400, hand: 'right' },
    { note: 48, velocity: 80, startMs: 0, durationMs: 900, hand: 'left' },
  ],
}

/** The store reads storage once, at module load, so each case needs a fresh one. */
const freshStore = async () => {
  vi.resetModules()
  return (await import('@/state/song-store')).useSongStore
}

beforeEach(() => window.localStorage.clear())
afterEach(() => window.localStorage.clear())

describe('loading a library written by an older version', () => {
  it('gives every note a role, so playback still lights the keys', async () => {
    window.localStorage.setItem(KEY, JSON.stringify([legacy]))
    const store = await freshStore()
    const song = store.getState().library[0]!
    expect(song.notes.every((note) => note.role === 'keyboard')).toBe(true)
  })

  it('gives the song a parts list, so the library can render it', async () => {
    window.localStorage.setItem(KEY, JSON.stringify([legacy]))
    const store = await freshStore()
    expect(store.getState().library[0]!.parts).toEqual(['Piano'])
  })

  it('leaves a song that already has roles alone', async () => {
    const current = {
      ...legacy,
      parts: ['Piano', 'Drums'],
      notes: [{ ...legacy.notes[0], role: 'percussion' }],
    }
    window.localStorage.setItem(KEY, JSON.stringify([current]))
    const store = await freshStore()
    expect(store.getState().library[0]!.notes[0]!.role).toBe('percussion')
    expect(store.getState().library[0]!.parts).toEqual(['Piano', 'Drums'])
  })

  it('drops an entry too broken to migrate rather than half-loading it', async () => {
    window.localStorage.setItem(KEY, JSON.stringify([{ title: 'No id, no notes' }, legacy]))
    const store = await freshStore()
    expect(store.getState().library).toHaveLength(1)
    expect(store.getState().library[0]!.title).toBe('Old Song')
  })

  it('treats unreadable storage as an empty library, not a broken app', async () => {
    window.localStorage.setItem(KEY, '{ this is not json')
    const store = await freshStore()
    expect(store.getState().library).toEqual([])
  })
})
