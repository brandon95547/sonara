import * as React from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import { IconButton } from '@/ui/Button'
import { Field } from '@/ui/Controls'
import { Divider } from '@/ui/Display'
import { useLearningStore, type LearningTopic } from '@/state/learning-store'
import { panelActions, usePanelStore } from '@/state/panel-store'
import { useCurrentSong, useSongStore } from '@/state/song-store'
import { MetronomeToggle, ScaleOptions, TempoControl } from '@/features/learning/ScaleControls'
import {
  ArpeggioOptions,
  ChordOptions,
  ExerciseOptions,
  ProgressionOptions,
} from '@/features/learning/ChordControls'
import { SongMetronomeToggle, SongOptions, SongTempoControl } from '@/features/songs/SongControls'

const TRIGGER_ID = 'bar-options'
const PANEL_ID = 'options-panel'

/** What the panel is called, area by area — and the bar's button with it. */
const TITLES: Record<LearningTopic, string> = {
  scales: 'Scale Options',
  chords: 'Chord Options',
  arpeggios: 'Arpeggio Options',
  progressions: 'Progression Options',
  exercises: 'Exercise Options',
  songs: 'Song Options',
}

const closeOptions = () => {
  if (usePanelStore.getState().panel === 'options') panelActions.close()
}

/**
 * The bar's way into the area's options: the one control on its left.
 *
 * Filled while the panel is open, so the button that opened it is plainly the
 * button that closes it.
 */
export function OptionsButton() {
  const open = usePanelStore((state) => state.panel === 'options')
  const topic = useLearningStore((state) => state.topic)
  const exercise = useLearningStore((state) => state.exercise?.title)
  const song = useCurrentSong()?.title
  // What the options are set to, where there is a word for it: a tooltip that
  // only repeated the icon would be no use to anyone who had read the icon.
  const set = topic === 'songs' ? song : exercise
  const label = set ? `${TITLES[topic]}: ${set}` : TITLES[topic]

  return (
    <button
      id={TRIGGER_ID}
      type="button"
      className="bar-options"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={open ? PANEL_ID : undefined}
      aria-label={label}
      title={label}
      onClick={() => (open ? panelActions.close() : panelActions.open('options'))}
    >
      <SlidersHorizontal size={18} aria-hidden />
    </button>
  )
}

/**
 * The options of the area that is open, in a panel that slides in from the
 * left, under the button that opens it.
 *
 * Over the workspace, not beside it: the staff and the keys keep their width,
 * so a scale does not re-lay itself out every time the panel is opened. And
 * with no scrim, because the point of changing a setting here is to watch it
 * land on the staff — which is also why this is not a modal, and does not trap
 * the Tab key the way the app's other panels do.
 *
 * The Bible anchors a detail panel to the right and turns it into a bottom
 * sheet on a phone. This one is on the left at every width on purpose: it
 * belongs to the button above it, the right is where Settings opens, and a
 * bottom sheet would cover the keys — the one thing a player needs to reach
 * while trying a setting out.
 *
 * It closes itself when it would be in the way: on a press anywhere on the
 * workspace, on Escape, when the area changes, and when a run or a song starts,
 * since the first bars of the staff are underneath it.
 */
export function OptionsDrawer() {
  const open = usePanelStore((state) => state.panel === 'options')
  const topic = useLearningStore((state) => state.topic)
  const panelRef = React.useRef<HTMLDivElement>(null)
  const titleId = React.useId()

  const close = React.useCallback(() => {
    // Focus goes back to the button only if it was in the panel: a press
    // somewhere else has already put it where the player meant.
    if (panelRef.current?.contains(document.activeElement))
      document.getElementById(TRIGGER_ID)?.focus()
    closeOptions()
  }, [])

  React.useEffect(() => {
    if (!open) return
    panelRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null
      // The bar is not "outside": the mode, the tempo and Hear are what a
      // setting is tried out with, and the panel's own button is up there.
      if (panelRef.current?.contains(target) || target?.closest?.('.top-bar')) return
      close()
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [open, close])

  // Another area's options are another panel. Leaving this one — for the
  // dashboard too, which unmounts it — puts it away.
  React.useEffect(() => closeOptions, [topic])

  const running = useLearningStore((state) => state.session.status === 'running')
  const songGoing = useSongStore((state) => state.playing || state.learning)
  React.useEffect(() => {
    if (running || songGoing) closeOptions()
  }, [running, songGoing])

  if (!open) return null

  return (
    <div
      ref={panelRef}
      id={PANEL_ID}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="options-drawer"
    >
      <header className="options-drawer__header">
        <h2 id={titleId} className="text-h4 text-[var(--ds-fg)]">
          {TITLES[topic]}
        </h2>
        <IconButton label="Close" icon={<X />} size="sm" onClick={close} />
      </header>
      <div className="options-drawer__body">
        {/* The tempo and the metronome, on a bar too narrow to hold them: one
            press away here, where Settings is three. */}
        <div className="options-only-xs">
          <Field label="Tempo">
            <div className="flex items-center gap-2 coarse:gap-3">
              {topic === 'songs' ? (
                <>
                  <SongTempoControl panel />
                  <SongMetronomeToggle className="bar-icon-button--panel" />
                </>
              ) : (
                <>
                  <TempoControl panel />
                  <MetronomeToggle className="bar-icon-button--panel" />
                </>
              )}
            </div>
          </Field>
          <Divider />
        </div>
        {topic === 'scales' ? (
          <ScaleOptions />
        ) : topic === 'chords' ? (
          <ChordOptions />
        ) : topic === 'arpeggios' ? (
          <ArpeggioOptions />
        ) : topic === 'progressions' ? (
          <ProgressionOptions />
        ) : topic === 'exercises' ? (
          <ExerciseOptions />
        ) : (
          <SongOptions />
        )}
      </div>
    </div>
  )
}
