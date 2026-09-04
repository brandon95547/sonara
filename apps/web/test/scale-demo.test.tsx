import { StrictMode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SCALE_SPEC } from '@sonara/shared'
import { useLearningStore } from '@/state/learning-store'
import { useKeyboardStore } from '@/state/keyboard-store'

/**
 * The demonstration is the only thing in the app that plays notes nobody
 * pressed, and it is driven by a chain of timers rather than by events. Both of
 * those make it easy to get wrong in ways the screen does not show: a pause
 * that silences the current note while the chain keeps running looks paused for
 * about a second, and then is not.
 */

const noteOn = vi.fn()
const noteOff = vi.fn()

vi.mock('@/audio/AudioProvider', () => ({
  useAudio: () => ({ noteOn, noteOff }),
}))

const { useScaleDemo } = await import('@/features/learning/use-scale-demo')

/** Rendered under StrictMode, which is how the app runs it. */
const mount = () =>
  renderHook(() => useScaleDemo(), {
    wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
  })

/** The notes the demo has sounded so far, in order. */
const sounded = () => noteOn.mock.calls.map(([note]) => note as number)
const litKeys = () => Object.keys(useKeyboardStore.getState().active).map(Number)

beforeEach(() => {
  vi.useFakeTimers()
  noteOn.mockClear()
  noteOff.mockClear()
  useKeyboardStore.getState().panic()
  useLearningStore.getState().setTopic('scales')
  useLearningStore.getState().updateSpec(DEFAULT_SCALE_SPEC)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('scale demo', () => {
  it('walks the exercise in order, one note at a time', () => {
    const { result } = mount()
    act(() => result.current.toggle())

    expect(sounded()).toEqual([useLearningStore.getState().exercise!.notes[0]])

    act(() => void vi.advanceTimersByTime(3000))
    expect(sounded()).toEqual(useLearningStore.getState().exercise!.notes.slice(0, 4))
  })

  it('plays slowly enough to follow', () => {
    const { result } = mount()
    act(() => result.current.toggle())
    // Four seconds of a demonstration should be a handful of notes, not a run.
    act(() => void vi.advanceTimersByTime(4000))
    expect(sounded().length).toBeLessThanOrEqual(6)
    expect(sounded().length).toBeGreaterThanOrEqual(4)
  })

  it('stops dead when paused, and does not creep forward', () => {
    const { result } = mount()
    act(() => result.current.toggle())
    act(() => void vi.advanceTimersByTime(2000))

    const beforePause = sounded().length
    act(() => result.current.toggle())
    expect(result.current.status).toBe('paused')

    // The note that was sounding is released, and the keyboard goes dark.
    expect(litKeys()).toEqual([])

    // This is the regression: scheduling playback from inside a state updater
    // made StrictMode start a second, untracked timer chain that pausing could
    // not reach, so the scale carried on playing under a paused button.
    act(() => void vi.advanceTimersByTime(5000))
    expect(sounded().length).toBe(beforePause)
    expect(litKeys()).toEqual([])
  })

  it('resumes from where it paused rather than restarting', () => {
    const { result } = mount()
    act(() => result.current.toggle())
    act(() => void vi.advanceTimersByTime(2000))
    act(() => result.current.toggle())

    const atPause = result.current.stepIndex
    expect(atPause).toBeGreaterThan(0)

    act(() => result.current.toggle())
    expect(result.current.status).toBe('playing')
    expect(result.current.stepIndex).toBe(atPause)
  })

  it('never reports the demonstration as notes the player performed', () => {
    const before = useLearningStore.getState().session
    const { result } = mount()
    act(() => result.current.toggle())
    act(() => void vi.advanceTimersByTime(3000))
    expect(useLearningStore.getState().session).toBe(before)
  })

  it('releases every note it is holding when it stops', () => {
    const { result } = mount()
    act(() => result.current.toggle())
    act(() => void vi.advanceTimersByTime(1200))
    act(() => result.current.stop())

    expect(result.current.status).toBe('idle')
    expect(result.current.stepIndex).toBe(0)
    expect(litKeys()).toEqual([])
  })
})
