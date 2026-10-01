import * as React from 'react'
import { Info, Lightbulb, Minus, Play, Plus, RotateCcw } from 'lucide-react'
import {
  currentStep,
  accuracy,
  FINGER_NAMES,
  fingeringSystem,
  LEARNING_MODE_DESCRIPTIONS,
  progress,
  tempo,
  upcomingSteps,
  type Exercise,
  type ExerciseFingering,
  type ExerciseStep,
  type Hand,
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
import { panelActions } from '@/state/panel-store'

/**
 * Everything about the run in progress, for the Progress panel.
 *
 * It used to be a dashboard of six cards under the keyboard, which put the
 * keyboard in the middle of the page and the scale's own facts below the fold.
 * It is a panel now, opened from the bar: the staff and the keys take the
 * screen, and this is one click away. Ordered for a player mid-run — where they
 * are and how it is going first, what the scale is further down.
 *
 * It reads the exercise and the session and nothing else — no scale-specific
 * branches anywhere in this file. When chords and progressions get builders,
 * these cards render them without being touched: the title, the facts, the
 * current step and the score are all part of the generic model.
 */
/** A fingering's numbers, in the groups they are played in. */
function fingerGroups(fingering: ExerciseFingering): number[][] {
  const size = fingering.perStep ?? 1
  const groups: number[][] = []
  for (let at = 0; at < fingering.fingers.length; at += size) {
    groups.push(fingering.fingers.slice(at, at + size))
  }
  return groups
}

const HAND_NAMES: Record<Hand, string> = { left: 'Left hand', right: 'Right hand' }

/**
 * The fingers due on a step, grouped by the hand that plays them — left first,
 * the way the hands sit on the keys.
 *
 * Read from the step rather than from a setting, so one hand, both hands, and
 * a chord split across them all come out of the same few lines.
 */
function handsOf(
  exercise: Exercise,
  step: ExerciseStep | null | undefined,
): { hand: Hand; fingers: number[] }[] {
  const playing = new Set<Hand>(
    step ? step.fingers.map((finger) => finger.hand) : exercise.fingerings.map((f) => f.hand),
  )
  if (playing.size === 0) playing.add('right')
  return (['left', 'right'] as const)
    .filter((hand) => playing.has(hand))
    .map((hand) => ({
      hand,
      fingers: step?.fingers.filter((f) => f.hand === hand).map((f) => f.finger) ?? [],
    }))
}

export function SessionPanelContent() {
  const { exercise, mode, session, demoStepIndex } = useLearningStore()

  if (!exercise) return null

  return (
    <div className="flex flex-col gap-4">
      <CurrentStepCard
        exercise={exercise}
        mode={mode}
        session={session}
        demoStepIndex={demoStepIndex}
      />
      <ProgressCard exercise={exercise} mode={mode} session={session} />
      <PracticeControlsCard />
      <HandPositionCard exercise={exercise} session={session} />
      <MaterialCard exercise={exercise} />
      <InstructionsCard mode={mode} />
    </div>
  )
}

/* ===========================================================================
   MATERIAL — what you are playing
   ======================================================================== */

/**
 * What the scale is — with the why one click away rather than printed under it.
 *
 * The card states the scale; the dialog behind the ⓘ explains it. Keeping the
 * explanation out of the card is what lets it be a real explanation: there is
 * room in a dialog for the tetrachords, the degree names and the fingering
 * principle, and no room for any of them above a keyboard someone came here to
 * play.
 */
function MaterialCard({ exercise }: { exercise: Exercise }) {
  const system = fingeringSystem(useLearningStore((state) => state.fingeringSystem))
  return (
    <Card variant="elevated" className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-h2 text-[var(--ds-fg)]">{exercise.title}</h3>
          <p className="text-caption text-[var(--ds-fg-muted)]">{exercise.subtitle}</p>
        </div>
        {/* The explanation is the scale's: how it is built, what its degrees
            are called. A chord has no such page yet, so it has no button. */}
        {exercise.kind === 'scale' && (
          <IconButton
            size="sm"
            variant="text"
            className="-mr-1 shrink-0"
            label="Understand this scale"
            icon={<Info />}
            onClick={() => panelActions.open('theory')}
          />
        )}
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

      {exercise.fingerings.length > 0 && (
        <>
          <Divider />
          <div className="flex flex-col gap-1.5">
            {exercise.fingerings.map((fingering, index) => {
              // Named for the system means "this is what its source prints";
              // Suggested means "the source does not print this scale, and
              // this follows the same rules". They are different claims and
              // the card makes the difference visible — per hand, because one
              // hand's fingering can be printed where the other's is not.
              const source = (
                <Chip tone={fingering.source === 'standard' ? 'neutral' : 'warning'}>
                  {fingering.source === 'standard' ? system.shortName : 'Suggested'}
                </Chip>
              )
              const hands = exercise.fingerings.length > 1
              return (
                <React.Fragment key={fingering.hand}>
                  {index === 0 && (
                    <div className="flex flex-wrap items-baseline gap-2">
                      <h4 className="text-label text-[var(--ds-accent-text)]">
                        Recommended fingering
                      </h4>
                      {!hands && source}
                    </div>
                  )}
                  {hands && (
                    <div
                      className={cn('flex flex-wrap items-baseline gap-2', index > 0 && 'mt-1.5')}
                    >
                      <span className="text-label-sm text-[var(--ds-fg-muted)]">
                        {HAND_NAMES[fingering.hand]}
                      </span>
                      {source}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1" data-tabular>
                    {/* Fingers played together share a chip: a third is 1 3,
                        not a 1 and then a 3. */}
                    {fingerGroups(fingering).map((group, at) => (
                      <span
                        key={at}
                        className={cn(
                          'grid h-6 place-items-center rounded-[var(--radius-xs)] bg-[var(--ds-surface-inset)] text-label-sm text-[var(--ds-fg-secondary)]',
                          group.length > 1 ? 'px-1.5' : 'w-6',
                        )}
                      >
                        {group.join(' ')}
                      </span>
                    ))}
                  </div>
                </React.Fragment>
              )
            })}
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
  demoStepIndex,
}: {
  exercise: Exercise
  mode: LearningMode
  session: SessionState
  demoStepIndex: number | null
}) {
  const demoing = demoStepIndex !== null
  // Whichever playback head is live — the player's, or the demonstration's.
  const here = demoStepIndex ?? session.stepIndex
  const step = exercise.steps[here] ?? null
  const hands = handsOf(exercise, step)
  const together = hands.length > 1
  // The most any one hand holds at once.
  const held = Math.max(0, ...hands.map((hand) => hand.fingers.length))
  const running = session.status === 'running'
  // Practice withholds the answer on purpose. Printing the note here would
  // make it the same exercise as Learn with a different label on it — and a
  // demonstration is not a way around that.
  const reveal = mode === 'learn' && (running || demoing)

  return (
    <Card variant="elevated" className="flex flex-col gap-3">
      <h3 className="text-label text-[var(--ds-fg-muted)] uppercase tracking-[0.09em]">
        {/* A step of solid chords is a chord, not a note; a third or an
            octave is two notes. */}
        {held >= 3 ? 'Current chord' : held === 2 ? 'Current notes' : 'Current note'}
      </h3>

      {mode === 'explore' ? (
        <ExploreBody exercise={exercise} />
      ) : session.status === 'complete' ? (
        <CompleteBody session={session} exercise={exercise} />
      ) : !running && !demoing ? (
        <p className="py-6 text-body text-[var(--ds-fg-muted)]">
          Press{' '}
          <span className="inline-flex items-center gap-1 align-[-0.125em] text-[var(--ds-fg)]">
            <Play size={14} aria-hidden />
            Start
          </span>{' '}
          when you are ready.
        </p>
      ) : (
        <div className="flex items-center gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[3.25rem] leading-none font-[620] tracking-[-0.03em] text-[var(--ds-accent-text)]">
              {reveal ? (step?.label ?? '—') : '?'}
            </span>
            <span className="text-body-sm text-[var(--ds-fg-muted)]" data-tabular>
              {here + 1} of {exercise.steps.length}
              {reveal && step?.degree ? ` · degree ${step.degree}` : ''}
            </span>
            {reveal &&
              hands.map(({ hand, fingers }) =>
                fingers.length === 0 ? null : (
                  <span key={hand} className="text-ui text-[var(--ds-fg)]">
                    {/* One hand needs no naming; two do, or "Finger 5" is a
                        question about which. Kept to a word, so each hand
                        stays on one line beside the two diagrams. */}
                    {together ? (hand === 'left' ? 'Left' : 'Right') : 'Finger'}{' '}
                    {fingers.join(', ')}
                    {fingers.length === 1 && ` · ${FINGER_NAMES[fingers[0]!]}`}
                  </span>
                ),
              )}
            <p className="mt-1 text-body-sm text-[var(--ds-fg-secondary)]">
              {demoing
                ? `Playing ${step?.label ?? ''}`
                : reveal
                  ? // Two hands on one note need telling; on two notes, the notes say it.
                    `Play ${step?.label} ${together && !step?.noteLabels ? 'in both hands ' : ''}to continue`
                  : 'Play the next note from memory'}
            </p>
            {reveal && step?.cue && (
              <Chip tone="accent" className="mt-1 w-fit">
                {step.cue}
              </Chip>
            )}
          </div>
          {reveal && (
            <div className="flex shrink-0 gap-1">
              {hands.map(({ hand, fingers }) => (
                <div key={hand} className={cn('h-28', together ? 'w-[4.5rem]' : 'w-24')}>
                  <HandDiagram hand={hand} fingers={fingers} />
                </div>
              ))}
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
        {exercise.kind === 'scale'
          ? `Every ${exercise.title} key is lit across the whole keyboard. Play freely and listen to where the scale wants to go.`
          : 'Every note of the chord is lit across the whole keyboard. Play freely and listen to how it sits.'}
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
        {exercise.steps.length} steps, {score}% accuracy
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
          Nothing is being scored in Explore. Switch to Learn or Practice to run it and keep a
          record.
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

/** `finger 1`, `fingers 1 3 5`. */
const fingerWord = (fingers: string | undefined) =>
  fingers && fingers.length > 1 ? 'fingers' : 'finger'

function HandPositionCard({ exercise, session }: { exercise: Exercise; session: SessionState }) {
  const step = currentStep(exercise, session)
  const hands = handsOf(exercise, step)
  const together = hands.length > 1
  const first = exercise.steps[0]
  // The crossing is the moment a scale is won or lost, so it is named up front
  // rather than only when it arrives on the key. Each hand has its own: they do
  // not cross on the same note.
  const advice = hands.map(({ hand }) => {
    const crossing = exercise.steps.find((entry) =>
      entry.fingers.some((finger) => finger.hand === hand && finger.cue),
    )
    return {
      hand,
      // Every finger this hand starts on: one for a scale, three or four for a chord.
      start: first?.fingers
        .filter((finger) => finger.hand === hand)
        .map((finger) => finger.finger)
        .join(' '),
      cue: crossing?.fingers.find((finger) => finger.hand === hand)?.cue?.toLowerCase(),
      on: crossing?.label,
    }
  })

  return (
    <Card className="flex gap-3">
      <div className="flex shrink-0 gap-1 opacity-70">
        {hands.map(({ hand, fingers }) => (
          <div key={hand} className={cn('h-20', together ? 'w-12' : 'w-16')}>
            <HandDiagram hand={hand} fingers={fingers} />
          </div>
        ))}
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <h3 className="flex items-center gap-2 text-label text-[var(--ds-fg)]">
          <Lightbulb size={15} className="text-[var(--ds-warning-text)]" aria-hidden />
          Hand position
        </h3>
        {together ? (
          <p className="text-body-sm leading-relaxed text-[var(--ds-fg-secondary)]">
            {first &&
              `Start on ${first.label}: ${advice
                .map(
                  ({ hand, start }) =>
                    `${HAND_NAMES[hand].toLowerCase()} ${fingerWord(start)} ${start}`,
                )
                .join(', ')}. `}
            Keep the wrists level and the fingers curved.
            {advice.map(({ hand, cue, on }) =>
              cue ? ` ${HAND_NAMES[hand]}: ${cue} on ${on}.` : '',
            )}
          </p>
        ) : (
          <p className="text-body-sm leading-relaxed text-[var(--ds-fg-secondary)]">
            {first &&
              `Start with ${fingerWord(advice[0]?.start)} ${advice[0]?.start} on ${first.label}. `}
            Keep the wrist level and the fingers curved
            {advice[0]?.cue ? `, and ${advice[0].cue} on ${advice[0].on}.` : '.'}
          </p>
        )}
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
