import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeAudioContext } from './fake-audio-context'

/**
 * The metronome keeps time on the audio clock.
 *
 * A click fired from a timer is late by however long the page was busy, and
 * the page is busiest on the beat — a note played, the keys and the staff
 * redrawing. So the clicks are scheduled ahead on the clock the sound itself
 * runs on, and these pin that they land exactly a beat apart, with the bar
 * accented, whatever the timer was doing.
 */

const audio = new FakeAudioContext()
globalThis.AudioContext = function () {
  return audio
} as unknown as typeof AudioContext

const { useMetronome } = await import('@/audio/use-metronome')

function Metronome({ on, bpm }: { on: boolean; bpm: number }) {
  useMetronome(on, bpm, 4)
  return null
}

/** Runs the page and the audio clock forward together, a scheduler tick at a time. */
function play(seconds: number) {
  for (let t = 0; t < seconds; t += 0.025) {
    audio.advance(0.025)
    vi.advanceTimersByTime(25)
  }
}

const clicks = () => audio.oscillators.map((click) => click.started!)
const accents = () => audio.oscillators.map((click) => click.frequency.value === 1600)

beforeEach(() => {
  vi.useFakeTimers()
  audio.oscillators.length = 0
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('the metronome', () => {
  it('clicks a beat apart on the audio clock, with the first of each bar accented', () => {
    render(<Metronome on bpm={120} />)
    play(2)
    const times = clicks()
    expect(times.length).toBeGreaterThanOrEqual(5)
    for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBeCloseTo(0.5, 6)
    expect(accents().slice(0, 5)).toEqual([true, false, false, false, true])
  })

  it('is silent until it is switched on, and stops when it is switched off', () => {
    const { rerender } = render(<Metronome on={false} bpm={120} />)
    play(1)
    expect(clicks()).toHaveLength(0)

    rerender(<Metronome on bpm={120} />)
    play(1)
    const heard = clicks().length
    expect(heard).toBeGreaterThan(0)

    rerender(<Metronome on={false} bpm={120} />)
    play(2)
    expect(clicks()).toHaveLength(heard)
  })

  it('takes a new tempo at the next beat without starting the bar again', () => {
    const { rerender } = render(<Metronome on bpm={120} />)
    play(1.2)
    rerender(<Metronome on bpm={60} />)
    play(4)

    const times = clicks()
    const gaps = times.slice(1).map((time, i) => Number((time - times[i]!).toFixed(6)))
    // Half a second while it was 120, a whole second once it is 60, and never
    // a short beat in between where the pulse restarted.
    expect(gaps[0]).toBe(0.5)
    expect(gaps.at(-1)).toBe(1)
    expect(gaps.every((gap) => gap === 0.5 || gap === 1)).toBe(true)
    // The count carries on across the change: still one accent in four.
    const accented = accents()
    accented.forEach((accent, i) => expect(accent).toBe(i % 4 === 0))
  })
})
