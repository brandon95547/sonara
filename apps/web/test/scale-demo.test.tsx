import { StrictMode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SCALE_SPEC } from '@sonara/shared'
import { useLearningStore } from '@/state/learning-store'
import { useKeyboardStore } from '@/state/keyboard-store'

/**
 * The demonstration is the only thing in the app that plays notes nobody
 * pressed, and it is driven by a chain of timers rather than by events. Both of
 * those make it easy to get wrong in ways the screen does not show: a pause
 * that silences the current note while the chain keeps running looks paused for
 * about a second, and then is not.
 */

const noteOn = vi.fn()
const noteOff = vi.fn()

vi.mock('@/audio/AudioProvider', () => ({
  useAudio: () => ({ noteOn, noteOff }),
}))

const { useScaleDemo } = await import('@/features/learning/use-scale-demo')

/** Rendered under StrictMode, which is how the app runs it. */
const mount = () =>
  renderHook(() => useScaleDemo(), {
    wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
  })

/** The notes the demo has sounded so far, in order. */
const sounded = () => noteOn.mock.calls.map(([note]) => note as number)
const litKeys = () => Object.keys(useKeyboardStore.getState().active).map(Number)

beforeEach(() => {
  vi.useFakeTimers()
  noteOn.mockClear()
  noteOff.mockClear()
  useKeyboardStore.getState().panic()
  useLearningStore.getState().setTopic('scales')
  useLearningStore.getState().updateSpec(DEFAULT_SCALE_SPEC)
  // The demonstration follows the tempo control, so every test pins it: a beat
  // a second makes the arithmetic below readable.
  useLearningStore.getState().setTargetBpm(60)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('scale demo', () => {
  it('walks the exercise in order, one note at a time', () => {
    const { result } = mount()
    act(() => result.current.toggle())

    expect(sounded()).toEqual([useLearningStore.getState().exercise!.notes[0]])

    act(() => void vi.advanceTimersByTime(3000))
    expect(sounded()).toEqual(useLearningStore.getState().exercise!.notes.slice(0, 4))
  })

  it('plays one note per beat at the tempo that is set', () => {
    // The regression: it ran at a fixed 66 whatever the tempo control said.
    for (const [bpm, expected] of [
      [60, 4],
      [120, 8],
      [30, 2],
    ] as const) {
      noteOn.mockClear()
      useLearningStore.getState().setTargetBpm(bpm)
      const { result, unmount } = mount()
      act(() => result.current.toggle())
      // Just short of four seconds, so a note landing exactly on the boundary
      // cannot make the count depend on timer ordering.
      act(() => void vi.advanceTimersByTime(3990))
      expect(sounded().length).toBe(expected)
      unmount()
    }
  })

  it('picks up a tempo change at the next note, without restarting', () => {
    const { result } = mount()
    act(() => result.current.toggle())
    act(() => void vi.advanceTimersByTime(2500))
    expect(sounded().length).toBe(3)

    // Mid-note: the note in flight keeps its length, the ones after are faster.
    act(() => useLearningStore.getState().setTargetBpm(120))
    act(() => void vi.advanceTimersByTime(400))
    expect(sounded().length).toBe(3)
    act(() => void vi.advanceTimersByTime(1090))
    expect(sounded().length).toBe(5)

    // It carried on up the scale rather than going back to the first note.
    expect(sounded()).toEqual(useLearningStore.getState().exercise!.notes.slice(0, 5))
    expect(result.current.status).toBe('playing')
  })

  it('stops dead when paused, and does not creep forward', () => {
    const { result } = mount()
    act(() => result.current.toggle())
    act(() => void vi.advanceTimersByTime(2000))

    const beforePause = sounded().length
    act(() => result.current.toggle())
    expect(result.current.status).toBe('paused')

    // The note that was sounding is released, and the keyboard goes dark.
    expect(litKeys()).toEqual([])

    // This is the regression: scheduling playback from inside a state updater
    // made StrictMode start a second, untracked timer chain that pausing could
    // not reach, so the scale carried on playing under a paused button.
    act(() => void vi.advanceTimersByTime(5000))
    expect(sounded().length).toBe(beforePause)
    expect(litKeys()).toEqual([])
  })

  it('resumes from where it paused rather than restarting', () => {
    const { result } = mount()
    act(() => result.current.toggle())
    act(() => void vi.advanceTimersByTime(2000))
    act(() => result.current.toggle())

    const atPause = result.current.stepIndex
    expect(atPause).toBeGreaterThan(0)

    act(() => result.current.toggle())
    expect(result.current.status).toBe('playing')
    expect(result.current.stepIndex).toBe(atPause)
  })

  it('plays staccato octaves short, and both notes of each', () => {
    useLearningStore.getState().updateSpec({ texture: 'staccato-octaves', octaves: 1 })
    const { result } = mount()
    act(() => result.current.toggle())
    const first = useLearningStore.getState().exercise!.steps[0]!.notes
    expect(sounded()).toEqual([...first])
    expect(litKeys().sort()).toEqual([...first].sort())

    // At 60 BPM a note lasts a second. Legato holds most of it; staccato has
    // let go by the half-way mark.
    act(() => void vi.advanceTimersByTime(500))
    expect(litKeys()).toEqual([])

    // The same scale in single notes is still sounding at that point.
    act(() => result.current.stop())
    act(() => useLearningStore.getState().updateSpec({ texture: 'single' }))
    act(() => result.current.toggle())
    act(() => void vi.advanceTimersByTime(500))
    expect(litKeys()).toHaveLength(1)
  })

  it('never reports the demonstration as notes the player performed', () => {
    const before = useLearningStore.getState().session
    const { result } = mount()
    act(() => result.current.toggle())
    act(() => void vi.advanceTimersByTime(3000))
    expect(useLearningStore.getState().session).toBe(before)
  })

  it('releases every note it is holding when it stops', () => {
    const { result } = mount()
    act(() => result.current.toggle())
    act(() => void vi.advanceTimersByTime(1200))
    act(() => result.current.stop())

    expect(result.current.status).toBe('idle')
    expect(result.current.stepIndex).toBe(0)
    expect(litKeys()).toEqual([])
  })
})

describe('scale demo guidance', () => {
  it('moves the guidance onto the note it is sounding', () => {
    useLearningStore.getState().setMode('learn')
    const { result } = mount()
    const steps = useLearningStore.getState().exercise!.steps

    act(() => result.current.toggle())
    // The demonstration's head, not the player's, is what guidance follows.
    expect(useLearningStore.getState().demoStepIndex).toBe(0)
    expect(useLearningStore.getState().session.stepIndex).toBe(0)

    act(() => void vi.advanceTimersByTime(2000))
    const at = useLearningStore.getState().demoStepIndex!
    expect(at).toBeGreaterThan(0)

    // The key it is playing is the target, and carries that step's finger.
    const note = steps[at]!.notes[0]!
    const annotation = useLearningStore.getState().annotations[note]
    expect(annotation?.role).toBe('target')
    expect(annotation?.finger).toBe(steps[at]!.fingers[0]!.finger)
  })

  it('hands the guidance back when it stops', () => {
    const { result } = mount()
    act(() => result.current.toggle())
    act(() => void vi.advanceTimersByTime(2000))
    act(() => result.current.stop())

    expect(useLearningStore.getState().demoStepIndex).toBeNull()
    const first = useLearningStore.getState().exercise!.steps[0]!.notes[0]!
    expect(useLearningStore.getState().annotations[first]?.role).toBe('target')
  })

  it('gives way when a real run starts', () => {
    const { result } = mount()
    act(() => result.current.toggle())
    act(() => void vi.advanceTimersByTime(1500))
    expect(result.current.status).toBe('playing')

    act(() => useLearningStore.getState().start())
    expect(useLearningStore.getState().demoStepIndex).toBeNull()
    expect(result.current.status).toBe('idle')

    // And nothing keeps sounding underneath the run.
    const before = sounded().length
    act(() => void vi.advanceTimersByTime(3000))
    expect(sounded().length).toBe(before)
  })
})

describe('scale demo, where a step is not a beat', () => {
  it('plays four notes to the beat when the scale is in semiquavers', () => {
    useLearningStore.getState().updateSpec({ notesPerBeat: 4 })
    const { result } = mount()
    act(() => result.current.toggle())
    // 60 BPM: a beat a second, so a note every quarter of one.
    act(() => void vi.advanceTimersByTime(990))
    expect(sounded().length).toBe(4)
    act(() => void vi.advanceTimersByTime(1000))
    expect(sounded().length).toBe(8)
    useLearningStore.getState().updateSpec({ notesPerBeat: undefined })
  })

  it('keeps to the beat rather than drifting later with every note', () => {
    useLearningStore.getState().updateSpec({ notesPerBeat: 4, octaves: 2, direction: 'up-down' })
    const { result } = mount()
    act(() => result.current.toggle())
    // 28 semiquavers are exactly seven beats: the 29th note is due at 7000ms,
    // not at 7000ms plus however late 28 timers each were.
    act(() => void vi.advanceTimersByTime(6990))
    expect(sounded().length).toBe(28)
    act(() => void vi.advanceTimersByTime(20))
    expect(sounded().length).toBe(29)
    useLearningStore.getState().updateSpec({ notesPerBeat: undefined, direction: 'up' })
  })

  it('starts the click again from beat one, and comes in with it', () => {
    useLearningStore.getState().setMetronome(true)
    const before = useLearningStore.getState().pulseEpoch
    const { result } = mount()
    act(() => result.current.toggle())
    expect(useLearningStore.getState().pulseEpoch).toBe(before + 1)
    // The click's first beat is a twentieth of a second out, and so is the note.
    expect(sounded().length).toBe(0)
    act(() => void vi.advanceTimersByTime(60))
    expect(sounded().length).toBe(1)
    useLearningStore.getState().setMetronome(false)
  })

  it('leaves the click alone when it is off', () => {
    const before = useLearningStore.getState().pulseEpoch
    const { result } = mount()
    act(() => result.current.toggle())
    expect(useLearningStore.getState().pulseEpoch).toBe(before)
    expect(sounded().length).toBe(1)
  })
})
