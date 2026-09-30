/**
 * A metronome click, made rather than sampled: no asset, no load, no failure
 * mode.
 *
 * Its own AudioContext, deliberately apart from the piano's. The click is a
 * timing aid, not part of the performance, so it must not be caught by the
 * piano's volume, recorded into a take, or silenced when the instrument
 * reloads. The sound effects share it, for the same reasons.
 */
let context: AudioContext | null = null

export function clickContext(): AudioContext | null {
  try {
    context ??= new AudioContext()
    return context
  } catch {
    return null
  }
}

/** One click, now or at `when` on the click context's clock. Accented on the bar. */
export function click(accented: boolean, when?: number) {
  try {
    const audio = clickContext()
    if (!audio) return
    const at = when ?? audio.currentTime
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()
    oscillator.frequency.value = accented ? 1600 : 1100
    gain.gain.setValueAtTime(accented ? 0.16 : 0.09, at)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05)
    oscillator.connect(gain).connect(audio.destination)
    oscillator.start(at)
    oscillator.stop(at + 0.06)
  } catch {
    // A metronome that will not start is not a reason to stop the music.
  }
}
