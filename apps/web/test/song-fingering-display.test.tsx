import { act, cleanup, render, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildSong, type SongNote } from '@sonara/shared'
import { useLearningStore } from '@/state/learning-store'
import { useSongStore } from '@/state/song-store'
import { useKeyboardStore } from '@/state/keyboard-store'

vi.mock('@/audio/AudioProvider', () => ({
  useAudio: () => ({ noteOn: vi.fn(), noteOff: vi.fn() }),
}))

// This project runs vitest with `globals: false`, so testing-library never gets
// to register its own cleanup and every rendered hook stays subscribed to the
// stores after its test ends. One stale subscription is enough to make a later
// test see key events meant for it — which is exactly what happened.
afterEach(cleanup)

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

/**
 * The card renders before anything is playing.
 *
 * Which is most of the time: on open, before Start, and on any step whose
 * fingering could not be worked out. Reading the first hand out of an empty
 * list threw, and threw where a user would meet it first.
 */
describe('the hand card with nothing playing', () => {
  const song = buildSong({
    id: 'q',
    title: 'q',
    bpm: 120,
    beatsPerMeasure: 4,
    notes: [
      {
        note: 60,
        velocity: 90,
        startMs: 0,
        durationMs: 400,
        hand: 'right' as const,
        role: 'keyboard' as const,
        finger: 1,
      },
    ],
    source: 'midi',
    handsInferred: false,
  })

  it('renders with no current fingers', async () => {
    useSongStore.setState({
      library: [song],
      currentId: song.id,
      mode: 'learn',
      part: 'both',
      stepIndex: 0,
      currentFingers: [],
    })
    const { SongHandCard } = await import('@/features/songs/SongHandCard')
    expect(() => render(<SongHandCard />)).not.toThrow()
  })

  it('renders with one hand playing, and with both', async () => {
    const { SongHandCard } = await import('@/features/songs/SongHandCard')
    for (const fingers of [
      [{ finger: 3, hand: 'right' as const }],
      [
        { finger: 5, hand: 'left' as const },
        { finger: 3, hand: 'left' as const },
        { finger: 1, hand: 'right' as const },
      ],
    ]) {
      useSongStore.setState({ library: [song], currentId: song.id, currentFingers: fingers })
      expect(() => render(<SongHandCard />)).not.toThrow()
    }
  })
})

/**
 * Learn should behave the same in both tabs.
 *
 * A wrong note goes red in Scales and did nothing at all in Songs, so the same
 * mode taught two different things depending on which tab you were in.
 */
describe('a wrong note in a song', () => {
  const song = buildSong({
    id: 'w',
    title: 'w',
    bpm: 120,
    beatsPerMeasure: 4,
    notes: [60, 64].map((note, i) => ({
      note,
      velocity: 90,
      startMs: i * 500,
      durationMs: 400,
      hand: 'right' as const,
      role: 'keyboard' as const,
      finger: 1,
    })),
    source: 'midi',
    handsInferred: false,
  })

  const press = (...notes: number[]) =>
    useKeyboardStore.setState({
      active: Object.fromEntries(notes.map((note) => [note, { velocity: 90, source: 'pointer' }])),
    } as never)

  beforeEach(() => {
    press()
    useLearningStore.setState({ topic: 'songs', songAnnotations: {} })
    useSongStore.setState({
      library: [song],
      currentId: song.id,
      mode: 'learn',
      part: 'both',
      stepIndex: 0,
      learning: true,
      wrongNotes: [],
      currentFingers: [],
    })
  })

  it('marks a key the step did not ask for', async () => {
    const { useSongLearning } = await import('@/features/songs/use-song-learning')
    renderHook(() => useSongLearning(song))

    act(() => press(62)) // the step wants 60
    expect(useSongStore.getState().wrongNotes).toEqual([62])
    expect(useLearningStore.getState().songAnnotations[62]?.role).toBe('wrong')
  })

  it('takes the mark off when the key is released', async () => {
    const { useSongLearning } = await import('@/features/songs/use-song-learning')
    renderHook(() => useSongLearning(song))

    act(() => press(62))
    act(() => press())
    expect(useSongStore.getState().wrongNotes).toEqual([])
  })

  it('does not blame a note held over from the step just finished', async () => {
    const { useSongLearning } = await import('@/features/songs/use-song-learning')
    renderHook(() => useSongLearning(song))

    // Play the first step's note and keep holding it. The step advances, and
    // 60 is not part of the next one — but it was right when it was pressed.
    act(() => press(60))
    expect(useSongStore.getState().stepIndex).toBe(1)
    expect(useSongStore.getState().wrongNotes).toEqual([])
  })
})
