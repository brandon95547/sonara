import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { buildSong, type SongNote } from '@sonara/shared'
import { useKeyboardStore } from '@/state/keyboard-store'

/**
 * What a key press is allowed to cost the score.
 *
 * The staff lights the notes you are actually holding, and the obvious way to
 * do that is to hand the whole score the set of sounding notes. It works, and
 * on a real piece it costs a couple of hundred milliseconds a note: every
 * chord redraws, laying itself out again, on every note-on and every note-off.
 *
 * A chord on a MIDI keyboard arrives as separate messages a few milliseconds
 * apart, so that delay lands *between* the notes. The chord came out one note
 * at a time, low to high — an arpeggio nobody asked for, from a change that
 * was only ever meant to colour some noteheads.
 *
 * This counts how much of the score redraws when a key goes down. Timing would
 * be flaky; the count is the thing that actually went wrong.
 */

/** How many chords laid themselves out — the expensive part of a redraw. */
let chordsDrawn = 0
/** How many times a view redrew at all. Its key signature is drawn once each. */
let viewsDrawn = 0

vi.mock('@/features/staff/StaffNotes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/staff/StaffNotes')>()
  return {
    ...actual,
    Chord: (props: Parameters<typeof actual.Chord>[0]) => {
      chordsDrawn++
      return actual.Chord(props)
    },
    KeySignature: (props: Parameters<typeof actual.KeySignature>[0]) => {
      viewsDrawn++
      return actual.KeySignature(props)
    },
  }
})

vi.mock('@/audio/AudioProvider', () => ({
  useAudio: () => ({ noteOn: vi.fn(), noteOff: vi.fn() }),
}))

/*
 * jsdom lays nothing out, and Sheet View cannot break lines onto a page of no
 * width — it would draw nothing at all and the test would pass for the wrong
 * reason. Both of the ways the size hook asks have to answer.
 */
const PANEL = { width: 1200, height: 190 }
class SizedObserver {
  constructor(private readonly notify: ResizeObserverCallback) {}
  observe(target: Element) {
    this.notify(
      [{ target, contentRect: PANEL } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    )
  }
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = SizedObserver as unknown as typeof ResizeObserver
Element.prototype.getBoundingClientRect = function () {
  return {
    ...PANEL,
    top: 0,
    left: 0,
    right: PANEL.width,
    bottom: PANEL.height,
    x: 0,
    y: 0,
  } as DOMRect
}

afterEach(cleanup)

/** Sixty bars, which is an ordinary song and a lot of chords. */
function bigSong() {
  const beat = 400
  const notes: SongNote[] = []
  for (let bar = 0; bar < 60; bar++) {
    const at = bar * beat * 4
    const root = [48, 53, 55, 48][bar % 4]!
    for (const [note, finger] of [
      [root - 12, 5],
      [root - 5, 3],
      [root, 1],
    ] as const)
      notes.push({
        note,
        velocity: 80,
        startMs: at,
        durationMs: beat * 2,
        hand: 'left',
        role: 'keyboard',
        finger,
      })
    for (let b = 0; b < 4; b++)
      notes.push({
        note: [64, 67, 69, 72][b]!,
        velocity: 90,
        startMs: at + b * beat,
        durationMs: beat - 30,
        hand: 'right',
        role: 'keyboard',
        finger: b + 1,
      })
  }
  return buildSong({
    id: 'big',
    title: 'Big',
    bpm: 150,
    beatsPerMeasure: 4,
    notes,
    source: 'midi',
    handsInferred: false,
  })
}

/**
 * The score as the app actually mounts it: inside something that redraws when
 * a note is played.
 *
 * The stage around the staff watches the last note, so it can follow the
 * player along the keyboard — which means it renders on every note-on. Testing
 * the score on its own hides that completely: nothing above it changes, so
 * nothing below it does either, and the expensive version passes.
 */
function Stage({ Score }: { Score: React.ComponentType }) {
  useKeyboardStore((state) => state.lastNote)
  // Written out here rather than taken as `children`, because that is what the
  // real stage does — and it matters. A child passed in is the same element
  // object every time, so React skips it whether or not anything is memoised,
  // and the version of this that cost a couple of hundred milliseconds a note
  // passed the test.
  return <Score />
}

describe.each(['flow', 'sheet'] as const)('a key press against the %s view', (staffView) => {
  const song = bigSong()

  beforeEach(async () => {
    const { useSongStore } = await import('@/state/song-store')
    useKeyboardStore.getState().panic()
    useSongStore.setState({
      library: [song],
      currentId: song.id,
      mode: 'explore',
      part: 'both',
      positionMs: 0,
      staffView,
    })
  })

  it('redraws the chords under the hands, not the whole piece', async () => {
    const { SongScore } = await import('@/features/staff/SongScore')

    const { container } = render(<Stage Score={SongScore} />)
    const total = container.querySelectorAll('.staff__step').length
    expect(total).toBeGreaterThan(100)

    chordsDrawn = 0
    viewsDrawn = 0
    act(() => useKeyboardStore.getState().noteOn(36, 90, 'midi'))
    const onPress = { chords: chordsDrawn, views: viewsDrawn }

    chordsDrawn = 0
    viewsDrawn = 0
    act(() => useKeyboardStore.getState().noteOff(36))
    const onRelease = { chords: chordsDrawn, views: viewsDrawn }

    // The playhead's own chord and the few after it, and nothing else. The
    // bound is deliberately loose — what matters is that it does not scale
    // with the length of the song.
    // The chord under the hands relights, and its neighbours in the lookahead
    // window. Not the piece. The bound is loose on purpose — what matters is
    // that it does not grow with the length of the song.
    expect(onPress.chords).toBeGreaterThan(0)
    expect(onPress.chords).toBeLessThanOrEqual(12)
    expect(onRelease.chords).toBeLessThanOrEqual(12)
    expect(onPress.chords).toBeLessThan(total / 4)

    // And the view itself does not redraw at all. The stage above it does, on
    // every note; if that carries the score along with it, every chord in the
    // piece is reconciled before the next note of the chord can be heard.
    expect(onPress.views).toBe(0)
    expect(onRelease.views).toBe(0)
  })

  it('still lights the notes being held, and only those', async () => {
    const { SongScore } = await import('@/features/staff/SongScore')

    const { container } = render(<Stage Score={SongScore} />)
    expect(container.querySelectorAll('.staff__note[data-sounding="true"]')).toHaveLength(0)

    // The first chord of the piece: C2, G2, C3.
    act(() => {
      for (const note of [36, 43, 48]) useKeyboardStore.getState().noteOn(note, 90, 'midi')
    })
    const lit = container.querySelectorAll(
      '.staff__step[data-role="target"] .staff__note[data-sounding="true"]',
    )
    expect(lit.length).toBe(3)

    act(() => {
      for (const note of [36, 43, 48]) useKeyboardStore.getState().noteOff(note)
    })
    expect(container.querySelectorAll('.staff__note[data-sounding="true"]')).toHaveLength(0)
  })
})
