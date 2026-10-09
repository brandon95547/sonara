import { readFileSync } from 'node:fs'
import path from 'node:path'
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
  it('offers Peaceful, Powerful, Mysterious and Dark Concert, in that order', () => {
    expect(COLOR_THEMES.map((option) => option.label)).toEqual([
      'Peaceful',
      'Powerful',
      'Mysterious',
      'Dark Concert',
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
    theme().setTheme('dark-concert')
    expect(root.dataset.colorTheme).toBe('dark-concert')
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

  it('shows each theme in the menu as a dot of the color its keys and buttons are', () => {
    // The dot is written beside the theme's name, and the theme's colors in
    // the stylesheet. A theme recolored in one and not the other is a menu
    // that promises a color the page does not turn.
    const styles = (name: string) =>
      readFileSync(path.join(import.meta.dirname, '..', 'src', 'styles', name), 'utf8')
    const accentIn = (css: string, selector: string) =>
      css
        .slice(css.indexOf(selector))
        .match(/--ds-accent:\s*(#[0-9a-f]{6})/i)?.[1]
        ?.toLowerCase()

    const fills: Record<string, string | undefined> = {
      // Peaceful is the tokens as they are: the dark theme's own accent.
      peaceful: accentIn(styles('tokens.css'), ":root,\n[data-theme='dark']"),
      powerful: accentIn(styles('sonara.css'), ":root[data-color-theme='powerful'] {"),
      mysterious: accentIn(styles('sonara.css'), ":root[data-color-theme='mysterious'] {"),
      'dark-concert': accentIn(styles('sonara.css'), ":root[data-color-theme='dark-concert'] {"),
    }
    for (const option of COLOR_THEMES) expect(option.swatch).toBe(fills[option.id])
  })

  it('falls back to Peaceful for a stored value it does not know', async () => {
    localStorage.setItem('sonara.color-theme', 'sepia')
    vi.resetModules()
    const reloaded = await import('@/state/theme-store')
    expect(reloaded.useThemeStore.getState().theme).toBe('peaceful')
  })
})
