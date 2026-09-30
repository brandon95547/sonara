import success from '@/assets/sounds/success-1.mp3'
import { clickContext } from './click'

/**
 * The app's sound effects: short cues that answer something the player did.
 *
 * Every one is fetched and decoded when the app starts, and kept as a buffer.
 * A cue has to land on its moment — the last note of a run — and decoding an
 * mp3 on demand put a noticeable gap between the note and the answer the first
 * time it was heard, which is the time anyone notices. From a buffer it starts
 * on the next audio frame.
 *
 * On the click's context rather than the piano's, for the click's reasons: a
 * cue is not part of the performance, so the piano's volume does not turn it
 * down and an instrument reload does not cut it off.
 *
 * Adding one is an import and a line in EFFECTS; the preload picks it up.
 */
const EFFECTS = {
  success,
} as const

export type SoundEffect = keyof typeof EFFECTS

/** Fade on an early stop, so cutting a cue short does not click. */
const STOP_FADE_S = 0.15

const buffers = new Map<SoundEffect, AudioBuffer>()
const playing = new Map<SoundEffect, { source: AudioBufferSourceNode; gain: GainNode }>()
let preloading: Promise<void> | null = null

/** Fetch and decode every effect. Safe to call again: it only ever runs once. */
export function preloadSoundEffects(): Promise<void> {
  preloading ??= (async () => {
    const audio = clickContext()
    if (!audio || typeof fetch !== 'function') return
    unlockOnGesture(audio)
    await Promise.all(
      (Object.keys(EFFECTS) as SoundEffect[]).map(async (name) => {
        try {
          const response = await fetch(EFFECTS[name])
          if (!response.ok) return
          // Decoding works on a context that is still suspended, so this does
          // not wait for the player to touch anything.
          buffers.set(name, await audio.decodeAudioData(await response.arrayBuffer()))
        } catch {
          // A cue that will not load is a silent cue, not an error in the
          // middle of practice.
        }
      }),
    )
  })()
  return preloading
}

/** Play a cue now, from the top. A cue already playing starts again rather than doubling. */
export function playSoundEffect(name: SoundEffect, volume = 0.7) {
  const audio = clickContext()
  const buffer = buffers.get(name)
  if (!audio || !buffer) return
  try {
    if (audio.state === 'suspended') void audio.resume().catch(() => {})
    stopSoundEffect(name)
    const source = audio.createBufferSource()
    const gain = audio.createGain()
    source.buffer = buffer
    gain.gain.value = volume
    source.connect(gain).connect(audio.destination)
    source.onended = () => {
      if (playing.get(name)?.source === source) playing.delete(name)
    }
    source.start()
    playing.set(name, { source, gain })
  } catch {
    // Same as a cue that did not load: silence.
  }
}

/** Cut a cue short, with a quick fade. Nothing happens if it is not playing. */
export function stopSoundEffect(name: SoundEffect) {
  const audio = clickContext()
  const current = playing.get(name)
  if (!audio || !current) return
  playing.delete(name)
  try {
    const now = audio.currentTime
    current.gain.gain.setValueAtTime(current.gain.gain.value, now)
    current.gain.gain.linearRampToValueAtTime(0, now + STOP_FADE_S)
    current.source.stop(now + STOP_FADE_S)
  } catch {
    // Already finished on its own.
  }
}

/**
 * A context made before the player has touched the page starts suspended, and
 * only a gesture may start it. The piano listens for one on its own context;
 * this is the same for the cues', kept live because a backgrounded tab can be
 * suspended again.
 */
function unlockOnGesture(audio: AudioContext) {
  const unlock = () => {
    if (audio.state === 'suspended') void audio.resume().catch(() => {})
  }
  globalThis.addEventListener('pointerdown', unlock)
  globalThis.addEventListener('keydown', unlock)
}
