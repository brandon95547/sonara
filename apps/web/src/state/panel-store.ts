import { create } from 'zustand'

/**
 * Which slide-out is open, if any.
 *
 * One value rather than a flag per panel, because the panels are exclusive by
 * nature: each is a modal sheet that owns focus, and two open at once means two
 * focus traps fighting over the Tab key. Opening one from inside another — the
 * theory from the Progress panel, MIDI setup from Settings — simply replaces it.
 *
 * A store rather than state in the shell, because the buttons that open these
 * are scattered: the bar, its overflow menu, a card inside another panel.
 */
export type Panel = 'settings' | 'session' | 'library' | 'devices' | 'theory' | 'fundamentals'

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
