import { Info, Lightbulb, Minus, Plus, RotateCcw } from 'lucide-react'
import {
  accuracy,
  currentStep,
  FINGER_NAMES,
  LEARNING_MODE_DESCRIPTIONS,
  progress,
  tempo,
  upcomingSteps,
  type Exercise,
  type LearningMode,
  type SessionState,
} from '@sonara/shared'
import { Card } from '@/ui/Surface'
import { Chip, Divider } from '@/ui/Display'
import { Button, IconButton } from '@/ui/Button'
import { Switch } from '@/ui/Controls'
import { cn } from '@/lib/cn'
import { useLearningStore } from '@/state/learning-store'
import { HandDiagram } from './HandDiagram'

/**
 * The dashboard under the keyboard.
 *
 * It reads the exercise and the session and nothing else — no scale-specific
 * branches anywhere in this file. When chords and progressions get builders,
 * these cards render them without being touched: the title, the facts, the
 * current step and the score are all part of the generic model.
 */
export function LearningDashboard() {
  const { exercise, mode, session } = useLearningStore()

  if (!exercise) return null

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <MaterialCard exercise={exercise} />
        <CurrentStepCard exercise={exercise} mode={mode} session={session} />
        <ProgressCard exercise={exercise} mode={mode} session={session} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <InstructionsCard mode={mode} />
        <HandPositionCard exercise={exercise} session={session} />
        <PracticeControlsCard />
      </div>
    </div>
  )
}

/* ===========================================================================
   MATERIAL — what you are playing
   ======================================================================== */

function MaterialCard({ exercise }: { exercise: Exercise }) {
  return (
    <Card variant="elevated" className="flex flex-col gap-4">
      <div>
        <h3 className="text-h2 text-[var(--ds-fg)]">{exercise.title}</h3>
        <p className="text-caption text-[var(--ds-fg-muted)]">{exercise.subtitle}</p>
      </div>

      <dl className="flex flex-col gap-2">
        {exercise.facts.map((fact) => (
          <div key={fact.label} className="flex gap-3">
            <dt className="w-[4.5rem] shrink-0 text-label text-[var(--ds-fg-muted)]">
              {fact.label}
            </dt>
            <dd className="text-ui text-[var(--ds-fg)]" data-tabular>
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>

      {exercise.fingering && (
        <>
          <Divider />
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-baseline gap-2">
              <h4 className="text-label text-[var(--ds-accent-text)]">Recommended fingering</h4>
              {/* Standard means "this is what method books teach"; derived means
                  "this follows the same rules". They are different claims and
                  the card makes the difference visible. */}
              <Chip tone={exercise.fingering.source === 'standard' ? 'neutral' : 'warning'}>
                {exercise.fingering.source === 'standard' ? 'Standard' : 'Suggested'}
              </Chip>
            </div>
            <div className="flex flex-wrap gap-1" data-tabular>
              {exercise.fingering.fingers.map((finger, index) => (
                <span
                  key={index}
                  className="grid h-6 w-6 place-items-center rounded-[var(--radius-xs)] bg-[var(--ds-surface-inset)] text-label-sm text-[var(--ds-fg-secondary)]"
                >
                  {finger}
                </span>
              ))}
            </div>
            <p className="text-caption text-[var(--ds-fg-muted)]">
              A suggestion, not a reading. MIDI reports the note and how hard it was played — never
              which finger played it.
            </p>
          </div>
        </>
      )}
    </Card>
  )
}

/* ===========================================================================
   CURRENT STEP — what to do now
   ======================================================================== */

function CurrentStepCard({
  exercise,
  mode,
  session,
}: {
  exercise: Exercise
  mode: LearningMode
  session: SessionState
}) {
  const step = currentStep(exercise, session)
  const finger = step?.fingers[0]?.finger ?? null
  const hand = step?.fingers[0]?.hand ?? exercise.fingering?.hand ?? 'right'
  const running = session.status === 'running'
  // Practice withholds the answer on purpose. Printing the note here would
  // make it the same exercise as Learn with a different label on it.
  const reveal = mode === 'learn' && running

  return (
    <Card variant="elevated" className="flex flex-col gap-3">
      <h3 className="text-label text-[var(--ds-fg-muted)] uppercase tracking-[0.09em]">
        Current note
      </h3>

      {mode === 'explore' ? (
        <ExploreBody exercise={exercise} />
      ) : session.status === 'complete' ? (
        <CompleteBody session={session} exercise={exercise} />
      ) : !running ? (
        <p className="py-6 text-body text-[var(--ds-fg-muted)]">
          Press <span className="text-[var(--ds-fg)]">Start</span> when you are ready.
        </p>
      ) : (
        <div className="flex items-center gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[3.25rem] leading-none font-[620] tracking-[-0.03em] text-[var(--ds-accent-text)]">
              {reveal ? (step?.label ?? '—') : '?'}
            </span>
            <span className="text-body-sm text-[var(--ds-fg-muted)]" data-tabular>
              {session.stepIndex + 1} of {exercise.steps.length}
              {reveal && step?.degree ? ` · degree ${step.degree}` : ''}
            </span>
            {reveal && finger && (
              <span className="text-ui text-[var(--ds-fg)]">
                Finger {finger} · {FINGER_NAMES[finger]}
              </span>
            )}
            <p className="mt-1 text-body-sm text-[var(--ds-fg-secondary)]">
              {reveal ? `Play ${step?.label} to continue` : 'Play the next note from memory'}
            </p>
            {reveal && step?.cue && (
              <Chip tone="accent" className="mt-1 w-fit">
                {step.cue}
              </Chip>
            )}
          </div>
          {reveal && (
            <div className="h-28 w-24 shrink-0" aria-hidden={false}>
              <HandDiagram hand={hand} finger={finger} />
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

function ExploreBody({ exercise }: { exercise: Exercise }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-body-sm text-[var(--ds-fg-secondary)]">
        Every {exercise.title} key is lit across the whole keyboard. Play freely and listen to where
        the scale wants to go.
      </p>
      <div className="flex flex-wrap gap-1.5 pt-1">
        {/* Scale order, not pitch-class order: A minor starts on A, and a chip
            row that opens on C is describing a different scale. */}
        {exercise.pitchClasses.map((pitchClass) => (
          <Chip key={pitchClass} tone="accent">
            {exercise.pitchNames[pitchClass]}
          </Chip>
        ))}
      </div>
    </div>
  )
}

function CompleteBody({ session, exercise }: { session: SessionState; exercise: Exercise }) {
  const score = Math.round(accuracy(session) * 100)
  return (
    <div className="flex flex-col gap-2 py-2">
      <span className="text-h1 text-[var(--ds-success-text)]">Complete</span>
      <p className="text-body-sm text-[var(--ds-fg-secondary)]">
        {exercise.steps.length} notes, {score}% accuracy
        {session.mistakes > 0
          ? `, ${session.mistakes} ${session.mistakes === 1 ? 'mistake' : 'mistakes'}.`
          : ', clean.'}
      </p>
    </div>
  )
}

/* ===========================================================================
   PROGRESS — how it is going
   ======================================================================== */

function ProgressCard({
  exercise,
  mode,
  session,
}: {
  exercise: Exercise
  mode: LearningMode
  session: SessionState
}) {
  const targetBpm = useLearningStore((state) => state.targetBpm)
  const fraction = progress(exercise, session)
  const measured = tempo(session)
  const upcoming = upcomingSteps(exercise, session, 7)

  if (mode === 'explore') {
    return (
      <Card variant="elevated" className="flex flex-col gap-2">
        <h3 className="text-label text-[var(--ds-fg-muted)] uppercase tracking-[0.09em]">
          Progress
        </h3>
        <p className="text-body-sm text-[var(--ds-fg-muted)]">
          Nothing is being scored in Explore. Switch to Learn or Practice to run the scale and keep
          a record of it.
        </p>
      </Card>
    )
  }

  return (
    <Card variant="elevated" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-label text-[var(--ds-fg-muted)] uppercase tracking-[0.09em]">
          Progress
        </h3>
        <span className="text-label text-[var(--ds-fg)]" data-tabular>
          {session.completedSteps} / {exercise.steps.length}
        </span>
      </div>

      <div
        className="h-2 w-full overflow-hidden rounded-full bg-[var(--ds-surface-inset)]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={exercise.steps.length}
        aria-valuenow={session.completedSteps}
      >
        <div
          className="h-full rounded-full bg-[var(--ds-accent)] transition-[width] duration-[220ms] ease-[cubic-bezier(0.2,0,0,1)]"
          style={{ width: `${fraction * 100}%` }}
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Metric
          label="Accuracy"
          value={`${Math.round(accuracy(session) * 100)}%`}
          tone={
            accuracy(session) >= 0.95 ? 'success' : accuracy(session) >= 0.8 ? 'warning' : 'danger'
          }
        />
        <Metric
          label={`Tempo · aim ${targetBpm}`}
          value={measured === null ? '—' : `${measured}`}
          tone="info"
        />
        <Metric
          label="Mistakes"
          value={String(session.mistakes)}
          tone={session.mistakes === 0 ? 'success' : 'danger'}
        />
      </div>

      {upcoming.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-label-sm text-[var(--ds-fg-muted)]">Upcoming notes</span>
          <div className="flex flex-wrap gap-1.5">
            {upcoming.map((step, index) => (
              <span
                key={step.id}
                className={cn(
                  'grid h-8 min-w-8 place-items-center rounded-[var(--radius-sm)] px-2 text-label',
                  index === 0
                    ? 'bg-[var(--ds-accent-subtle)] text-[var(--ds-accent-text)] ring-1 ring-[var(--ds-accent-border)]'
                    : 'bg-[var(--ds-surface-inset)] text-[var(--ds-fg-secondary)]',
                )}
              >
                {mode === 'learn' ? step.label : '·'}
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

const METRIC_TONE = {
  success: 'text-[var(--ds-success-text)]',
  warning: 'text-[var(--ds-warning-text)]',
  danger: 'text-[var(--ds-danger-text)]',
  info: 'text-[var(--ds-info-text)]',
} as const

function Metric({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: keyof typeof METRIC_TONE
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className={cn('text-h3', METRIC_TONE[tone])} data-tabular>
        {value}
      </span>
      <span className="text-caption text-[var(--ds-fg-muted)]">{label}</span>
    </div>
  )
}

/* ===========================================================================
   THE SMALLER CARDS
   ======================================================================== */

function InstructionsCard({ mode }: { mode: LearningMode }) {
  return (
    <Card className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 text-label text-[var(--ds-fg)]">
        <Info size={15} className="text-[var(--ds-accent-text)]" aria-hidden />
        Instructions
      </h3>
      <p className="text-body-sm leading-relaxed text-[var(--ds-fg-secondary)]">
        {LEARNING_MODE_DESCRIPTIONS[mode]}
      </p>
      <p className="text-caption text-[var(--ds-fg-muted)]">
        Play with a connected MIDI keyboard, or with the on-screen keys.
      </p>
    </Card>
  )
}

function HandPositionCard({ exercise, session }: { exercise: Exercise; session: SessionState }) {
  const step = currentStep(exercise, session)
  const hand = step?.fingers[0]?.hand ?? exercise.fingering?.hand ?? 'right'
  const first = exercise.steps[0]
  // The crossing is the moment a scale is won or lost, so it is named up front
  // rather than only when it arrives on the key.
  const crossing = exercise.steps.find((entry) => entry.cue)

  return (
    <Card className="flex gap-3">
      <div className="h-20 w-16 shrink-0 opacity-70">
        <HandDiagram hand={hand} finger={step?.fingers[0]?.finger ?? null} />
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <h3 className="flex items-center gap-2 text-label text-[var(--ds-fg)]">
          <Lightbulb size={15} className="text-[var(--ds-warning-text)]" aria-hidden />
          Hand position
        </h3>
        <p className="text-body-sm leading-relaxed text-[var(--ds-fg-secondary)]">
          {first && `Start with finger ${first.fingers[0]?.finger} on ${first.label}. `}
          Keep the wrist level and the fingers curved
          {crossing ? `, and ${crossing.cue?.toLowerCase()} on ${crossing.label}.` : '.'}
        </p>
      </div>
    </Card>
  )
}

function PracticeControlsCard() {
  const { targetBpm, setTargetBpm, autoTempo, setAutoTempo, start, session } = useLearningStore()

  return (
    <Card className="flex flex-col gap-3">
      <h3 className="text-label text-[var(--ds-fg)]">Practice controls</h3>

      <div className="flex flex-wrap items-center gap-2 coarse:gap-3">
        <Button
          size="sm"
          variant="outlined"
          startIcon={<RotateCcw />}
          onClick={start}
          disabled={session.status === 'idle'}
        >
          Restart
        </Button>

        <div className="flex items-center gap-1 coarse:gap-3">
          <IconButton
            label="Slower"
            icon={<Minus />}
            size="sm"
            variant="outlined"
            onClick={() => setTargetBpm(targetBpm - 4)}
          />
          <span
            className="min-w-[4.5rem] text-center text-label text-[var(--ds-fg)]"
            data-tabular
            aria-live="polite"
          >
            {targetBpm} BPM
          </span>
          <IconButton
            label="Faster"
            icon={<Plus />}
            size="sm"
            variant="outlined"
            onClick={() => setTargetBpm(targetBpm + 4)}
          />
        </div>
      </div>

      <Divider />

      {/* A target to aim at, not a metronome. Sonara measures what you actually
          played and shows it next to this number; it does not click at you. */}
      <Switch
        label="Auto tempo"
        description="Raises the target after a clean run at this speed, and eases off after a scrappy one."
        checked={autoTempo}
        onChange={setAutoTempo}
      />
    </Card>
  )
}
