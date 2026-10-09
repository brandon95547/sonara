import * as React from 'react'
import { backdropUrl, useBackdropStore } from '@/state/backdrop-store'

/**
 * The film behind the music.
 *
 * Nothing at all until one is chosen — no element, so nothing is fetched. Then
 * a silent loop under everything on the stage, which no pointer and no screen
 * reader ever meets.
 *
 * Someone who has asked their system for less motion gets the picture and not
 * the movement: the film is held on its first frame.
 */
export function StageBackdrop() {
  const backdrop = useBackdropStore((state) => state.backdrop)
  const ref = React.useRef<HTMLVideoElement>(null)

  React.useEffect(() => {
    const video = ref.current
    if (!video) return
    // Set here as well as in the markup: a film that is not muted when it is
    // asked to play is one the browser will not start on its own.
    video.muted = true
    const still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (still) video.pause()
    else void video.play()?.catch(() => {})
  }, [backdrop])

  if (backdrop === 'none') return null
  return (
    <video
      ref={ref}
      key={backdrop}
      className="stage__backdrop"
      src={backdropUrl(backdrop)}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      disablePictureInPicture
      aria-hidden
      tabIndex={-1}
    />
  )
}
