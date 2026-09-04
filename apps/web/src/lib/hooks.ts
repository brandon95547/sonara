import * as React from 'react'

/** Tracks an element's width. Used by the keyboard to choose how many keys fit. */
export function useElementWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = React.useRef<T>(null)
  const [width, setWidth] = React.useState(0)

  React.useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    // ResizeObserver rather than a window resize listener: the keyboard's
    // container also changes width when a side panel opens, which a window
    // listener never hears about.
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(element)
    setWidth(element.getBoundingClientRect().width)
    return () => observer.disconnect()
  }, [])

  return [ref, width]
}

/**
 * True when the primary input is a finger.
 *
 * Keyed to the pointer, never to the viewport: a 1180px tablet is touch and a
 * 700px browser window is not, so width is the wrong question — the UI Bible's
 * rule, and it decides how wide a key has to be to be playable.
 */
export function useCoarsePointer(): boolean {
  return useMediaQuery('(pointer: coarse)')
}

export function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** Closes an overlay on Escape and on a click outside every given element. */
export function useDismissable(
  open: boolean,
  onDismiss: () => void,
  refs: readonly React.RefObject<HTMLElement | null>[],
) {
  React.useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss()
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (refs.some((ref) => ref.current?.contains(target))) return
      onDismiss()
    }

    document.addEventListener('keydown', onKeyDown)
    // Capture phase, so a click on a control that re-renders and unmounts its
    // own trigger still counts as "outside".
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onDismiss])
}
