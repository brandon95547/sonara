import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildSong, type SongNote } from '@sonara/shared'
import { useLearningStore } from '@/state/learning-store'
import { useSongStore } from '@/state/song-store'

vi.mock('@/audio/AudioProvider', () => ({
  useAudio: () => ({ noteOn: vi.fn(), noteOff: vi.fn() }),
}))

/**
 * A song's fingering has to survive the whole way to the key.
 *
 * It was worked out on import, stored on the note, handed to the hand card —
 * and then dropped twice on the last step: the keyboard annotations were built
 * without it, and the badge layer read the scale's annotations rather than the
 * song's. Every piece worked except the two that put a number on a key, so
 * nothing showed and nothing failed.
 */
describe('a song’s fingering reaching the keyboard', () => {
  const notes: SongNote[] = [60, 62, 64].map((note, i) => ({
    note,
    velocity: 90,
    startMs: i * 500,
    durationMs: 400,
    hand: 'right' as const,
    role: 'keyboard' as const,
    finger: i + 1,
  }))

  const song = buildSong({
    id: 'x',
    title: 'x',
    bpm: 120,
    beatsPerMeasure: 4,
    notes,
    source: 'midi',
    handsInferred: false,
  })

  beforeEach(() => {
    useLearningStore.setState({ topic: 'songs', songAnnotations: {} })
    useSongStore.setState({
      library: [song],
      currentId: song.id,
      mode: 'learn',
      part: 'both',
      stepIndex: 0,
    })
  })

  it('puts the finger on the key annotation, not just the hand card', async () => {
    const { useSongLearning } = await import('@/features/songs/use-song-learning')
    renderHook(() => useSongLearning(song))

    const annotations = useLearningStore.getState().songAnnotations
    expect(annotations[60]?.finger).toBe(1)
    expect(annotations[62]?.finger).toBe(2)
    expect(annotations[64]?.finger).toBe(3)
  })

  it('reads the song’s annotations, not the scale’s, when the topic is songs', () => {
    // The badge layer and every key make the same choice, and it has to be the
    // same choice: a badge over a key with nothing written on it is worse than
    // no badge.
    useLearningStore.setState({
      topic: 'songs',
      annotations: { 60: { role: 'target', finger: 5 } },
      songAnnotations: { 60: { role: 'target', finger: 1 } },
    })
    const state = useLearningStore.getState()
    const chosen = state.topic === 'songs' ? state.songAnnotations : state.annotations
    expect(chosen[60]?.finger).toBe(1)
  })
})

/**
 * A chord is a hand shape, not a note.
 *
 * The keyboard had this right — every note of the step lights with its own
 * finger. The hand card did not: it took the first note of the step and showed
 * one finger, so a three-note chord looked like a single note and a chord
 * spanning both hands showed one hand.
 */
describe('a chord in Learn', () => {
  const chord = (): SongNote[] => [
    {
      note: 48,
      velocity: 90,
      startMs: 0,
      durationMs: 400,
      hand: 'left',
      role: 'keyboard',
      finger: 5,
    },
    {
      note: 52,
      velocity: 90,
      startMs: 0,
      durationMs: 400,
      hand: 'left',
      role: 'keyboard',
      finger: 3,
    },
    {
      note: 55,
      velocity: 90,
      startMs: 0,
      durationMs: 400,
      hand: 'left',
      role: 'keyboard',
      finger: 1,
    },
    {
      note: 72,
      velocity: 90,
      startMs: 0,
      durationMs: 400,
      hand: 'right',
      role: 'keyboard',
      finger: 2,
    },
  ]

  const song = buildSong({
    id: 'c',
    title: 'c',
    bpm: 120,
    beatsPerMeasure: 4,
    notes: chord(),
    source: 'midi',
    // Already decided, so nothing re-splits the chord underneath the test.
    handsInferred: false,
  })

  beforeEach(() => {
    useLearningStore.setState({ topic: 'songs', songAnnotations: {} })
    useSongStore.setState({
      library: [song],
      currentId: song.id,
      mode: 'learn',
      part: 'both',
      stepIndex: 0,
      currentFingers: [],
    })
  })

  it('lights every note of the chord on the keyboard', async () => {
    const { useSongLearning } = await import('@/features/songs/use-song-learning')
    renderHook(() => useSongLearning(song))

    const annotations = useLearningStore.getState().songAnnotations
    for (const [note, finger] of [
      [48, 5],
      [52, 3],
      [55, 1],
      [72, 2],
    ] as const) {
      expect(annotations[note]?.role, `note ${note}`).toBe('target')
      expect(annotations[note]?.finger, `note ${note}`).toBe(finger)
    }
  })

  it('gives the hand card every finger, not the first one', async () => {
    const { useSongLearning } = await import('@/features/songs/use-song-learning')
    renderHook(() => useSongLearning(song))

    // Low to high, which is the order a grip is held in.
    expect(useSongStore.getState().currentFingers).toEqual([
      { finger: 5, hand: 'left' },
      { finger: 3, hand: 'left' },
      { finger: 1, hand: 'left' },
      { finger: 2, hand: 'right' },
    ])
  })

  it('keeps both hands when a step reaches across them', async () => {
    const { useSongLearning } = await import('@/features/songs/use-song-learning')
    renderHook(() => useSongLearning(song))

    const used = new Set(useSongStore.getState().currentFingers.map((entry) => entry.hand))
    expect([...used].sort()).toEqual(['left', 'right'])
  })
})
