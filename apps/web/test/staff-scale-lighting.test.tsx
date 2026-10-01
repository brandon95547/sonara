import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SCALE_SPEC, type ScaleSpec } from '@sonara/shared'
import { ScaleScore } from '@/features/staff/ScaleScore'
import { litNotes, type Watched } from '@/features/staff/score-parts'
import { useKeyboardStore } from '@/state/keyboard-store'
import { useLearningStore } from '@/state/learning-store'

class NoSize {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = NoSize as unknown as typeof ResizeObserver

afterEach(cleanup)

/**
 * Which written note lights when a key goes down.
 *
 * A key is a pitch, and a scale writes each pitch more than once: again on the
 * way back down, and — with both hands, an octave apart — again on the other
 * staff, an octave of steps along, where the left hand reaches the keys the
 * right hand started on. Every chord used to light whenever one of its pitches
 * was held, so hearing a two-octave scale with both hands lit six noteheads
 * for the two notes sounding: the right hand's note on the top staff, the same
 * note on the bottom staff seven steps later, and both of those again on the
 * way down.
 *
 * Nothing about it was visible to a test of one hand, where the worst a pitch
 * could do was light twice, and neither was wrong.
 */

const store = () => useLearningStore.getState()
const keys = () => useKeyboardStore.getState()

function open(spec: Partial<ScaleSpec>, mode: 'explore' | 'learn' = 'learn') {
  store().setTopic('scales')
  store().updateSpec({
    ...DEFAULT_SCALE_SPEC,
    motion: 'similar',
    octaves: 2,
    // Up and back, so every pitch but the top one is written twice a hand.
    direction: 'up-down',
    ...spec,
  })
  store().setMode(mode)
  store().reset()
  store().setDemoStep(null)
  return render(<ScaleScore />)
}

/** Which steps have a lit notehead, and how many each: `{ 0: 2 }`. */
function lit(container: HTMLElement): Record<number, number> {
  const found: Record<number, number> = {}
  container.querySelectorAll('.staff__step').forEach((step, index) => {
    const count = step.querySelectorAll('.staff__note[data-sounding="true"]').length
    if (count > 0) found[index] = count
  })
  return found
}

const hold = (notes: readonly number[]) =>
  act(() => {
    for (const note of notes) keys().noteOn(note, 80, 'pointer')
  })
const release = (notes: readonly number[]) =>
  act(() => {
    for (const note of notes) keys().noteOff(note)
  })

beforeEach(() => keys().panic())

describe.each(['similar', 'contrary', 'third', 'sixth'] as const)(
  'hearing a scale with both hands, in %s motion',
  (motion) => {
    it('lights the step being sounded and no other writing of its notes', () => {
      const { container } = open({ hand: 'both', motion })
      const steps = store().exercise!.steps

      for (const [index, step] of steps.entries()) {
        // What the demonstration does on each beat: move the head, sound the step.
        act(() => store().setDemoStep(index))
        hold(step.notes)
        expect(lit(container), `step ${index}`).toEqual({ [index]: step.notes.length })
        release(step.notes)
      }
      expect(lit(container)).toEqual({})
    })
  },
)

describe('playing a two-handed scale by hand', () => {
  it('lights a note on the step the run has reached, not where the other hand writes it', () => {
    const { container } = open({ hand: 'both' })
    act(() => store().start())

    // The right hand's first note alone. The left hand reaches the same key an
    // octave of steps later, and that one is not being played.
    const right = store().exercise!.steps[0]!.notes[1]!
    hold([right])
    expect(lit(container)).toEqual({ 0: 1 })
  })

  it('finds the step from the keys when nobody has started anything', () => {
    const { container } = open({ hand: 'both' }, 'explore')
    const steps = store().exercise!.steps

    // Both hands on the eighth step. Each of its keys is also half of another
    // step — the left hand's is the right hand's first — and only this one, and
    // the same notes on the way back down, has all of itself held.
    hold(steps[7]!.notes)
    expect(lit(container)).toEqual({ 7: 2, [steps.length - 1 - 7]: 2 })
  })
})

describe('playing a one-handed scale by hand', () => {
  it('still lights the note wherever it is written', () => {
    const { container } = open({ hand: 'right' }, 'explore')
    const steps = store().exercise!.steps

    // Up and back: nothing says which of the two the player means.
    hold(steps[3]!.notes)
    expect(lit(container)).toEqual({ 3: 1, [steps.length - 1 - 3]: 1 })
  })
})

describe('which writing of a held pitch lights', () => {
  const down =
    (...held: number[]) =>
    (note: number) =>
      held.includes(note)

  it('is the one nearest the place, before the fuller chord', () => {
    // A chord arrives from a MIDI keyboard a note at a time. Its first note
    // must not light a later bar that happens to be that note on its own.
    const target: Watched = { index: 4, notes: [60, 64, 67] }
    const later: Watched = { index: 5, notes: [60] }
    const watched = [target, later]

    expect(litNotes(target, watched, 4, down(60))).toEqual([60])
    expect(litNotes(later, watched, 4, down(60))).toEqual([])
  })

  it('is the fuller chord where two are equally near', () => {
    const before: Watched = { index: 3, notes: [48, 60] }
    const after: Watched = { index: 5, notes: [60, 72] }
    const watched = [before, after]

    expect(litNotes(before, watched, 4, down(48, 60))).toEqual([48, 60])
    expect(litNotes(after, watched, 4, down(48, 60))).toEqual([])
  })

  it('is every one of them when nothing tells them apart', () => {
    const up: Watched = { index: 2, notes: [64] }
    const back: Watched = { index: 12, notes: [64] }
    const watched = [up, back]

    expect(litNotes(up, watched, -1, down(64))).toEqual([64])
    expect(litNotes(back, watched, -1, down(64))).toEqual([64])
  })
})
