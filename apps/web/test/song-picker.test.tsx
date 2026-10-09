import { readFileSync } from 'node:fs'
import path from 'node:path'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SONG_CATALOG, SONG_STYLES } from '@/features/songs/catalog'
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

/** Answers a request for a built-in score from the folder the app serves. */
const serveScores = () =>
  vi.fn(async (url: string) => {
    const bytes = score(/songs\/(.+)\.mxl$/.exec(url)![1]!)
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () =>
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    }
  })

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
  useSongStore.setState({ library: [], builtIn: [], currentId: null })
  // The chooser keeps the shelf it was left on; each case starts on the first.
  render(<SongPicker open onClose={() => {}} />)
  fireEvent.click(shelf('All songs'))
  cleanup()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the song chooser', () => {
  it('lists every built-in song under its style', () => {
    render(<SongPicker open onClose={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'Choose a song' })).toBe(dialog())
    expect(rows()).toHaveLength(SONG_CATALOG.length)
    expect([...dialog().querySelectorAll('h3')].map((heading) => heading.textContent)).toEqual(
      SONG_STYLES.map((style) => style.label),
    )
  })

  it('shows one style at a time when its shelf is chosen', () => {
    render(<SongPicker open onClose={() => {}} />)
    fireEvent.click(shelf('Ragtime'))
    expect(shelf('Ragtime').getAttribute('aria-pressed')).toBe('true')
    expect(rows().map((row) => row.textContent)).toEqual([
      'The EntertainerScott Joplin',
      'The EntertainerScott Joplin · Version 2',
      'Maple Leaf RagScott Joplin',
    ])
  })

  it('searches every shelf at once, without minding accents', () => {
    render(<SongPicker open onClose={() => {}} />)
    fireEvent.click(shelf('Ragtime'))
    const search = within(dialog()).getByLabelText('Search songs')
    fireEvent.change(search, { target: { value: 'fur elise' } })
    expect(rows()).toHaveLength(4)
    for (const row of rows()) expect(row.textContent).toContain('Für Elise')

    fireEvent.change(search, { target: { value: 'no such piece' } })
    expect(rows()).toHaveLength(0)
    expect(dialog().textContent).toContain('No song matches “no such piece”.')
  })

  it('fetches a built-in song when it is pressed, opens it, and closes', async () => {
    const fetched = serveScores()
    vi.stubGlobal('fetch', fetched)
    const onClose = vi.fn()
    render(<SongPicker open onClose={onClose} />)

    fireEvent.click(song('Maple Leaf Rag'))
    await waitFor(() => expect(onClose).toHaveBeenCalled())

    expect(String(fetched.mock.calls[0]![0])).toMatch(/songs\/joplin-maple-leaf-rag\.mxl$/)
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
    render(<SongPicker open onClose={onClose} />)
    const maple = () => song('Maple Leaf Rag')

    fireEvent.click(maple())
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(maple().getAttribute('aria-current')).toBe('true')
    expect(maple().textContent).toContain('Open')

    fireEvent.click(maple())
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(fetched).toHaveBeenCalledTimes(1)
  })

  it('says so when a score does not arrive, and stays open', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404 })),
    )
    const onClose = vi.fn()
    render(<SongPicker open onClose={onClose} />)

    fireEvent.click(song('Swan Lake'))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Could not load Swan Lake')
    expect(onClose).not.toHaveBeenCalled()
    expect(useSongStore.getState().currentId).toBeNull()
  })

  it('turns to the player’s own songs when asked, which is where importing is', () => {
    showMySongs()
    render(<SongPicker open onClose={() => {}} />)
    expect(shelf('My songs').getAttribute('aria-pressed')).toBe('true')
    expect(dialog().textContent).toContain('Nothing imported yet.')
    expect(starting('footer button', 'Import a song')).toBeTruthy()
  })
})
