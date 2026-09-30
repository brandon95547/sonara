import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SCALE_SPEC, staffFor } from '@sonara/shared'
import { useLearningStore } from '@/state/learning-store'
import { STAFF_BANDS, STAFF_START } from '@/features/staff/staff-frame'

/**
 * The Scales tab writes the scale out.
 *
 * It used to draw only what was sounding, so the staff stood empty until a key
 * went down and a player never saw the scale as it is printed. These pin what
 * the page must say: every note of the exercise, in its own key and spelling,
 * on its own hand's staff, with the reading states following the same position
 * the keyboard does.
 */

/** The key signature each drawn view was given — the one thing a flat key changes up front. */
const signatures: number[] = []

vi.mock('@/features/staff/StaffNotes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/staff/StaffNotes')>()
  return {
    ...actual,
    KeySignature: (props: Parameters<typeof actual.KeySignature>[0]) => {
      signatures.push(props.fifths)
      return actual.KeySignature(props)
    },
  }
})

// jsdom lays nothing out; the views measure their panel before they draw.
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

const { ScaleScore, scaleSteps } = await import('@/features/staff/ScaleScore')

const store = () => useLearningStore.getState()
const drawnSteps = (root: HTMLElement) => [...root.querySelectorAll<SVGGElement>('.staff__step')]
const rolesOf = (root: HTMLElement) => drawnSteps(root).map((step) => step.dataset.role)
const label = (root: HTMLElement) => root.querySelector('svg.staff')?.getAttribute('aria-label')

beforeEach(() => {
  signatures.length = 0
  useLearningStore.setState({ autoTempo: false })
  store().setTopic('scales')
  store().updateSpec(DEFAULT_SCALE_SPEC)
  store().setMode('learn')
})
afterEach(cleanup)

describe('the scale on the staff', () => {
  it('writes out every note of the exercise, before anything is played', () => {
    const { container } = render(<ScaleScore />)
    // A natural minor, right hand, two octaves up: fifteen notes.
    expect(drawnSteps(container)).toHaveLength(store().exercise!.steps.length)
    expect(drawnSteps(container)).toHaveLength(15)
    expect(label(container)).toContain('A B C D E F G A B C D E F G A')
  })

  it('marks your place the way the keyboard does, and moves with you', () => {
    const { container } = render(<ScaleScore />)
    expect(rolesOf(container).slice(0, 3)).toEqual(['target', 'upcoming', 'upcoming'])
    // The notes carry your place; the playhead line waits for interactive playback.
    expect(container.querySelector('.staff__playhead')).toBeNull()

    act(() => {
      store().start()
      store().noteOn(store().exercise!.steps[0]!.notes[0]!)
    })
    expect(rolesOf(container).slice(0, 3)).toEqual(['played', 'target', 'upcoming'])
  })

  it('in Explore, writes the whole scale plainly and claims no place in it', () => {
    act(() => store().setMode('explore'))
    const { container } = render(<ScaleScore />)
    expect(new Set(rolesOf(container))).toEqual(new Set(['ahead']))
    expect(container.querySelector('.staff__playhead')).toBeNull()
  })

  it('writes it in its own key, spelled the way that key spells it', () => {
    act(() => store().updateSpec({ rootPitchClass: 3, scaleTypeId: 'major' }))
    const { container } = render(<ScaleScore />)
    // E♭ major: three flats up front, and A♭ rather than G♯ in the notes.
    expect(signatures.at(-1)).toBe(-3)
    expect(label(container)).toContain('E♭ F G A♭ B♭ C D E♭')
  })

  it('puts a left-hand scale on the bass staff, even where it climbs past middle C', () => {
    act(() => store().updateSpec({ hand: 'left' }))
    const steps = scaleSteps(store().exercise!)
    const notes = steps.flatMap((step) => step.notes)
    expect(notes.every((note) => note.hand === 'left')).toBe(true)
    expect(notes.every((note) => staffFor(note.note, note.hand) === 'bass')).toBe(true)
  })

  it('prints the scale plainly: bar lines, but no metre, no bar numbers and no fingering', () => {
    const { container } = render(<ScaleScore />)
    expect(container.querySelector('.staff__time')).toBeNull()
    expect(container.querySelector('.staff__bar-number')).toBeNull()
    // The fingers are on the keys, where the hand is looking.
    expect(container.querySelector('.staff__finger')).toBeNull()
    expect(container.querySelectorAll('.staff__bar').length).toBeGreaterThan(0)
    // Each staff on a sheet of its own.
    expect(container.querySelectorAll('.staff-card')).toHaveLength(2)
  })

  it('lays the paper exactly under each staff, the clefs and ledger notes hanging off it', () => {
    const { container } = render(<ScaleScore />)
    const viewBox = container.querySelector('svg.staff')!.getAttribute('viewBox')!
    const [, top, , height] = viewBox.split(' ').map(Number) as [number, number, number, number]
    const scale = PANEL.height / height
    const cards = [...container.querySelectorAll<HTMLElement>('.staff-card')]
    for (const [card, staff] of [
      [cards[0]!, 'treble'],
      [cards[1]!, 'bass'],
    ] as const) {
      const band = STAFF_BANDS[staff]
      expect(parseFloat(card.style.top)).toBeCloseTo((band.top - top) * scale, 6)
      expect(parseFloat(card.style.height)).toBeCloseTo((band.bottom - band.top) * scale, 6)
      expect(parseFloat(card.style.left)).toBeCloseTo(STAFF_START * scale, 6)
    }
  })

  it('carries the recommended finger on every note, and one note to a beat', () => {
    const steps = scaleSteps(store().exercise!)
    expect(steps.every((step) => step.notes.every((note) => (note.finger ?? 0) >= 1))).toBe(true)
    const gaps = steps.slice(1).map((step, i) => step.startMs - steps[i]!.startMs)
    expect(new Set(gaps).size).toBe(1)
  })
})
