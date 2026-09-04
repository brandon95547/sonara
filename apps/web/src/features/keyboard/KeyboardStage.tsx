import * as React from 'react'
import { ChevronLeft, ChevronRight, Tag, Crosshair, Volume2, VolumeX } from 'lucide-react'
import { noteName, STANDARD_RANGES } from '@sonara/shared'
import { IconButton } from '@/ui/Button'
import { Chip, StatusDot } from '@/ui/Display'
import { Select } from '@/ui/Controls'
import { useAudio } from '@/audio/AudioProvider'
import { useKeyboardStore } from '@/state/keyboard-store'
import { useCoarsePointer, useElementWidth } from '@/lib/hooks'
import { cn } from '@/lib/cn'
import { PianoKeyboard } from './PianoKeyboard'
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
  const [showLabels, setShowLabels] = React.useState(true)
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

  // Re-anchor whenever the span changes, keeping the current low note in view
  // so a resize does not teleport the player to the other end of the piano.
  const spanKey = span.id
  React.useEffect(() => {
    setWindow((current) => windowForSpan(span, current.low))
    // Only the span identity should re-anchor; `span` is a stable table entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spanKey])

  // Follow the player. Whole-octave jumps, and only when the note is genuinely
  // outside the window — see `windowIncluding` for why not "scroll to fit".
  const lastNote = useKeyboardStore((state) => state.lastNote)
  React.useEffect(() => {
    if (!follow || !lastNote) return
    setWindow((current) => windowIncluding(current, lastNote.note))
  }, [follow, lastNote])

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

        <div className="piano-felt" aria-hidden />
        <PianoKeyboard window={window} showLabels={showLabels} />
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
        <ToggleChip
          active={showLabels}
          onClick={() => setShowLabels((value) => !value)}
          icon={<Tag size={13} />}
          label="Labels"
          description="Show note names on every C"
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
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  description: string
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={description}
      onClick={onClick}
      className={cn(
        'touch-target inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] border px-2.5 text-label-sm',
        'transition-colors duration-[120ms] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-focus-ring)]',
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
