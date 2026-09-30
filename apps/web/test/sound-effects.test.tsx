import { describe, expect, it, vi } from 'vitest'
import { FakeAudioContext } from './fake-audio-context'

/**
 * Sound effects are decoded before they are needed and played from memory.
 *
 * The point of the preload is that playing a cue does no I/O at all: the
 * success sound lands on the last note of a run, and a fetch at that moment is
 * a gap anyone hears. So the fetch and the decode are pinned to the preload,
 * and the play to a buffer source started on the spot.
 */

const audio = Object.assign(new FakeAudioContext(), {
  state: 'running',
  destination: {},
  resume: vi.fn(async () => {}),
  decodeAudioData: vi.fn(async () => ({ duration: 6.8 }) as unknown as AudioBuffer),
})
globalThis.AudioContext = function () {
  return audio
} as unknown as typeof AudioContext

const fetchMock = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }))
globalThis.fetch = fetchMock as unknown as typeof fetch

const { preloadSoundEffects, playSoundEffect, stopSoundEffect } =
  await import('@/audio/sound-effects')

describe('sound effects', () => {
  it('fetches and decodes every effect once, up front', async () => {
    await preloadSoundEffects()
    await preloadSoundEffects()
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(audio.decodeAudioData).toHaveBeenCalledOnce()
  })

  it('plays from the decoded buffer, with no fetch at the moment it plays', async () => {
    await preloadSoundEffects()
    fetchMock.mockClear()
    const before = audio.bufferSources.length

    playSoundEffect('success')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(audio.bufferSources.length).toBe(before + 1)
    expect(audio.bufferSources.at(-1)!.started).toBe(0)
  })

  it('starts again rather than doubling when played over itself, and fades when stopped', async () => {
    await preloadSoundEffects()
    playSoundEffect('success')
    const first = audio.bufferSources.at(-1)!
    playSoundEffect('success')
    expect(first.stopped).not.toBeNull()

    const second = audio.bufferSources.at(-1)!
    stopSoundEffect('success')
    expect(second.stopped).toBeGreaterThan(audio.currentTime)
  })
})
