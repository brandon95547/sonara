import { create } from 'zustand'

/**
 * The color the app is dressed in.
 *
 * One hue runs through everything that is lit: the stage behind the staff, the
 * keys being played, the button that starts things. A theme is a choice of
 * that hue and nothing else. The layout, the ink on the paper and the colors
 * that mean something — the blue of the note to play, the orange of a wrong
 * one — are the same in all of them.
 *
 * Kept on the document rather than in React, as `data-color-theme` on the root
 * element, because it is the stylesheet that acts on it: the themes are a few
 * token values each, in `sonara.css`. And set as this module loads rather than
 * in an effect, so a page that reloads in red is never violet for a frame.
 */
export const COLOR_THEMES = [
  { id: 'peaceful', label: 'Peaceful', swatch: '#6867c9' },
  { id: 'powerful', label: 'Powerful', swatch: '#c65151' },
  { id: 'dark-concert', label: 'Dark Concert', swatch: '#82b7ff' },
] as const

export type ColorTheme = (typeof COLOR_THEMES)[number]['id']

const STORAGE_KEY = 'sonara.color-theme'
/** The theme the app was first drawn in, and the one the tokens describe unaided. */
const DEFAULT_THEME: ColorTheme = 'peaceful'

export const isColorTheme = (value: unknown): value is ColorTheme =>
  COLOR_THEMES.some((theme) => theme.id === value)

function stored(): ColorTheme {
  try {
    const value = globalThis.localStorage?.getItem(STORAGE_KEY)
    return isColorTheme(value) ? value : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

/** Puts the theme on the page. The default needs no mark: it is what the tokens are. */
function wear(theme: ColorTheme) {
  const root = globalThis.document?.documentElement
  if (!root) return
  if (theme === DEFAULT_THEME) delete root.dataset.colorTheme
  else root.dataset.colorTheme = theme
}

interface ThemeState {
  theme: ColorTheme
  setTheme: (theme: ColorTheme) => void
}

const initial = stored()
wear(initial)

export const useThemeStore = create<ThemeState>((set) => ({
  theme: initial,
  setTheme: (theme) => {
    wear(theme)
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, theme)
    } catch {
      // Private browsing. The choice holds for this session.
    }
    set({ theme })
  },
}))
