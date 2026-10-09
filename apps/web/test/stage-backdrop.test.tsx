import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StageBackdrop } from '@/components/StageBackdrop'
import { BACKDROPS, useBackdropStore } from '@/state/backdrop-store'

/**
 * The film behind the music.
 *
 * What is pinned is what makes it a backdrop and not a video player: it is not
 * there at all until asked for, it can never make a sound or take a click or a
 * tab stop, and it holds still for someone who has asked for less motion.
 */

const film = () => document.querySelector<HTMLVideoElement>('video.stage__backdrop')
const play = vi.fn(() => Promise.resolve())
const pause = vi.fn()

/** The system's "reduce motion" setting, as the page would read it. */
function reducedMotion(on: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: on && query.includes('reduce'), media: query })),
  )
}

beforeEach(() => {
  // jsdom has the element and not the player.
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(pause)
  reducedMotion(false)
})

afterEach(() => {
  cleanup()
  useBackdropStore.getState().setBackdrop('none')
  localStorage.clear()
  play.mockClear()
  pause.mockClear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('the background video', () => {
  it('starts with the fireplace on offer, and nothing playing', () => {
    expect(BACKDROPS.map((backdrop) => backdrop.label)).toEqual(['Fireplace'])
    expect(useBackdropStore.getState().backdrop).toBe('none')
    render(<StageBackdrop />)
    expect(film()).toBeNull()
  })

  it('plays the film chosen: silent, on a loop, and out of everyone’s way', () => {
    useBackdropStore.getState().setBackdrop('fireplace')
    render(<StageBackdrop />)

    const video = film()!
    expect(video.getAttribute('src')).toMatch(/backdrops\/fireplace\.mp4$/)
    expect(video.muted).toBe(true)
    expect(video.loop).toBe(true)
    expect(video.getAttribute('aria-hidden')).toBe('true')
    expect(video.tabIndex).toBe(-1)
    expect(video.controls).toBe(false)
    expect(play).toHaveBeenCalled()
  })

  it('holds still for someone who has asked for less motion', () => {
    reducedMotion(true)
    useBackdropStore.getState().setBackdrop('fireplace')
    render(<StageBackdrop />)

    expect(film()).not.toBeNull()
    expect(play).not.toHaveBeenCalled()
    expect(pause).toHaveBeenCalled()
  })

  it('goes when it is turned off, and is remembered when it is on', () => {
    useBackdropStore.getState().setBackdrop('fireplace')
    const { rerender } = render(<StageBackdrop />)
    expect(localStorage.getItem('sonara.backdrop')).toBe('fireplace')

    useBackdropStore.getState().setBackdrop('none')
    rerender(<StageBackdrop />)
    expect(film()).toBeNull()
    expect(localStorage.getItem('sonara.backdrop')).toBe('none')
  })
})
