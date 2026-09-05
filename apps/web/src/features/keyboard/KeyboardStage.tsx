import * as React from 'react'
import { Blocks, ChevronLeft, ChevronRight, Crosshair, Music, Volume2, VolumeX } from 'lucide-react'
import { noteName, STANDARD_RANGES } from '@sonara/shared'
import { IconButton } from '@/ui/Button'
import { Chip, StatusDot } from '@/ui/Display'
import { Select } from '@/ui/Controls'
import { useAudio } from '@/audio/AudioProvider'
import { useKeyboardStore } from '@/state/keyboard-store'
import { useLearningStore, type KeyLabels } from '@/state/learning-store'
import { useCoarsePointer, useElementWidth } from '@/lib/hooks'
import { cn } from '@/lib/cn'
import { PianoKeyboard } from './PianoKeyboard'
import { GrandStaff } from '@/features/staff/GrandStaff'
import {
  canShift,
  chooseSpan,
  DEFAULT_SPAN,
  KEYBOARD_SPANS,
  shiftWindow,
  windowForSpan,
  windowIncluding,
  type KeyboardWindow,
} from './keyboard-layout'

/**
 * The centre of the stage: the instrument, its keys, and the controls that
 * decide how much of it you can see.
 *
 * The visible span is chosen from the container's width and the pointer type,
 * and the player can override it. Auto is the default because the right answer
 * genuinely changes — a phone cannot show 88 keys at a playable width, and a
 * 27-inch monitor should not show two octaves.
 */

export interface KeyboardStageProps {
  instrumentName: string
  statusSlot?: React.ReactNode
}

const AUTO = 'auto'

export function KeyboardStage({ instrumentName, statusSlot }: KeyboardStageProps) {
  const audio = useAudio()
  const coarse = useCoarsePointer()
  const [measureRef, width] = useElementWidth<HTMLDivElement>()

  const [spanId, setSpanId] = React.useState<string>(AUTO)
  // What the keys say and how the scale is broken up are shared with the rest
  // of the app; how much keyboard you can see is this panel's own business.
  const keyLabels = useLearningStore((state) => state.keyLabels)
  const setKeyLabels = useLearningStore((state) => state.setKeyLabels)
  const showStructure = useLearningStore((state) => state.showStructure)
  const setShowStructure = useLearningStore((state) => state.setShowStructure)
  const hasStructure = useLearningStore((state) => Boolean(state.exercise?.tetrachordGroups))
  // Owned here rather than passed in, like the label and follow toggles: it is
  // a question about this panel, and the keys take back the space when it is off.
  const [showStaff, setShowStaff] = React.useState(true)
  const [follow, setFollow] = React.useState(true)
  const [window, setWindow] = React.useState<KeyboardWindow>(() =>
    windowForSpan(DEFAULT_SPAN, STANDARD_RANGES[DEFAULT_SPAN.keyCount].low),
  )

  // Auto is capped at the default size, so the fallback before the container
  // has been measured is the same keyboard the player will end up with on any
  // ordinary screen — no resize flash from 88 keys down to 61.
  const autoSpan = React.useMemo(
    () => (width > 0 ? chooseSpan(width, coarse) : DEFAULT_SPAN),
    [width, coarse],
  )
  const span = React.useMemo(
    () => (spanId === AUTO ? autoSpan : (KEYBOARD_SPANS.find((s) => s.id === spanId) ?? autoSpan)),
    [spanId, autoSpan],
  )

  /**
   * Re-anchor when the span changes, or when a new exercise is loaded.
   *
   * A resize keeps the current low note, so it does not teleport the player to
   * the other end of the piano. A new exercise instead CENTRES the window on
   * the notes it covers — on a phone the window is two octaves of an
   * eighty-eight key piano, and an exercise placed merely "in view" opens with
   * its first note jammed against the right edge and the rest off screen.
   */
  const spanKey = span.id
  const exerciseId = useLearningStore((state) => state.exercise?.id ?? null)
  React.useEffect(() => {
    const exercise = useLearningStore.getState().exercise
    setWindow((current) => {
      if (!exercise || exercise.notes.length === 0) return windowForSpan(span, current.low)
      const middle = (Math.min(...exercise.notes) + Math.max(...exercise.notes)) / 2
      return windowForSpan(span, Math.round(middle - span.semitones / 2))
    })
    // `span` is a stable table entry; its id is what identifies a change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spanKey, exerciseId])

  // Follow the player. Whole-octave jumps, and only when the note is genuinely
  // outside the window — see `windowIncluding` for why not "scroll to fit".
  const lastNote = useKeyboardStore((state) => state.lastNote)
  React.useEffect(() => {
    if (!follow || !lastNote) return
    setWindow((current) => windowIncluding(current, lastNote.note))
  }, [follow, lastNote])

  // And follow the note you have been ASKED to play, not only the one you did.
  // On a phone the visible window is two octaves of an eighty-eight key piano,
  // so an exercise starting outside it would open with its first note off
  // screen and stay there until the player guessed where to go.
  const targetNote = useLearningStore(
    (state) => state.exercise?.steps[state.session.stepIndex]?.notes[0] ?? null,
  )
  React.useEffect(() => {
    if (!follow || targetNote === null) return
    setWindow((current) => windowIncluding(current, targetNote))
  }, [follow, targetNote])

  const sustain = useKeyboardStore((state) => state.sustain)
  const canGoDown = canShift(window, -1)
  const canGoUp = canShift(window, 1)

  return (
    <section className="flex w-full flex-col gap-3" aria-label="Instrument">
      <div className="piano-body" ref={measureRef}>
        {/* The fallboard: the strip above the keys where a real piano carries
            its maker's name. Here it carries what you are playing and whether
            the pedal is down — the two things you glance up to check. */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="truncate text-h4 text-[var(--ds-fg)]">{instrumentName}</span>
            {statusSlot}
          </div>
          <div className="flex items-center gap-2 coarse:gap-3">
            <Chip
              tone={sustain ? 'accent' : 'neutral'}
              icon={<StatusDot tone={sustain ? 'accent' : 'neutral'} />}
            >
              {sustain ? 'Sustain' : 'Pedal up'}
            </Chip>
          </div>
        </div>

        {showStaff && (
          <div className="staff-panel">
            <GrandStaff />
          </div>
        )}

        <div className="piano-felt" aria-hidden />
        <PianoKeyboard window={window} />
      </div>

      {/* Toolbar. Below the instrument, not on it: these controls change how you
          look at the keyboard, they are not part of it. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1 coarse:gap-3">
          <IconButton
            label="Octave down"
            icon={<ChevronLeft />}
            size="sm"
            variant="outlined"
            disabled={!canGoDown}
            onClick={() => setWindow((current) => shiftWindow(current, -1))}
          />
          <span
            className="min-w-[5.5rem] text-center text-label-sm text-[var(--ds-fg-muted)]"
            data-tabular
            aria-live="polite"
          >
            {noteName(window.low)} – {noteName(window.high)}
          </span>
          <IconButton
            label="Octave up"
            icon={<ChevronRight />}
            size="sm"
            variant="outlined"
            disabled={!canGoUp}
            onClick={() => setWindow((current) => shiftWindow(current, 1))}
          />
        </div>

        <label className="sr-only-ds" htmlFor="span-select">
          Visible range
        </label>
        <Select
          id="span-select"
          size="sm"
          className="w-auto min-w-[9rem]"
          value={spanId}
          onChange={(event) => setSpanId(event.target.value)}
          options={[
            { value: AUTO, label: `Auto — ${autoSpan.label}` },
            ...KEYBOARD_SPANS.map((option) => ({ value: option.id, label: option.label })),
          ]}
        />

        <ToggleChip
          active={follow}
          onClick={() => setFollow((value) => !value)}
          icon={<Crosshair size={13} />}
          label="Follow"
          description="Move the view to whatever you play"
        />
        <label className="flex items-center gap-1.5">
          <span className="text-label-sm text-[var(--ds-fg-muted)]">Key Labels</span>
          <Select
            size="sm"
            aria-label="Key labels"
            value={keyLabels}
            onChange={(event) => setKeyLabels(event.target.value as KeyLabels)}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'notes', label: 'Notes' },
              { value: 'degrees', label: 'Degrees' },
              { value: 'fingers', label: 'Fingers' },
            ]}
          />
        </label>
        <ToggleChip
          active={showStructure}
          disabled={!hasStructure}
          onClick={() => setShowStructure(!showStructure)}
          icon={<Blocks size={13} />}
          label="Structure"
          description={
            hasStructure
              ? 'Separate the two four-note groups this scale is built from'
              : 'This scale is not built from two matching halves'
          }
        />
        <ToggleChip
          active={showStaff}
          onClick={() => setShowStaff((value) => !value)}
          icon={<Music size={13} />}
          label="Staff"
          description="Write what you play on a grand staff"
        />

        <div className="ml-auto flex items-center gap-2">
          <IconButton
            label={audio.volume === 0 ? 'Unmute' : 'Mute'}
            icon={audio.volume === 0 ? <VolumeX /> : <Volume2 />}
            size="sm"
            onClick={() => audio.setVolume(audio.volume === 0 ? 0.8 : 0)}
          />
          <input
            type="range"
            className="sonara-slider w-24"
            min={0}
            max={100}
            value={Math.round(audio.volume * 100)}
            aria-label="Volume"
            onChange={(event) => audio.setVolume(Number(event.target.value) / 100)}
            style={
              {
                '--slider-from': '0%',
                '--slider-to': `${audio.volume * 100}%`,
              } as React.CSSProperties
            }
          />
        </div>
      </div>
    </section>
  )
}

function ToggleChip({
  active,
  onClick,
  icon,
  label,
  description,
  disabled = false,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  description: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      // The title carries the reason as well as the description, so a switch
      // that cannot do anything says why rather than just refusing.
      title={description}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'touch-target inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] border px-2.5 text-label-sm',
        'transition-colors duration-[120ms] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-focus-ring)]',
        'disabled:cursor-not-allowed disabled:opacity-45',
        active
          ? 'border-[var(--ds-accent-border)] bg-[var(--ds-accent-subtle)] text-[var(--ds-accent-text)]'
          : 'border-[var(--ds-border-interactive)] text-[var(--ds-fg-secondary)] hover:bg-[var(--ds-layer-hover)] hover:text-[var(--ds-fg)]',
      )}
    >
      <span aria-hidden style={{ lineHeight: 0 }}>
        {icon}
      </span>
      {label}
    </button>
  )
}
