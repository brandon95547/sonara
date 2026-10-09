import { beforeEach, describe, expect, it } from 'vitest'
import { PIANO_HIGHEST_NOTE, PIANO_LOWEST_NOTE } from '@sonara/shared'
import { AUTO_SPAN, useViewStore } from '@/state/view-store'

/**
 * How the keys are being looked at, held where both the keyboard and the
 * Settings drawer can reach it.
 *
 * The drawer mounts only while it is open. These settings used to be the
 * keyboard panel's own state, and would have been thrown away every time the
 * drawer closed had they moved into it — so what is pinned here is that they
 * outlive whoever set them.
 */

const initial = useViewStore.getState()
const view = () => useViewStore.getState()

beforeEach(() => useViewStore.setState(initial, true))

describe('the keyboard view', () => {
  it('starts on Auto, following the player, with the staff up', () => {
    expect(view().spanId).toBe(AUTO_SPAN)
    expect(view().follow).toBe(true)
    expect(view().showStaff).toBe(true)
  })

  it('moves the visible keys an octave at a time, keeping their number', () => {
    // From a window with an octave of piano above it. The one it starts on has
    // not: 76 keys leave five semitones to the top of an 88.
    view().setWindow({ low: 36, high: 96 })
    view().shiftOctave(1)
    expect(view().window).toEqual({ low: 48, high: 108 })
  })

  it('stops at the ends of the piano rather than showing keys it does not have', () => {
    for (let i = 0; i < 10; i++) view().shiftOctave(1)
    expect(view().window.high).toBe(PIANO_HIGHEST_NOTE)
    for (let i = 0; i < 10; i++) view().shiftOctave(-1)
    expect(view().window.low).toBe(PIANO_LOWEST_NOTE)
  })

  it('takes a new window as a value or as a change to the current one', () => {
    view().setWindow({ low: 48, high: 72 })
    expect(view().window).toEqual({ low: 48, high: 72 })
    view().setWindow((current) => ({ low: current.low + 1, high: current.high + 1 }))
    expect(view().window).toEqual({ low: 49, high: 73 })
  })

  it('keeps what the drawer set after the drawer has gone', () => {
    view().setSpanId('61')
    view().setFollow(false)
    view().setShowStaff(false)
    // Nothing here is component state: a fresh read sees the same answer.
    expect(useViewStore.getState()).toMatchObject({
      spanId: '61',
      follow: false,
      showStaff: false,
    })
  })
})
