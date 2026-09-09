import * as React from 'react'

/** Tracks an element's width. Used by the keyboard to choose how many keys fit. */
export interface ElementSize {
  readonly width: number
  readonly height: number
}

/**
 * Both dimensions of an element, as it is actually laid out.
 *
 * Needed wherever a drawing has to match its box rather than fit inside it: an
 * SVG whose viewBox aspect differs from its element's aspect gets letterboxed
 * by `preserveAspectRatio`, and the gap is invisible in the markup — the
 * element is full width, the picture inside it is not.
 */
export function useElementSize<T extends HTMLElement>(): [React.RefObject<T | null>, ElementSize] {
  const ref = React.useRef<T>(null)
  const [size, setSize] = React.useState<ElementSize>({ width: 0, height: 0 })

  React.useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    const measure = (width: number, height: number) =>
      setSize((current) =>
        current.width === width && current.height === height ? current : { width, height },
      )

    const observer = new ResizeObserver(([entry]) => {
      if (entry) measure(entry.contentRect.width, entry.contentRect.height)
    })
    observer.observe(element)
    const box = element.getBoundingClientRect()
    measure(box.width, box.height)
    return () => observer.disconnect()
  }, [])

  return [ref, size]
}

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
/** Everything the browser will put a focus ring on, in document order. */
const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Keeps the Tab key inside an open dialog.
 *
 * `aria-modal` tells a screen reader that the rest of the page is inert. It
 * does nothing whatever to the Tab key, so without this a keyboard user tabs
 * straight out of the dialog and into the page behind the scrim — which is
 * still visible, still clickable, and gives no sign that focus has left. The
 * trap is what makes `aria-modal` true rather than merely announced.
 *
 * Wrapping rather than blocking: Tab off the last control returns to the first,
 * which is what every native dialog does and what a screen-reader user is
 * listening for to know they have reached the end.
 */
export function useFocusTrap(open: boolean, ref: React.RefObject<HTMLElement | null>) {
  React.useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const panel = ref.current
      if (!panel) return

      // Filtered on attributes rather than on layout. `offsetParent` is the
      // usual "is it visible" trick and it is wrong twice over here: it is null
      // for anything inside a fixed-position ancestor, which is every dialog,
      // and null for everything at all in a test environment that does no
      // layout. What actually has to be skipped is what the browser would not
      // focus anyway.
      const stops = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) =>
          !element.hasAttribute('disabled') &&
          !element.closest('[hidden]') &&
          element.getAttribute('aria-hidden') !== 'true',
      )
      // A dialog with nothing to focus still must not leak: the panel itself
      // takes the focus and Tab does nothing.
      if (stops.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }

      const first = stops[0]!
      const last = stops[stops.length - 1]!
      const active = document.activeElement
      // From the panel itself, Shift+Tab goes to the end rather than out.
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, ref])
}

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
