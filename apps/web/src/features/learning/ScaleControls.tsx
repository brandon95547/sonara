import * as React from 'react'
import {
  BookOpen,
  ChevronDown,
  Headphones,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
} from 'lucide-react'
import {
  LEARNING_MODE_DESCRIPTIONS,
  LEARNING_MODE_LABELS,
  LEARNING_MODES,
  SCALE_DIRECTION_LABELS,
  SCALE_DIRECTIONS,
  SCALE_TYPES,
  spellScale,
  type LearningMode,
  type ScaleDirection,
} from '@sonara/shared'
import { cn } from '@/lib/cn'
import { Popover, SelectMenu } from '@/ui/Menu'
import { SegmentedControl } from '@/ui/Controls'
import { useLearningStore } from '@/state/learning-store'
import { panelActions } from '@/state/panel-store'
import { useMetronome } from '@/audio/use-metronome'
import { useScaleDemo } from './use-scale-demo'
import { MetronomeIcon } from '@/ui/MetronomeIcon'

/**
 * The Scales controls, as they sit in the app bar.
 *
 * Each setting is a button naming its current value — "Right Hand ▾" — because
 * the bar is one row and a row of captioned fields is two. Read left to right
 * they are the question being practised: which scale, which hand, how far,
 * which way, how much help. Then how fast, and go.
 *
 * On a screen too narrow for all of them in a row, the four after the scale
 * fold into the scale's own popover (`.bar-wide` / `.popover-compact` in the
 * stylesheet), so every one of them stays one tap away and none is squeezed.
 */

const HAND_OPTIONS = [
  { value: 'right', label: 'Right Hand' },
  { value: 'left', label: 'Left Hand' },
] as const

const OCTAVE_OPTIONS = [1, 2, 3].map((count) => ({
  value: count,
  label: `${count} Octave${count === 1 ? '' : 's'}`,
}))

/** "Up (Ascending)" is a form label. On a button the word is enough. */
const DIRECTION_SHORT: Record<ScaleDirection, string> = {
  up: 'Ascending',
  down: 'Descending',
  'up-down': 'Up then Down',
}

function rootOptions(scaleTypeId: string) {
  const type = SCALE_TYPES.find((entry) => entry.id === scaleTypeId) ?? SCALE_TYPES[0]!
  return Array.from({ length: 12 }, (_, pitchClass) => ({
    value: pitchClass,
    label: spellScale(pitchClass, type).root.name,
  }))
}

/** Runs whatever the Scales bar needs running, wherever its buttons happen to be. */
export function ScaleEngine() {
  const metronome = useLearningStore((state) => state.metronome)
  const bpm = useLearningStore((state) => state.targetBpm)
  useMetronome(metronome, bpm)
  return null
}

export function ScalePicker() {
  const title = useLearningStore((state) => state.exercise?.title ?? 'Choose a scale')
  const spec = useLearningStore((state) => state.spec)
  const updateSpec = useLearningStore((state) => state.updateSpec)
  const [open, setOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const close = React.useCallback(() => setOpen(false), [])
  const roots = rootOptions(spec.scaleTypeId)

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="bar-button bar-button--scale"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Scale: ${title}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="bar-button__label">{title}</span>
        <ChevronDown className="bar-button__chevron" size={16} aria-hidden />
      </button>
      <Popover
        open={open}
        onClose={close}
        anchorRef={triggerRef}
        label="Scale"
        className="popover--scale"
      >
        <div className="flex flex-col gap-4 p-4">
          <RadioGrid
            label="Key"
            columns={6}
            value={spec.rootPitchClass}
            options={roots}
            onChange={(rootPitchClass) => updateSpec({ rootPitchClass })}
          />
          <RadioGrid
            label="Scale type"
            columns={2}
            value={spec.scaleTypeId}
            options={SCALE_TYPES.map((type) => ({ value: type.id, label: type.name }))}
            onChange={(scaleTypeId) => updateSpec({ scaleTypeId })}
          />

          {/* The rest of the bar, for when the bar is too narrow to hold it. */}
          <div className="popover-compact flex flex-col gap-3 border-t border-[var(--ds-border-subtle)] pt-4">
            <CompactField label="Hand">
              <SegmentedControl
                label="Hand"
                value={spec.hand}
                onChange={(hand) => updateSpec({ hand })}
                options={[
                  { value: 'right', label: 'Right' },
                  { value: 'left', label: 'Left' },
                ]}
              />
            </CompactField>
            <CompactField label="Octaves">
              <SegmentedControl
                label="Octaves"
                value={String(spec.octaves)}
                onChange={(octaves) => updateSpec({ octaves: Number(octaves) })}
                options={['1', '2', '3'].map((count) => ({ value: count, label: count }))}
              />
            </CompactField>
            <CompactField label="Direction">
              <SegmentedControl
                label="Direction"
                value={spec.direction}
                onChange={(direction) => updateSpec({ direction })}
                options={SCALE_DIRECTIONS.map((direction) => ({
                  value: direction,
                  label: direction === 'up-down' ? 'Up & down' : DIRECTION_SHORT[direction],
                }))}
              />
            </CompactField>
            <CompactField label="Guidance">
              <GuidanceSegments />
            </CompactField>
            <CompactField label="Tempo">
              <div className="flex items-center gap-2">
                <TempoStepper />
                <MetronomeToggle />
              </div>
            </CompactField>
          </div>

          <button
            type="button"
            className="inline-flex items-center gap-2 self-start text-label-sm text-[var(--ds-accent-text)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-focus-ring)]"
            onClick={() => {
              setOpen(false)
              panelActions.open('theory')
            }}
          >
            <BookOpen size={15} aria-hidden />
            Understand this scale
          </button>
        </div>
      </Popover>
    </>
  )
}

function CompactField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-label-sm text-[var(--ds-fg-muted)]">{label}</span>
      {children}
    </div>
  )
}

/**
 * A grid of choices, one of which is on — the keys, the scale types.
 *
 * One Tab stop for the group and arrow keys inside it, the way a radio group
 * works everywhere else; twelve keys that were each a Tab stop would put the
 * scale types twelve presses away.
 */
function RadioGrid<T extends string | number>({
  label,
  value,
  options,
  onChange,
  columns,
}: {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  columns: number
}) {
  const labelId = React.useId()
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const group = event.currentTarget
    const index = options.findIndex((option) => option.value === value)
    const step =
      event.key === 'ArrowRight'
        ? 1
        : event.key === 'ArrowLeft'
          ? -1
          : event.key === 'ArrowDown'
            ? columns
            : event.key === 'ArrowUp'
              ? -columns
              : 0
    if (step === 0) return
    event.preventDefault()
    const next = options[(index + step + options.length) % options.length]
    if (!next) return
    onChange(next.value)
    // The chosen button is re-rendered as the Tab stop; move focus onto it.
    requestAnimationFrame(() =>
      group.querySelector<HTMLButtonElement>(`[data-value="${String(next.value)}"]`)?.focus(),
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="text-label-sm text-[var(--ds-fg-muted)]">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        onKeyDown={onKeyDown}
      >
        {options.map((option) => {
          const checked = option.value === value
          return (
            <button
              key={String(option.value)}
              type="button"
              role="radio"
              aria-checked={checked}
              data-value={String(option.value)}
              tabIndex={checked ? 0 : -1}
              className={cn('choice', checked && 'choice--on')}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function HandMenu() {
  const hand = useLearningStore((state) => state.spec.hand)
  const updateSpec = useLearningStore((state) => state.updateSpec)
  return (
    <SelectMenu
      label="Hand"
      value={hand}
      options={HAND_OPTIONS}
      onChange={(next) => updateSpec({ hand: next })}
    />
  )
}

export function OctavesMenu() {
  const octaves = useLearningStore((state) => state.spec.octaves)
  const updateSpec = useLearningStore((state) => state.updateSpec)
  return (
    <SelectMenu
      label="Octaves"
      value={octaves}
      options={OCTAVE_OPTIONS}
      onChange={(next) => updateSpec({ octaves: next })}
    />
  )
}

export function DirectionMenu() {
  const direction = useLearningStore((state) => state.spec.direction)
  const updateSpec = useLearningStore((state) => state.updateSpec)
  return (
    <SelectMenu
      label="Direction"
      value={direction}
      options={SCALE_DIRECTIONS.map((option) => ({
        value: option,
        label: DIRECTION_SHORT[option],
        description: SCALE_DIRECTION_LABELS[option],
      }))}
      onChange={(next) => updateSpec({ direction: next })}
    />
  )
}

export function GuidanceMenu() {
  const mode = useLearningStore((state) => state.mode)
  const setMode = useLearningStore((state) => state.setMode)
  return (
    <SelectMenu<LearningMode>
      label="Guidance"
      value={mode}
      options={LEARNING_MODES.map((option) => ({
        value: option,
        label: LEARNING_MODE_LABELS[option],
        description: LEARNING_MODE_DESCRIPTIONS[option],
      }))}
      onChange={setMode}
    />
  )
}

function GuidanceSegments() {
  const mode = useLearningStore((state) => state.mode)
  const setMode = useLearningStore((state) => state.setMode)
  return (
    <SegmentedControl<LearningMode>
      label="Guidance"
      value={mode}
      onChange={setMode}
      options={LEARNING_MODES.map((option) => ({
        value: option,
        label: LEARNING_MODE_LABELS[option],
      }))}
    />
  )
}

/** The target tempo, a step of four either way — the store keeps it in range. */
export function TempoStepper({ className }: { className?: string }) {
  const bpm = useLearningStore((state) => state.targetBpm)
  const setTargetBpm = useLearningStore((state) => state.setTargetBpm)
  return (
    <div className={cn('tempo-stepper', className)} role="group" aria-label="Target tempo">
      <button
        type="button"
        className="tempo-stepper__button"
        aria-label="Slower"
        title="Slower"
        onClick={() => setTargetBpm(bpm - 4)}
      >
        <Minus size={16} aria-hidden />
      </button>
      <span className="tempo-stepper__value" aria-live="polite" data-tabular>
        {bpm} BPM
      </span>
      <button
        type="button"
        className="tempo-stepper__button"
        aria-label="Faster"
        title="Faster"
        onClick={() => setTargetBpm(bpm + 4)}
      >
        <Plus size={16} aria-hidden />
      </button>
    </div>
  )
}

export function MetronomeToggle({ className }: { className?: string }) {
  const on = useLearningStore((state) => state.metronome)
  const bpm = useLearningStore((state) => state.targetBpm)
  const setMetronome = useLearningStore((state) => state.setMetronome)
  return (
    <button
      type="button"
      className={cn('bar-icon-button', className)}
      aria-pressed={on}
      aria-label={on ? `Metronome on, ${bpm} BPM` : `Metronome off, ${bpm} BPM`}
      title={on ? 'Metronome on' : 'Metronome'}
      onClick={() => setMetronome(!on)}
    >
      <MetronomeIcon />
    </button>
  )
}

/**
 * Hear the scale before you try to play it.
 *
 * Kept mounted in the bar at every width: the demonstration's state lives in
 * this component's hook, and a button tucked inside a menu that closes would
 * stop the scale mid-phrase.
 *
 * Headphones rather than a play triangle: Start is a play triangle, one button
 * along, and two of them side by side ask which one begins the run.
 */
export function DemoButton() {
  const running = useLearningStore((state) => state.session.status === 'running')
  const demo = useScaleDemo()
  const playing = demo.status === 'playing'
  // The label is the tooltip too, so a disabled button says why it is off
  // instead of leaving a dead control to be puzzled over.
  const label = running
    ? 'Stop the run to hear the scale'
    : playing
      ? 'Pause'
      : demo.status === 'paused'
        ? 'Resume the scale'
        : 'Hear the scale'

  return (
    <button
      type="button"
      className="bar-icon-button"
      aria-label={label}
      title={label}
      disabled={running || !demo.available}
      onClick={demo.toggle}
    >
      {playing ? <Pause size={18} aria-hidden /> : <Headphones size={18} aria-hidden />}
    </button>
  )
}

/**
 * Start, or Stop while a run is going.
 *
 * Explore has nothing to start — the scale is already lit and the keyboard is
 * already yours — so it says so in the button's place rather than offering a
 * button that does nothing.
 */
export function StartButton() {
  const mode = useLearningStore((state) => state.mode)
  const running = useLearningStore((state) => state.session.status === 'running')
  const start = useLearningStore((state) => state.start)
  const reset = useLearningStore((state) => state.reset)

  if (mode === 'explore') {
    return (
      <span className="bar-status" title={LEARNING_MODE_DESCRIPTIONS.explore}>
        Always on
      </span>
    )
  }

  return running ? (
    <button type="button" className="bar-start bar-start--stop" onClick={reset}>
      <RotateCcw size={18} aria-hidden />
      <span className="bar-start__label">Stop</span>
    </button>
  ) : (
    <button type="button" className="bar-start" onClick={start}>
      <Play size={18} aria-hidden />
      <span className="bar-start__label">Start</span>
    </button>
  )
}
