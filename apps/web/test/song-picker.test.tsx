import { readFileSync } from 'node:fs'
import path from 'node:path'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SONG_CATEGORIES } from '@sonara/shared'
import { SONG_CATALOG } from '@/features/songs/catalog'
import { SongPicker, showMySongs } from '@/features/songs/SongPicker'
import { useSongStore } from '@/state/song-store'

/**
 * The song chooser: the dialog Songs opens on.
 *
 * It is the only way to a song, so what is pinned is the way through it: the
 * styles are shelves, a search looks on all of them, and pressing a built-in
 * song fetches its score, opens it and gets out of the way.
 */

// jsdom has no layout and so no media queries; the dialog asks one to know
// whether it is on a phone. Nothing matches, which is the desktop it is drawn for.
globalThis.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
})) as unknown as typeof globalThis.matchMedia

const score = (id: string) =>
  new Uint8Array(readFileSync(path.join(import.meta.dirname, '..', 'public', 'songs', `${id}.mxl`)))

/**
 * Answers what the chooser asks for: a built-in score, from the folder the app
 * serves, and the server's list of songs that have been moved, which it also
 * takes moves into.
 */
const serveScores = (moves: { songId: string; category: string }[] = []) =>
  vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
    const moving = /songs\/([a-z0-9-]+)\/category$/.exec(url)
    if (moving) {
      const move = { songId: moving[1]!, category: JSON.parse(init!.body!).category as string }
      moves.push(move)
      return json(move)
    }
    if (url.endsWith('/songs/categories')) return json({ items: [...moves] })
    const bytes = score(/songs\/(.+)\.mxl$/.exec(url)![1]!)
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () =>
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    }
  })

/** The scores a fetch stub was asked for, leaving out what was asked of the server. */
const scoresAsked = (fetched: ReturnType<typeof serveScores>) =>
  fetched.mock.calls.map((call) => String(call[0])).filter((url) => url.endsWith('.mxl'))

/** The chooser as the app mounts it: inside the thing that asks the server. */
const show = (onClose: () => void = () => {}) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SongPicker open onClose={onClose} />
    </QueryClientProvider>,
  )

// Found by where they are rather than by role: working out the accessible name
// of every row to find one of them takes jsdom a second a query.
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!
const starting = (selector: string, text: string) =>
  [...dialog().querySelectorAll<HTMLElement>(selector)].find((element) =>
    element.textContent?.startsWith(text),
  )!
const shelf = (name: string) => starting('[role="group"] button', name)
const song = (title: string) => starting('li button', title)
const rows = () => [...dialog().querySelectorAll('li')]

beforeEach(() => {
  vi.stubGlobal('fetch', serveScores())
  useSongStore.setState({ library: [], builtIn: [], currentId: null })
  // The chooser keeps the shelf it was left on; each case starts on the first.
  show()
  fireEvent.click(shelf('All songs'))
  cleanup()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the song chooser', () => {
  it('lists every built-in song under its mood', () => {
    show()
    expect(screen.getByRole('dialog', { name: 'Choose a song' })).toBe(dialog())
    expect(rows()).toHaveLength(SONG_CATALOG.length)
    expect([...dialog().querySelectorAll('h3')].map((heading) => heading.textContent)).toEqual(
      SONG_CATEGORIES.map((category) => category.label),
    )
  })

  it('shows one mood at a time when its shelf is chosen', () => {
    show()
    fireEvent.click(shelf('Dreamy'))
    expect(shelf('Dreamy').getAttribute('aria-pressed')).toBe('true')
    // The catalog's own Dreamy songs, in its order, and no other mood's.
    const dreamy = SONG_CATALOG.filter((song) => song.category === 'dreamy')
    expect(dreamy.length).toBeGreaterThan(1)
    expect(dreamy.length).toBeLessThan(SONG_CATALOG.length)
    expect(rows().map((row) => row.textContent)).toEqual(
      dreamy.map(
        (song) => `${song.title}${song.composer}${song.edition ? ` · ${song.edition}` : ''}`,
      ),
    )
    expect(rows()[0]?.textContent).toBe('Clair de LuneClaude Debussy')
  })

  it('moves a song to another category, and tells the server', async () => {
    const moves: { songId: string; category: string }[] = []
    vi.stubGlobal('fetch', serveScores(moves))
    show()
    fireEvent.click(shelf('Dreamy'))
    fireEvent.click(starting('footer button', 'Edit categories'))

    // Each row is now a choice of category rather than a song to open.
    fireEvent.change(within(dialog()).getByLabelText('Category for Arabesque No. 1 in E Major'), {
      target: { value: 'peaceful' },
    })

    await waitFor(() =>
      expect(moves).toEqual([{ songId: 'debussy-arabesque-no-1', category: 'peaceful' }]),
    )
    // Gone from this shelf, and on the other: the shelf is one song shorter.
    expect(rows().map((row) => row.textContent)).not.toContain(expect.stringContaining('Arabesque'))
    expect(rows()).toHaveLength(
      SONG_CATALOG.filter((song) => song.category === 'dreamy').length - 1,
    )
    fireEvent.click(starting('footer button', 'Done'))
    fireEvent.click(shelf('Peaceful'))
    expect(rows().some((row) => row.textContent?.startsWith('Arabesque No. 1'))).toBe(true)
  })

  it('shelves a song where the server says it was moved to', async () => {
    vi.stubGlobal('fetch', serveScores([{ songId: 'joplin-maple-leaf-rag', category: 'dreamy' }]))
    show()
    fireEvent.click(shelf('Dreamy'))
    await waitFor(() =>
      expect(rows().some((row) => row.textContent?.startsWith('Maple Leaf Rag'))).toBe(true),
    )
  })

  it('searches every shelf at once, without minding accents', () => {
    show()
    fireEvent.click(shelf('Dreamy'))
    const search = within(dialog()).getByLabelText('Search songs')
    fireEvent.change(search, { target: { value: 'fur elise' } })
    // Every edition of it, however many the catalog holds, and nothing else.
    const editions = SONG_CATALOG.filter((song) => song.title === 'Für Elise').length
    expect(editions).toBeGreaterThan(1)
    expect(rows()).toHaveLength(editions)
    for (const row of rows()) expect(row.textContent).toContain('Für Elise')

    fireEvent.change(search, { target: { value: 'no such piece' } })
    expect(rows()).toHaveLength(0)
    expect(dialog().textContent).toContain('No song matches “no such piece”.')
  })

  it('fetches a built-in song when it is pressed, opens it, and closes', async () => {
    const fetched = serveScores()
    vi.stubGlobal('fetch', fetched)
    const onClose = vi.fn()
    show(onClose)

    fireEvent.click(song('Maple Leaf Rag'))
    await waitFor(() => expect(onClose).toHaveBeenCalled())

    expect(scoresAsked(fetched)).toEqual([
      expect.stringMatching(/songs\/joplin-maple-leaf-rag\.mxl$/),
    ])
    const state = useSongStore.getState()
    expect(state.currentId).toBe('catalog:joplin-maple-leaf-rag')
    expect(state.builtIn.map((song) => song.title)).toEqual(['Maple Leaf Rag'])
    // It came with the app, so it is not one of the player's own, and not stored.
    expect(state.library).toEqual([])
  })

  it('opens a song it already has without fetching it again, and marks it as the open one', async () => {
    const fetched = serveScores()
    vi.stubGlobal('fetch', fetched)
    const onClose = vi.fn()
    show(onClose)
    const maple = () => song('Maple Leaf Rag')

    fireEvent.click(maple())
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(maple().getAttribute('aria-current')).toBe('true')
    expect(maple().textContent).toContain('Open')

    fireEvent.click(maple())
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(scoresAsked(fetched)).toHaveLength(1)
  })

  it('opens a quick song at ninety, and a slow one at its own tempo', async () => {
    vi.stubGlobal('fetch', serveScores())
    const onClose = vi.fn()
    show(onClose)

    // Maple Leaf Rag is written at a hundred.
    fireEvent.click(song('Maple Leaf Rag'))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    const rag = useSongStore.getState()
    expect(rag.builtIn[0]!.bpm).toBe(100)
    expect(rag.builtIn[0]!.bpm * rag.tempoScale).toBeCloseTo(90, 5)

    // Ave Maria at forty: nothing to slow down, and nothing carried over from
    // the rag, whose nine tenths would have made it thirty-six.
    fireEvent.click(song('Ave Maria'))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(2))
    expect(useSongStore.getState().tempoScale).toBe(1)
  })

  it('says so when a score does not arrive, and stays open', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/songs/categories')
          ? { ok: true, status: 200, json: async () => ({ items: [] }) }
          : { ok: false, status: 404 },
      ),
    )
    const onClose = vi.fn()
    show(onClose)

    fireEvent.click(song('Swan Lake'))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Could not load Swan Lake')
    expect(onClose).not.toHaveBeenCalled()
    expect(useSongStore.getState().currentId).toBeNull()
  })

  it('turns to the player’s own songs when asked, which is where importing is', () => {
    showMySongs()
    show()
    expect(shelf('My songs').getAttribute('aria-pressed')).toBe('true')
    expect(dialog().textContent).toContain('Nothing imported yet.')
    expect(starting('footer button', 'Import a song')).toBeTruthy()
  })
})
