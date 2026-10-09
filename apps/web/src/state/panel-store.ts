import { create } from 'zustand'

/**
 * Which slide-out is open, if any.
 *
 * One value rather than a flag per panel, because the panels are exclusive by
 * nature: each is a modal sheet that owns focus, and two open at once means two
 * focus traps fighting over the Tab key. Opening one from inside another — the
 * theory from the Progress panel, MIDI setup from Settings — simply replaces it.
 *
 * The area's options are the one panel that is not a modal — they sit over the
 * workspace with the staff still live beside them — and they are in the same
 * value all the same, so that opening Settings from the bar puts them away
 * rather than opening over them.
 *
 * `library` is the song chooser, which is a dialog in the middle of the screen
 * rather than a sheet from the edge, and is a panel in every other respect.
 *
 * A store rather than state in the shell, because the buttons that open these
 * are scattered: the bar, its overflow menu, a card inside another panel.
 */
export type Panel =
  'options' | 'settings' | 'session' | 'library' | 'devices' | 'theory' | 'fundamentals'

interface PanelState {
  panel: Panel | null
  open: (panel: Panel) => void
  close: () => void
}

export const usePanelStore = create<PanelState>((set) => ({
  panel: null,
  open: (panel) => set({ panel }),
  close: () => set({ panel: null }),
}))

export const panelActions = {
  open: (panel: Panel) => usePanelStore.getState().open(panel),
  close: () => usePanelStore.getState().close(),
}
