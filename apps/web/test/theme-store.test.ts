import { afterEach, describe, expect, it, vi } from 'vitest'
import { COLOR_THEMES, useThemeStore } from '@/state/theme-store'

/**
 * The color theme lives on the document, where the stylesheet acts on it.
 *
 * Two things are pinned: that choosing a theme is what marks the page, and
 * that Peaceful — the violet the tokens already are — is the absence of a
 * mark rather than a third set of overrides to keep in step with them.
 */

const root = document.documentElement
const theme = () => useThemeStore.getState()

afterEach(() => {
  theme().setTheme('peaceful')
  localStorage.clear()
})

describe('the color theme', () => {
  it('offers Peaceful, Powerful and Mysterious, in that order', () => {
    expect(COLOR_THEMES.map((option) => option.label)).toEqual([
      'Peaceful',
      'Powerful',
      'Mysterious',
    ])
  })

  it('starts on Peaceful, with nothing on the page to say so', () => {
    expect(theme().theme).toBe('peaceful')
    expect(root.dataset.colorTheme).toBeUndefined()
  })

  it('marks the page with the theme chosen, and unmarks it going back', () => {
    theme().setTheme('powerful')
    expect(root.dataset.colorTheme).toBe('powerful')
    theme().setTheme('mysterious')
    expect(root.dataset.colorTheme).toBe('mysterious')
    theme().setTheme('peaceful')
    expect(root.dataset.colorTheme).toBeUndefined()
  })

  it('is the theme the page comes back in', async () => {
    theme().setTheme('powerful')
    expect(localStorage.getItem('sonara.color-theme')).toBe('powerful')

    // A reload: the module read fresh, the page not yet marked.
    delete root.dataset.colorTheme
    vi.resetModules()
    const reloaded = await import('@/state/theme-store')
    expect(reloaded.useThemeStore.getState().theme).toBe('powerful')
    expect(root.dataset.colorTheme).toBe('powerful')
  })

  it('falls back to Peaceful for a stored value it does not know', async () => {
    localStorage.setItem('sonara.color-theme', 'sepia')
    vi.resetModules()
    const reloaded = await import('@/state/theme-store')
    expect(reloaded.useThemeStore.getState().theme).toBe('peaceful')
  })
})
