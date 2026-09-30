import * as React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActionMenu, SelectMenu, type MenuOption } from '@/ui/Menu'

/**
 * The bar's dropdowns have to be as dependable as the native select they
 * replaced.
 *
 * Every setting in the top bar is a button naming its value that opens its
 * choices, and a native select gave all of this for free: arrow keys, focus on
 * the current choice, Escape leaving nothing changed, and focus back where it
 * started. A dropdown that loses any of those turns one keystroke into a hunt
 * for where focus went, so each is pinned here.
 */

afterEach(cleanup)

const HANDS: MenuOption<string>[] = [
  { value: 'right', label: 'Right Hand' },
  { value: 'left', label: 'Left Hand' },
  { value: 'both', label: 'Both Hands', disabled: true },
  { value: 'alternating', label: 'Alternating' },
]

function HandSetting({ onChange }: { onChange: (value: string) => void }) {
  const [value, setValue] = React.useState('right')
  return (
    <SelectMenu
      label="Hand"
      value={value}
      options={HANDS}
      onChange={(next) => {
        onChange(next)
        setValue(next)
      }}
    />
  )
}

const trigger = () => screen.getByRole('button', { name: /^Hand:/ })
const focused = () => document.activeElement?.textContent
const menu = () => screen.queryByRole('menu')

describe('a setting in the bar', () => {
  it('names the setting and its value, the way a field and its label would', () => {
    render(<HandSetting onChange={vi.fn()} />)
    expect(trigger().getAttribute('aria-label')).toBe('Hand: Right Hand')
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
  })

  it('opens from the keyboard on the choice already made', () => {
    render(<HandSetting onChange={vi.fn()} />)
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' })
    expect(menu()).not.toBeNull()
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    expect(focused()).toBe('Right Hand')
  })

  it('moves with the arrows, wraps at the ends, and steps over what cannot be chosen', () => {
    render(<HandSetting onChange={vi.fn()} />)
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' })
    const press = (key: string) => fireEvent.keyDown(document.activeElement!, { key })

    press('ArrowDown')
    expect(focused()).toBe('Left Hand')
    press('ArrowDown')
    expect(focused()).toBe('Alternating')
    press('ArrowDown')
    expect(focused()).toBe('Right Hand')
    press('ArrowUp')
    expect(focused()).toBe('Alternating')
    press('Home')
    expect(focused()).toBe('Right Hand')
    press('End')
    expect(focused()).toBe('Alternating')
  })

  it('chooses, closes, and hands focus back to the setting', () => {
    const onChange = vi.fn()
    render(<HandSetting onChange={onChange} />)
    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Left Hand' }))

    expect(onChange).toHaveBeenCalledExactlyOnceWith('left')
    expect(menu()).toBeNull()
    expect(document.activeElement).toBe(trigger())
    expect(trigger().getAttribute('aria-label')).toBe('Hand: Left Hand')
  })

  it('does not report a change when the choice is the one already made', () => {
    const onChange = vi.fn()
    render(<HandSetting onChange={onChange} />)
    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Right Hand' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(menu()).toBeNull()
  })

  it('leaves on Escape with nothing changed, focus back on the setting', () => {
    const onChange = vi.fn()
    render(<HandSetting onChange={onChange} />)
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' })
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })

    expect(menu()).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(trigger())
  })

  it('closes when the player tabs away or clicks elsewhere', () => {
    render(<HandSetting onChange={vi.fn()} />)
    fireEvent.click(trigger())
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' })
    expect(menu()).toBeNull()

    fireEvent.click(trigger())
    fireEvent.pointerDown(document.body)
    expect(menu()).toBeNull()
  })
})

describe('the overflow menu', () => {
  it('opens from the keyboard on its first command, like every other menu in the bar', () => {
    render(
      <ActionMenu
        label="More"
        icon={null}
        actions={[
          { id: 'off', label: 'Unavailable', onSelect: vi.fn(), disabled: true },
          { id: 'settings', label: 'Settings', onSelect: vi.fn() },
          { id: 'devices', label: 'Keyboard & MIDI setup', onSelect: vi.fn() },
        ]}
      />,
    )
    fireEvent.keyDown(screen.getByRole('button', { name: 'More' }), { key: 'ArrowDown' })
    expect(focused()).toBe('Settings')
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(focused()).toBe('Keyboard & MIDI setup')
  })

  it('runs a command once focus is back on the trigger, so a panel it opens can take it from there', () => {
    let focusedWhenRun: Element | null = null
    const onSelect = vi.fn(() => {
      focusedWhenRun = document.activeElement
    })
    render(
      <ActionMenu
        label="More"
        icon={null}
        actions={[{ id: 'settings', label: 'Settings', onSelect }]}
      />,
    )
    const more = screen.getByRole('button', { name: 'More' })
    fireEvent.click(more)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Settings' }))

    expect(onSelect).toHaveBeenCalledOnce()
    expect(focusedWhenRun).toBe(more)
    expect(menu()).toBeNull()
  })
})
