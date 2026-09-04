import { Pause, Play, RotateCcw } from 'lucide-react'
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
import { Button, IconButton } from '@/ui/Button'
import { Chip } from '@/ui/Display'
import { Select } from '@/ui/Controls'
import { cn } from '@/lib/cn'
import { useLearningStore } from '@/state/learning-store'
import { useScaleDemo } from './use-scale-demo'

/**
 * The scale you are working on, and how much help you want with it.
 *
 * One row, above the keyboard, because every control here changes what the
 * keys are about to do. Each field carries its own label rather than a shared
 * legend: at this density a player scanning for "Hand" should find the word
 * over the control, not three columns away.
 */

/**
 * Root names for the picker.
 *
 * Spelled through the same speller the exercise uses, so the dropdown says
 * `D♭` for the key whose scale will be written in flats and `C♯` for the one
 * written in sharps. A fixed list of twelve sharp names would offer `C♯ Major`
 * and then print `D♭ E♭ F G♭ …` underneath it.
 */
function rootOptions(scaleTypeId: string) {
  const type = SCALE_TYPES.find((entry) => entry.id === scaleTypeId) ?? SCALE_TYPES[0]!
  return Array.from({ length: 12 }, (_, pitchClass) => ({
    value: String(pitchClass),
    label: spellScale(pitchClass, type).root.name,
  }))
}

export function ScaleConfigRow() {
  const { spec, mode, session, updateSpec, setMode, start, reset } = useLearningStore()
  const running = session.status === 'running'

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--ds-border-subtle)] bg-[var(--ds-surface)] p-3.5 lg:flex-row lg:items-end lg:gap-4">
      <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Labelled label="Key">
          <Select
            size="sm"
            aria-label="Key"
            value={String(spec.rootPitchClass)}
            onChange={(event) => updateSpec({ rootPitchClass: Number(event.target.value) })}
            options={rootOptions(spec.scaleTypeId)}
          />
        </Labelled>

        <Labelled label="Scale Type" className="col-span-2 sm:col-span-1">
          <Select
            size="sm"
            aria-label="Scale type"
            value={spec.scaleTypeId}
            onChange={(event) => updateSpec({ scaleTypeId: event.target.value })}
            options={SCALE_TYPES.map((type) => ({ value: type.id, label: type.name }))}
          />
        </Labelled>

        <Labelled label="Hand">
          <Select
            size="sm"
            aria-label="Hand"
            value={spec.hand}
            onChange={(event) => updateSpec({ hand: event.target.value as 'right' | 'left' })}
            options={[
              { value: 'right', label: 'Right Hand' },
              { value: 'left', label: 'Left Hand' },
            ]}
          />
        </Labelled>

        <Labelled label="Octaves">
          <Select
            size="sm"
            aria-label="Octaves"
            value={String(spec.octaves)}
            onChange={(event) => updateSpec({ octaves: Number(event.target.value) })}
            options={[1, 2, 3].map((count) => ({
              value: String(count),
              label: `${count} ${count === 1 ? 'Octave' : 'Octaves'}`,
            }))}
          />
        </Labelled>

        <Labelled label="Direction" className="col-span-2 sm:col-span-1">
          <Select
            size="sm"
            aria-label="Direction"
            value={spec.direction}
            onChange={(event) => updateSpec({ direction: event.target.value as ScaleDirection })}
            options={SCALE_DIRECTIONS.map((direction) => ({
              value: direction,
              label: SCALE_DIRECTION_LABELS[direction],
            }))}
          />
        </Labelled>
      </div>

      <div className="flex items-end gap-2 coarse:gap-3">
        <Labelled label="Guidance">
          <div
            role="radiogroup"
            aria-label="Guidance level"
            className="inline-flex items-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--ds-border-interactive)] bg-[var(--ds-field)] p-0.5"
          >
            {LEARNING_MODES.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={option === mode}
                title={LEARNING_MODE_DESCRIPTIONS[option]}
                onClick={() => setMode(option)}
                className={cn(
                  'h-7 rounded-[var(--radius-sm)] px-2.5 text-label-sm transition-colors duration-[120ms]',
                  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ds-focus-ring)]',
                  option === mode
                    ? 'bg-[var(--ds-accent)] text-[var(--ds-accent-fg)]'
                    : 'text-[var(--ds-fg-secondary)] hover:bg-[var(--ds-layer-hover)] hover:text-[var(--ds-fg)]',
                )}
              >
                {LEARNING_MODE_LABELS[option as LearningMode]}
              </button>
            ))}
          </div>
        </Labelled>

        <DemoButton runInProgress={running} />

        <StartButton mode={mode} running={running} onStart={start} onReset={reset} />
      </div>
    </div>
  )
}

/**
 * Hear the scale before you try to play it.
 *
 * Icon-only, and outlined next to a filled Start. The row already carries five
 * dropdowns and a three-way toggle; a second worded button here takes the width
 * their labels need, and this file's whole layout argument is that a player
 * scanning for "Hand" should find the word over the control. It sits to the
 * left of Start because listening to the scale comes before attempting it.
 */
function DemoButton({ runInProgress }: { runInProgress: boolean }) {
  const demo = useScaleDemo()
  const playing = demo.status === 'playing'

  return (
    <IconButton
      size="md"
      variant="outlined"
      icon={playing ? <Pause /> : <Play />}
      /* The label is the tooltip too, so a disabled button says why it is off
         instead of leaving a dead control to be puzzled over. */
      label={
        runInProgress
          ? 'Stop the run to hear the scale'
          : playing
            ? 'Pause'
            : demo.status === 'paused'
              ? 'Resume the scale'
              : 'Hear the scale'
      }
      disabled={runInProgress || !demo.available}
      onClick={demo.toggle}
    />
  )
}

/**
 * Explore has nothing to start — the scale is already lit and the keyboard is
 * already yours. Offering a Start there would be a button that does nothing,
 * which is worse than no button.
 */
function StartButton({
  mode,
  running,
  onStart,
  onReset,
}: {
  mode: LearningMode
  running: boolean
  onStart: () => void
  onReset: () => void
}) {
  if (mode === 'explore') {
    // Explore has nothing to start — the scale is already lit and the keyboard
    // is already yours. A chip rather than a sentence, because a paragraph here
    // steals width from the five dropdowns and truncates their labels; the
    // sentence lives in the Instructions card, where there is room for it.
    return (
      <Chip tone="accent" className="mb-1.5 h-9 px-3">
        Always on
      </Chip>
    )
  }

  return running ? (
    <Button size="md" variant="outlined" startIcon={<RotateCcw />} onClick={onReset}>
      Stop
    </Button>
  ) : (
    <Button size="md" startIcon={<Play />} onClick={onStart}>
      Start
    </Button>
  )
}

function Labelled({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-label-sm text-[var(--ds-fg-muted)]">{label}</span>
      {children}
    </div>
  )
}
