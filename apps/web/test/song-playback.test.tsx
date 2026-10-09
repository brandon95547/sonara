import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildSong, type SongNote } from '@sonara/shared'
import { useSongStore } from '@/state/song-store'

/**
 * A song playing itself.
 *
 * What is pinned is when each note is struck and when it is let go, because
 * both were once wrong in ways nothing on screen showed. A note repeated the
 * moment the last one ended was released by the earlier note's timer and never
 * sounded, and every note was struck by the next look of a clock that looks
 * forty times a second, so no two were late by the same amount.
 */

const audio = { noteOn: vi.fn(), noteOff: vi.fn() }
vi.mock('@/audio/AudioProvider', () => ({ useAudio: () => audio }))

const note = (pitch: number, startMs: number, durationMs: number): SongNote => ({
  note: pitch,
  velocity: 90,
  startMs,
  durationMs,
  hand: 'right',
  role: 'keyboard',
})

const play = async (notes: SongNote[]) => {
  const song = buildSong({
    id: 'played',
    title: 'Played',
    bpm: 120,
    beatsPerMeasure: 4,
    notes,
    source: 'midi',
    handsInferred: false,
  })
  const { useSongPlayback } = await import('@/features/songs/use-song-playback')
  useSongStore.setState({ library: [song], currentId: song.id, positionMs: 0, tempoScale: 1 })
  renderHook(() => useSongPlayback(song))
  act(() => useSongStore.getState().setPlaying(true))
  return performance.now()
}

/** When each call to a spy was made, in milliseconds after `since`. */
const times = (spy: ReturnType<typeof vi.fn>, at: number[]) => spy.mock.calls.map((_, i) => at[i])

beforeEach(() => {
  vi.useFakeTimers()
  audio.noteOn.mockClear()
  audio.noteOff.mockClear()
})

afterEach(() => {
  act(() => useSongStore.getState().setPlaying(false))
  cleanup()
  vi.useRealTimers()
})

describe('a song playing itself', () => {
  it('strikes each note when it is due, not on the next look of the clock', async () => {
    const struck: number[] = []
    const start = await play([note(60, 110, 100), note(62, 260, 100), note(64, 410, 100)])
    audio.noteOn.mockImplementation(() => struck.push(performance.now() - start))

    act(() => vi.advanceTimersByTime(600))

    // The clock looks every 25ms, so 110, 260 and 410 all fall between looks.
    expect(times(audio.noteOn, struck)).toEqual([110, 260, 410])
  })

  it('does not let a repeated note go with the timer of the note before it', async () => {
    const events: string[] = []
    // The same key twice, the second struck the moment the first is due to end.
    const start = await play([note(60, 100, 200), note(60, 300, 200)])
    const at = () => Math.round(performance.now() - start)
    audio.noteOn.mockImplementation(() => events.push(`on ${at()}`))
    audio.noteOff.mockImplementation(() => events.push(`off ${at()}`))

    act(() => vi.advanceTimersByTime(700))

    // Struck, struck again — let go first so the instrument hears a new note —
    // and released once, by the second strike, when the second note ends.
    expect(events).toEqual(['on 100', 'off 300', 'on 300', 'off 500'])
  })

  it('holds a key struck again while it is still down until the later note ends', async () => {
    const released: number[] = []
    const start = await play([note(60, 100, 400), note(60, 200, 400)])
    audio.noteOff.mockImplementation(() => released.push(Math.round(performance.now() - start)))

    act(() => vi.advanceTimersByTime(800))

    // Let go at 200 to be struck again, and then not until 600. The first
    // note's own ending, at 500, is no longer anybody's to act on.
    expect(released).toEqual([200, 600])
  })
})
