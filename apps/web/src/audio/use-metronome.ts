import * as React from 'react'
import { click, clickContext } from './click'

/** How far ahead clicks are scheduled, and how often the scheduler looks. */
const LOOKAHEAD_S = 0.12
const INTERVAL_MS = 25

/**
 * Clicks at `bpm` while `enabled`, accenting the first of every `beatsPerBar`.
 *
 * Scheduled on the audio clock, a little ahead, rather than fired from a timer.
 * A timer is late by however long the main thread was busy — and it is busiest
 * exactly when a note is played and the keyboard, the staff and the score all
 * redraw — so a timer-driven click stumbles on the very beats the player is
 * listening to it for. The audio clock does not.
 *
 * A tempo change is picked up at the next beat rather than restarting the bar,
 * so nudging the BPM while playing does not throw the pulse.
 *
 * `epoch` re-anchors it: when the number changes the click starts again from
 * the first beat of a bar, a twentieth of a second from now. That is how a
 * demonstration and the click begin together instead of wherever the click
 * happened to be.
 */
export function useMetronome(enabled: boolean, bpm: number, beatsPerBar = 4, epoch = 0) {
  const bpmRef = React.useRef(bpm)
  bpmRef.current = bpm

  React.useEffect(() => {
    if (!enabled) return
    const audio = clickContext()
    if (!audio) return
    void audio.resume?.().catch(() => {})

    let next = audio.currentTime + 0.05
    let beat = 0
    const timer = globalThis.setInterval(() => {
      while (next < audio.currentTime + LOOKAHEAD_S) {
        click(beat % beatsPerBar === 0, next)
        next += 60 / Math.max(1, bpmRef.current)
        beat += 1
      }
    }, INTERVAL_MS)
    return () => globalThis.clearInterval(timer)
  }, [enabled, beatsPerBar, epoch])
}
