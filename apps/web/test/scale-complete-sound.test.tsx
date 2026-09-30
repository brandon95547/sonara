import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SCALE_SPEC } from '@sonara/shared'

/**
 * A finished run is answered with a sound, once, on the note that finishes it.
 *
 * Kept apart from the sound-effects tests because the effects are mocked here:
 * this pins when the cue fires, not how it plays.
 */

describe('finishing a scale', () => {
  const effects = vi.hoisted(() => ({ play: vi.fn(), stop: vi.fn() }))
  vi.mock('@/audio/sound-effects', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/audio/sound-effects')>()),
    playSoundEffect: effects.play,
    stopSoundEffect: effects.stop,
  }))

  beforeEach(() => {
    effects.play.mockClear()
    effects.stop.mockClear()
  })
  afterEach(cleanup)

  it('plays the success sound once, on the note that completes the run', async () => {
    const { useLearningStore } = await import('@/state/learning-store')
    const { ScaleEngine } = await import('@/features/learning/ScaleControls')
    const store = () => useLearningStore.getState()
    act(() => {
      store().setTopic('scales')
      store().updateSpec({ ...DEFAULT_SCALE_SPEC, octaves: 1 })
      store().setMode('learn')
    })
    render(<ScaleEngine />)

    act(() => store().start())
    const steps = store().exercise!.steps
    for (const step of steps.slice(0, -1)) act(() => store().noteOn(step.notes[0]!))
    expect(effects.play).not.toHaveBeenCalled()

    act(() => store().noteOn(steps.at(-1)!.notes[0]!))
    expect(store().session.status).toBe('complete')
    expect(effects.play).toHaveBeenCalledExactlyOnceWith('success')

    // Going again fades out what is left of it.
    act(() => store().start())
    expect(effects.stop).toHaveBeenCalledWith('success')
  })
})
