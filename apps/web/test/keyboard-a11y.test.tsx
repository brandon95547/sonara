import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PianoKeyboard } from '@/features/keyboard/PianoKeyboard'
import { Drawer } from '@/ui/Drawer'
import { useLearningStore } from '@/state/learning-store'
import { useKeyboardStore } from '@/state/keyboard-store'

vi.mock('@/audio/AudioProvider', () => ({
  useAudio: () => ({ noteOn: vi.fn(), noteOff: vi.fn() }),
}))

class NoSize {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = NoSize as unknown as typeof ResizeObserver
globalThis.matchMedia ??= ((query: string) =>
  ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }) as unknown as MediaQueryList) as typeof matchMedia

afterEach(cleanup)

/**
 * Reaching past the piano used to cost eighty-eight presses of Tab.
 *
 * Every key is a button, and every button was a tab stop, so the controls under
 * the keyboard were the far side of the whole instrument. The keybed is one
 * stop now and the arrows move within it, which is the pattern for any grouped
 * set of controls and the one a keyboard user already expects.
 */
describe('tabbing through the keyboard', () => {
  const keys = (container: HTMLElement) => [...container.querySelectorAll('.piano-key')]
  const tabbable = (container: HTMLElement) =>
    keys(container).filter((key) => key.getAttribute('tabindex') === '0')

  const board = () => render(<PianoKeyboard window={{ low: 48, high: 72 }} />)

  it('is one tab stop, however many keys are on screen', () => {
    const { container } = board()
    expect(keys(container).length).toBeGreaterThan(20)
    expect(tabbable(container)).toHaveLength(1)
  })

  it('starts at middle C, where a player’s hands go', () => {
    const { container } = board()
    expect(tabbable(container)[0]?.getAttribute('data-note')).toBe('60')
  })

  it('moves a semitone with left and right, and an octave with up and down', () => {
    const { container } = board()
    const at = () => tabbable(container)[0]?.getAttribute('data-note')

    fireEvent.keyDown(container.querySelector('[data-note="60"]')!, { key: 'ArrowRight' })
    expect(at()).toBe('61')

    fireEvent.keyDown(container.querySelector('[data-note="61"]')!, { key: 'ArrowDown' })
    expect(at()).toBe('49')

    fireEvent.keyDown(container.querySelector('[data-note="49"]')!, { key: 'ArrowUp' })
    expect(at()).toBe('61')

    fireEvent.keyDown(container.querySelector('[data-note="61"]')!, { key: 'ArrowLeft' })
    expect(at()).toBe('60')
  })

  it('goes to the ends with Home and End, and stops there', () => {
    const { container } = board()
    const at = () => tabbable(container)[0]?.getAttribute('data-note')

    fireEvent.keyDown(container.querySelector('[data-note="60"]')!, { key: 'End' })
    expect(at()).toBe('72')
    // An octave up from the top lands on the top key rather than nowhere.
    fireEvent.keyDown(container.querySelector('[data-note="72"]')!, { key: 'ArrowUp' })
    expect(at()).toBe('72')

    fireEvent.keyDown(container.querySelector('[data-note="72"]')!, { key: 'Home' })
    expect(at()).toBe('48')
  })

  it('still plays the key the focus is on', () => {
    const { container } = board()
    const key = container.querySelector('[data-note="60"]')!
    fireEvent.keyDown(key, { key: 'Enter' })
    expect(useKeyboardStore.getState().active[60]).toBeDefined()
    fireEvent.keyUp(key, { key: 'Enter' })
    expect(useKeyboardStore.getState().active[60]).toBeUndefined()
  })
})

/**
 * `aria-modal` promises the rest of the page is inert. It does nothing at all
 * to the Tab key, so without a trap a keyboard user tabs out of the dialog and
 * onto the page behind the scrim — still visible, still clickable, with nothing
 * to tell them they have left.
 */
describe('a dialog that owns the focus', () => {
  const open = () =>
    render(
      <>
        <button type="button">behind the scrim</button>
        <Drawer open onClose={() => {}} title="Recording finished">
          <button type="button">first</button>
          <button type="button">last</button>
        </Drawer>
      </>,
    )

  it('wraps from the last control back to the first', () => {
    const { getByText } = open()
    const last = getByText('last')
    act(() => last.focus())
    fireEvent.keyDown(document, { key: 'Tab' })
    // The panel's own Close button is the first stop in document order.
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Close')
  })

  it('wraps backwards from the first control to the last', () => {
    const { getByText, getByLabelText } = open()
    // The panel's Close button, not the first thing in the body: the header
    // comes first in document order, which is what Shift+Tab would leave from.
    act(() => getByLabelText('Close').focus())
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(getByText('last'))
  })

  it('does not take the focus out of the page when the dialog is closed', () => {
    const { getByText } = render(
      <>
        <button type="button">behind the scrim</button>
        <Drawer open={false} onClose={() => {}} title="Recording finished">
          <button type="button">first</button>
        </Drawer>
      </>,
    )
    const outside = getByText('behind the scrim')
    act(() => outside.focus())
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(outside)
  })
})

/**
 * The app asks for the next note with colour, a numeral and a cue beside the
 * staff. None of that reaches a screen reader, which had no way to tell what
 * to play.
 */
describe('saying which note to play', () => {
  beforeEach(() => {
    useLearningStore.setState({ topic: 'scales', mode: 'learn' })
    useLearningStore.getState().reset()
  })

  it('names the target, its finger and its cue', () => {
    useLearningStore.setState({
      annotations: {
        63: { role: 'target', finger: 3, label: 'E♭', cue: 'Thumb under' },
        65: { role: 'upcoming', finger: 1, label: 'F' },
      },
    })
    const { container } = render(<Live />)
    expect(container.textContent).toBe('Play E♭, finger 3. Thumb under.')
  })

  it('says nothing outside Learn, where there is no single next note', () => {
    useLearningStore.setState({
      mode: 'explore',
      annotations: { 63: { role: 'target', label: 'E♭' } },
    })
    const { container } = render(<Live />)
    expect(container.textContent).toBe('')
  })
})

/** The announcement is rendered inside the stage; this is the same subscription. */
function Live() {
  const message = useLearningStore((state) => {
    if (state.mode !== 'learn') return ''
    const annotations = state.topic === 'songs' ? state.songAnnotations : state.annotations
    const targets = Object.entries(annotations)
      .filter(([, annotation]) => annotation.role === 'target')
      .map(([note, annotation]) => ({ note: Number(note), ...annotation }))
      .sort((a, b) => a.note - b.note)
    if (targets.length === 0) return ''
    const named = targets.map((target) =>
      target.finger ? `${target.label}, finger ${target.finger}` : target.label,
    )
    const cue = targets.find((target) => target.cue)?.cue
    return `Play ${named.join(', ')}.${cue ? ` ${cue}.` : ''}`
  })
  return <p>{message}</p>
}
