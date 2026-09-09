import { Chip } from '@/ui/Display'
import { useAudio } from './AudioProvider'

/**
 * What the sound is coming from, and whether it is coming at all.
 *
 * Its own module rather than a helper inside `App`, because it is shown in two
 * places: the app bar has room for it on a laptop, and below 640px the bar is
 * down to the two utilities it is allowed and this moves under the keyboard.
 * Importing it out of `App` would have made the keyboard and the app import
 * each other.
 */
export function EngineChip() {
  const { status } = useAudio()
  if (!status.instrumentId) return null

  // Browsers refuse to start audio before a gesture, so a freshly loaded page
  // is silent until the first click — including the click on a piano key,
  // which both unlocks the audio and plays the note. Saying so costs one chip
  // and is the difference between "ready when you are" and "this is broken".
  if (!status.unlocked) return <Chip tone="info">Press a key to start audio</Chip>

  if (status.loadingSamples) {
    return (
      <Chip tone="info">
        Loading{status.progress > 0 ? ` ${Math.round(status.progress * 100)}%` : ''}
      </Chip>
    )
  }
  if (status.fallbackReason) return <Chip tone="warning">Built-in voice</Chip>
  return (
    <Chip tone={status.kind === 'sampled' ? 'success' : 'neutral'}>
      {status.kind === 'sampled' ? 'Sampled' : 'Built-in voice'}
    </Chip>
  )
}
