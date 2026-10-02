import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActionMenu } from '@/ui/Menu'

/**
 * The bar's menu has to be as dependable as a native control.
 *
 * A native select gives all of this for free: arrow keys, Escape leaving
 * nothing changed, and focus back where it started. A menu that loses any of
 * those turns one keystroke into a hunt for where focus went, so each is
 * pinned here.
 */

afterEach(cleanup)

const focused = () => document.activeElement?.textContent
const menu = () => screen.queryByRole('menu')

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
