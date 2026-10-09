import { cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { pageActions, usePageStore, usePageSync } from '@/state/page-store'
import { useLearningStore } from '@/state/learning-store'
import { usePanelStore } from '@/state/panel-store'
import { useSongStore } from '@/state/song-store'
import { RunMeter } from '@/features/learning/RunMeter'

/**
 * The dashboard is the front door, and the address bar is where you are.
 *
 * Pinned because the page is held in the URL rather than in state alone: Back
 * has to leave an area for the dashboard, and leaving must not leave a song
 * that set itself playing again on the way back in.
 */

afterEach(() => {
  cleanup()
  globalThis.location.hash = ''
  usePanelStore.getState().close()
})

describe('moving between the dashboard and the areas', () => {
  it('opens on the dashboard', () => {
    expect(usePageStore.getState().page).toBe('dashboard')
  })

  it('opens an area by its address, and comes back to the dashboard', async () => {
    renderHook(() => usePageSync())

    pageActions.openArea('songs')
    await waitFor(() => expect(usePageStore.getState().page).toBe('area'))
    expect(globalThis.location.hash).toBe('#/songs')
    expect(useLearningStore.getState().topic).toBe('songs')

    pageActions.openDashboard()
    await waitFor(() => expect(usePageStore.getState().page).toBe('dashboard'))
  })

  it('stops a song that is playing when you leave for the dashboard', async () => {
    renderHook(() => usePageSync())
    pageActions.openArea('songs')
    await waitFor(() => expect(usePageStore.getState().page).toBe('area'))
    useSongStore.getState().setPlaying(true)

    pageActions.openDashboard()
    await waitFor(() => expect(usePageStore.getState().page).toBe('dashboard'))
    expect(useSongStore.getState().playing).toBe(false)
  })

  it('opens Songs on its chooser, and puts the chooser away on the way out', async () => {
    renderHook(() => usePageSync())

    pageActions.openArea('songs')
    await waitFor(() => expect(usePanelStore.getState().panel).toBe('library'))

    // Left open, it would be a dialog about songs over another area's staff.
    pageActions.openArea('scales')
    await waitFor(() => expect(useLearningStore.getState().topic).toBe('scales'))
    expect(usePanelStore.getState().panel).toBeNull()

    pageActions.openArea('songs')
    await waitFor(() => expect(usePanelStore.getState().panel).toBe('library'))
    pageActions.openDashboard()
    await waitFor(() => expect(usePageStore.getState().page).toBe('dashboard'))
    expect(usePanelStore.getState().panel).toBeNull()
  })

  it('opens the chooser again each time Songs is entered, with a song already open or not', async () => {
    renderHook(() => usePageSync())
    pageActions.openArea('songs')
    await waitFor(() => expect(usePanelStore.getState().panel).toBe('library'))
    usePanelStore.getState().close()

    // Asking for the area you are in is still arriving at it.
    pageActions.openArea('songs')
    await waitFor(() => expect(usePanelStore.getState().panel).toBe('library'))
  })

  it('treats an address that names no area as the dashboard', async () => {
    renderHook(() => usePageSync())
    pageActions.openArea('songs')
    await waitFor(() => expect(usePageStore.getState().page).toBe('area'))

    // Every area is open now, so the only way to miss is a name that is not one.
    globalThis.location.hash = '#/etudes'
    await waitFor(() => expect(usePageStore.getState().page).toBe('dashboard'))
  })

  it('opens Progressions on one of its types, and says which in the address', async () => {
    renderHook(() => usePageSync())

    pageActions.openArea('progressions')
    await waitFor(() => expect(useLearningStore.getState().topic).toBe('progressions'))
    // Cadences is the first type, and the only one so far.
    expect(globalThis.location.hash).toBe('#/progressions/cadences')
    expect(useLearningStore.getState().progressionType).toBe('cadences')
    expect(useLearningStore.getState().exercise?.title).toBe('C Major Cadence')
  })

  it('still opens Progressions by the address it had before it had types', async () => {
    renderHook(() => usePageSync())
    globalThis.location.hash = '#/progressions'
    await waitFor(() => expect(usePageStore.getState().page).toBe('area'))
    expect(useLearningStore.getState().topic).toBe('progressions')
    expect(useLearningStore.getState().progressionType).toBe('cadences')
  })

  it('opens Progressions on the type it was left on when the address names none it knows', async () => {
    renderHook(() => usePageSync())
    globalThis.location.hash = '#/progressions/turnarounds'
    await waitFor(() => expect(usePageStore.getState().page).toBe('area'))
    expect(useLearningStore.getState().topic).toBe('progressions')
    expect(useLearningStore.getState().progressionType).toBe('cadences')
  })

  it('opens Exercises, the last area to get its builder', async () => {
    renderHook(() => usePageSync())
    globalThis.location.hash = '#/exercises'
    await waitFor(() => expect(usePageStore.getState().page).toBe('area'))
    expect(useLearningStore.getState().topic).toBe('exercises')
  })
})

describe('the run meter', () => {
  it('reports its progress as a progress bar, one segment per note', () => {
    const { container } = render(<RunMeter done={6} total={15} label="the scale" />)
    const bar = screen.getByRole('progressbar', { name: 'Progress through the scale' })
    expect(bar.getAttribute('aria-valuenow')).toBe('6')
    expect(bar.getAttribute('aria-valuemax')).toBe('15')
    expect(bar.style.getPropertyValue('--fill')).toBe('40%')
    const segments = container.querySelector<HTMLElement>('.run-meter__segments')
    expect(segments?.style.getPropertyValue('--segments')).toBe('15')
    expect(container.textContent).toContain('6/15')
  })

  it('keeps count of mistakes after the bar, and says nothing when there are none', () => {
    const { rerender } = render(<RunMeter done={2} total={15} label="the scale" />)
    expect(screen.queryByLabelText(/mistake/)).toBeNull()
    rerender(<RunMeter done={2} total={15} mistakes={1} label="the scale" />)
    expect(screen.getByLabelText('1 mistake').getAttribute('title')).toBe('1 mistake')
  })

  it('drops the segments on a run too long for them to read', () => {
    const { container } = render(<RunMeter done={10} total={240} label="the song" />)
    expect(container.querySelector('.run-meter__segments')).toBeNull()
  })
})
