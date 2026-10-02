import * as React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Compass, GraduationCap } from 'lucide-react'
import { BarTabs } from '@/ui/BarTabs'
import { TempoField } from '@/ui/TempoField'
import { OptionsButton, OptionsDrawer } from '@/components/OptionsDrawer'
import { useLearningStore } from '@/state/learning-store'
import { usePanelStore } from '@/state/panel-store'

/**
 * The bar's own controls: the tempo, the mode, and the way into the options.
 *
 * Each replaced something that opened a menu, and each has a way of going wrong
 * that a menu did not: a number field that fights the typing, tabs that take a
 * Tab press apiece, a panel that will not get out of the way. Those are what is
 * pinned here.
 */

afterEach(cleanup)

function Tempo({ onChange = vi.fn() }: { onChange?: (bpm: number) => void }) {
  const [bpm, setBpm] = React.useState(72)
  return (
    <TempoField
      value={bpm}
      min={30}
      max={208}
      onChange={(next) => {
        onChange(next)
        setBpm(next)
      }}
    />
  )
}

const field = () => screen.getByRole<HTMLInputElement>('spinbutton')

describe('the tempo', () => {
  it('moves a step for an arrow button and by one for an arrow key', () => {
    render(<Tempo />)
    fireEvent.click(screen.getByRole('button', { name: 'Faster' }))
    expect(field().value).toBe('76')
    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    expect(field().value).toBe('75')
    expect(field().getAttribute('aria-valuenow')).toBe('75')
  })

  it('takes a typed number whole, and only when it is entered', () => {
    const onChange = vi.fn()
    render(<Tempo onChange={onChange} />)
    // 120 passes through 1 and 12, both under the minimum. Clamped as it was
    // typed, the field would have answered the first keystroke with 30.
    for (const typed of ['1', '12', '120']) fireEvent.change(field(), { target: { value: typed } })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onChange).toHaveBeenCalledExactlyOnceWith(120)
  })

  it('brings a number out of range back into it when the field is left', () => {
    render(<Tempo />)
    fireEvent.change(field(), { target: { value: '999' } })
    fireEvent.blur(field())
    expect(field().value).toBe('208')
    // At the bound the arrow is off, not gone: it is what says there is a limit.
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Faster' }).disabled).toBe(true)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Slower' }).disabled).toBe(false)
  })

  it('gives up what was typed on Escape, and keeps the tempo it had', () => {
    const onChange = vi.fn()
    render(<Tempo onChange={onChange} />)
    fireEvent.change(field(), { target: { value: '45' } })
    fireEvent.keyDown(field(), { key: 'Escape' })
    expect(field().value).toBe('72')
    fireEvent.blur(field())
    expect(onChange).not.toHaveBeenCalled()
  })

  it('runs while an arrow is held, and stops when it is let go', () => {
    vi.useFakeTimers()
    try {
      render(<Tempo />)
      const slower = screen.getByRole('button', { name: 'Slower' })
      fireEvent.pointerDown(slower, { button: 0 })
      expect(field().value).toBe('68')
      act(() => void vi.advanceTimersByTime(1000))
      const held = Number(field().value)
      expect(held).toBeLessThan(60)
      fireEvent.pointerUp(slower)
      act(() => void vi.advanceTimersByTime(1000))
      expect(Number(field().value)).toBe(held)
    } finally {
      vi.useRealTimers()
    }
  })
})

function Mode({ onChange }: { onChange: (mode: string) => void }) {
  const [mode, setMode] = React.useState('explore')
  return (
    <BarTabs
      label="Mode"
      value={mode}
      onChange={(next) => {
        onChange(next)
        setMode(next)
      }}
      options={[
        { value: 'explore', label: 'Explore', icon: <Compass />, description: 'Play freely.' },
        { value: 'learn', label: 'Learn', icon: <GraduationCap /> },
      ]}
    />
  )
}

describe('the mode tabs', () => {
  it('are one group with one Tab stop, on the mode that is on', () => {
    render(<Mode onChange={vi.fn()} />)
    const tabs = screen.getAllByRole('radio')
    expect(screen.getByRole('radiogroup', { name: 'Mode' })).not.toBeNull()
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1])
    expect(tabs.map((tab) => tab.getAttribute('aria-checked'))).toEqual(['true', 'false'])
  })

  it('are named by their words at every width, and say what they do on hover', () => {
    render(<Mode onChange={vi.fn()} />)
    // The stylesheet swaps the word for the icon on a narrow bar. The word
    // stays in the tree, so the name does not depend on the width.
    expect(screen.getByRole('radio', { name: 'Explore' }).title).toBe('Explore: Play freely.')
    expect(screen.getByRole('radio', { name: 'Learn' }).title).toBe('Learn')
  })

  it('change with a press and with the arrow keys, wrapping at the ends', () => {
    const onChange = vi.fn()
    render(<Mode onChange={onChange} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Learn' }))
    expect(onChange).toHaveBeenLastCalledWith('learn')
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Learn' }), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith('explore')
  })
})

function Workspace() {
  return (
    <>
      <header className="top-bar">
        <OptionsButton />
        <button type="button">Metronome</button>
      </header>
      <OptionsDrawer />
      <main>Staff</main>
    </>
  )
}

const trigger = () => screen.getByRole('button', { name: /^Scale Options/ })
const drawer = () => screen.queryByRole('dialog', { name: 'Scale Options' })

describe('the options panel', () => {
  beforeEach(() => {
    usePanelStore.getState().close()
    useLearningStore.getState().setTopic('scales')
    useLearningStore.getState().reset()
  })

  it('opens from the bar on the options of the area that is open, and takes focus', () => {
    render(<Workspace />)
    expect(drawer()).toBeNull()
    fireEvent.click(trigger())
    expect(drawer()).not.toBeNull()
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(drawer())
    // Not a modal: the staff beside it is live, and is what a setting is tried on.
    expect(drawer()?.getAttribute('aria-modal')).toBeNull()
    for (const name of ['Key', 'Hands', 'Played in', 'Direction', 'Octaves'])
      expect(screen.queryAllByLabelText(name).length, name).toBeGreaterThan(0)
  })

  it('changes what is practised from in there, and stays open while it does', () => {
    render(<Workspace />)
    fireEvent.click(trigger())
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: '2' } })
    expect(useLearningStore.getState().spec.rootPitchClass).toBe(2)
    fireEvent.click(screen.getByRole('radio', { name: 'Both' }))
    expect(useLearningStore.getState().spec.hand).toBe('both')
    // How two hands are set against each other is asked only of two.
    expect(screen.getByRole('radiogroup', { name: 'Motion' })).not.toBeNull()
    expect(drawer()).not.toBeNull()
  })

  it('closes on Escape and gives focus back to its button', () => {
    render(<Workspace />)
    fireEvent.click(trigger())
    screen.getByLabelText<HTMLSelectElement>('Key').focus()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(drawer()).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it('stays for a press on the bar, and goes for a press on the workspace', () => {
    render(<Workspace />)
    fireEvent.click(trigger())
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Metronome' }))
    expect(drawer()).not.toBeNull()
    fireEvent.pointerDown(screen.getByText('Staff'))
    expect(drawer()).toBeNull()
  })

  it('closes from its own button, which is the one that opened it', () => {
    render(<Workspace />)
    fireEvent.click(trigger())
    fireEvent.pointerDown(trigger())
    fireEvent.click(trigger())
    expect(drawer()).toBeNull()
  })

  it('gets out of the way when a run starts: the first bars are under it', () => {
    render(<Workspace />)
    useLearningStore.getState().setMode('learn')
    fireEvent.click(trigger())
    act(() => useLearningStore.getState().start())
    expect(drawer()).toBeNull()
  })

  it('is put away when the area changes, rather than reopening on another', () => {
    render(<Workspace />)
    fireEvent.click(trigger())
    act(() => useLearningStore.getState().setTopic('chords'))
    expect(usePanelStore.getState().panel).toBeNull()
  })
})
