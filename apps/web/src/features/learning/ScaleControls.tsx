import * as React from 'react'
import {
  BookOpen,
  Compass,
  GraduationCap,
  Headphones,
  Pause,
  Play,
  RotateCcw,
  Target,
  type LucideIcon,
} from 'lucide-react'
import {
  CHROMATIC_INTERVAL_LABELS,
  CHROMATIC_INTERVALS,
  LEARNING_MODE_DESCRIPTIONS,
  LEARNING_MODE_LABELS,
  LEARNING_MODES,
  NOTES_PER_BEAT,
  NOTES_PER_BEAT_LABELS,
  SCALE_DIRECTIONS,
  SCALE_MOTION_LABELS,
  SCALE_MOTIONS,
  SCALE_TEXTURE_LABELS,
  SCALE_TEXTURES,
  scaleHasCadence,
  scaleHasIntervals,
  scaleMotionsFor,
  scaleTexturesFor,
  SCALE_TYPES,
  scaleSpellings,
  spellScale,
  type ChromaticInterval,
  type ExerciseKind,
  type LearningMode,
  type NotesPerBeat,
  type ScaleDirection,
  type ScaleMotion,
  type ScaleSpec,
  type ScaleTexture,
} from '@sonara/shared'
import { cn } from '@/lib/cn'
import { Field, SegmentedControl, Select, Switch } from '@/ui/Controls'
import { Divider } from '@/ui/Display'
import { BarTabs } from '@/ui/BarTabs'
import { TempoField } from '@/ui/TempoField'
import { useMidi } from '@/midi/MidiProvider'
import { useLearningStore } from '@/state/learning-store'
import { panelActions } from '@/state/panel-store'
import { useMetronome } from '@/audio/use-metronome'
import { playSoundEffect, stopSoundEffect } from '@/audio/sound-effects'
import { useScaleDemo } from './use-scale-demo'
import { MetronomeIcon } from '@/ui/MetronomeIcon'

/**
 * The Scales controls: what the bar carries, and what the options panel holds.
 *
 * The bar used to carry all of it — the scale, the hand, how it is played, how
 * far and which way, each an icon with its value on a badge — and five icons
 * that each opened a menu were five things to learn before playing a note. They
 * are one button now, and the panel it opens says every setting in words.
 *
 * So the bar is how the scale is practised: the mode, the tempo, and the
 * buttons that act on them. What is practised is in the panel.
 */

/**
 * Who plays, as one list: a hand on its own, or the two together in one of the
 * ways a scale book sets them against each other.
 *
 * Two settings in the spec — a hand and a motion — because a motion only means
 * anything with both hands. The panel asks for the hand first, and for the
 * motion only once the answer is both.
 */
type Playing = 'right' | 'left' | ScaleMotion

const PLAYING_DESCRIPTIONS: Partial<Record<Playing, string>> = {
  similar: 'Similar motion, the left hand an octave below.',
  contrary: 'From one note: right hand up, left hand down, and back.',
  third: 'Together, the right hand a third above the left.',
  sixth: 'Together, the right hand a sixth above the left.',
}

/** Why a motion is not on offer for the scale that is selected. */
const MOTION_UNAVAILABLE: Record<ScaleMotion, string> = {
  similar: '',
  contrary: 'Not for a scale that comes down differently from how it goes up.',
  third: 'For seven-note scales.',
  sixth: 'For seven-note scales.',
}

/** What each hand plays: the texture menu. */
const TEXTURE_DESCRIPTIONS: Record<ScaleTexture, string> = {
  single: 'One note at a time.',
  'double-thirds': 'Each note with the third above it, joined: the fingers change on every third.',
  'staccato-thirds': 'Each note with the third above it, detached: 2nd and 4th fingers throughout.',
  'staccato-sixths': 'Each note with the sixth below it, detached: thumb and little finger.',
  'staccato-octaves': 'Each note with its octave, detached: thumb and little finger.',
  'legato-octaves': 'Each note with its octave, joined: the 4th finger takes the black keys.',
}

/** Why a texture is not on offer for the scale that is selected. */
const TEXTURE_UNAVAILABLE: Partial<Record<ScaleTexture, string>> = {
  'double-thirds': 'For major scales.',
  'staccato-thirds': 'For seven-note scales.',
  'staccato-sixths': 'For seven-note scales.',
}

const typeOf = (scaleTypeId: string) =>
  SCALE_TYPES.find((type) => type.id === scaleTypeId) ?? SCALE_TYPES[0]!

/** The texture in force: the one chosen, where the scale can be played that way. */
const textureOf = (spec: ScaleSpec): ScaleTexture =>
  spec.texture && scaleTexturesFor(typeOf(spec.scaleTypeId)).includes(spec.texture)
    ? spec.texture
    : 'single'

const playingOf = (spec: ScaleSpec, motions: readonly ScaleMotion[]): Playing =>
  spec.hand !== 'both'
    ? spec.hand
    : spec.motion && motions.includes(spec.motion)
      ? spec.motion
      : 'similar'

const specFor = (playing: Playing): Pick<ScaleSpec, 'hand' | 'motion'> =>
  playing === 'right' || playing === 'left' ? { hand: playing } : { hand: 'both', motion: playing }

/**
 * The motions the selected scale can be played in, as it is set now.
 *
 * Hands holding thirds or octaves move together, so anything but single notes
 * leaves similar motion and nothing else.
 */
function useScaleMotions(): ScaleMotion[] {
  const scaleTypeId = useLearningStore((state) => state.spec.scaleTypeId)
  const single = useLearningStore((state) => textureOf(state.spec) === 'single')
  return React.useMemo(
    () => (single ? scaleMotionsFor(typeOf(scaleTypeId)) : ['similar']),
    [scaleTypeId, single],
  )
}

/** "Up (Ascending)" is a form label. On a button the word is enough. */
export const DIRECTION_SHORT: Record<ScaleDirection, string> = {
  up: 'Ascending',
  down: 'Descending',
  'up-down': 'Up & Down',
}

/** What an exercise is called in a sentence: "Hear the scale", "the arpeggio". */
export const EXERCISE_NOUNS: Record<ExerciseKind, string> = {
  scale: 'scale',
  chord: 'chords',
  arpeggio: 'arpeggio',
  progression: 'cadence',
  exercise: 'exercise',
}

/** Shared with Songs, so a mode looks the same wherever it is chosen. */
export const MODE_ICONS: Record<LearningMode, LucideIcon> = {
  explore: Compass,
  learn: GraduationCap,
  practice: Target,
}

/**
 * The twelve keys, each under its usual name — and the selected one under the
 * name it has actually been given, where it has two.
 */
function rootOptions(scaleTypeId: string, selected: { pitchClass: number; tonic?: string }) {
  const type = SCALE_TYPES.find((entry) => entry.id === scaleTypeId) ?? SCALE_TYPES[0]!
  return Array.from({ length: 12 }, (_, pitchClass) => ({
    value: pitchClass,
    label: spellScale(
      pitchClass,
      type,
      pitchClass === selected.pitchClass ? selected.tonic : undefined,
    ).root.name,
  }))
}

/**
 * Tells the exercises which keys the player actually has.
 *
 * So that an exercise is placed where the book prints it when the keyboard
 * reaches that far: A major in contrary motion goes down to the A at the very
 * bottom of an 88, which a 61-key instrument does not have. With nothing
 * plugged in it is the on-screen keyboard's 61.
 */
export function KeyboardRangeSync() {
  const { connectedPorts } = useMidi()
  const low = Math.min(...connectedPorts.flatMap((port) => port.device?.config.range.low ?? []))
  const high = Math.max(...connectedPorts.flatMap((port) => port.device?.config.range.high ?? []))
  const setPlayableRange = useLearningStore((state) => state.setPlayableRange)
  React.useEffect(() => {
    setPlayableRange(Number.isFinite(low) && Number.isFinite(high) ? { low, high } : null)
  }, [low, high, setPlayableRange])
  return null
}

/** Runs whatever the Scales bar needs running, wherever its buttons happen to be. */
export function ScaleEngine() {
  const metronome = useLearningStore((state) => state.metronome)
  const bpm = useLearningStore((state) => state.targetBpm)
  const status = useLearningStore((state) => state.session.status)
  // The bar the click accents is the exercise's own, where it states one.
  const beatsPerBar = useLearningStore((state) => state.exercise?.meter?.beats ?? 4)
  const pulseEpoch = useLearningStore((state) => state.pulseEpoch)
  useMetronome(metronome, bpm, beatsPerBar, pulseEpoch)

  // The fanfare for a finished run: on the step from running to complete, so
  // reopening Scales on a run that ended earlier does not play it again. A new
  // run fades out whatever is left of it rather than playing over the start.
  const previous = React.useRef(status)
  React.useEffect(() => {
    if (status === 'complete' && previous.current === 'running') playSoundEffect('success')
    if (status === 'running') stopSoundEffect('success')
    previous.current = status
  }, [status])

  return null
}

/**
 * Everything about the scale that is practised, for the options panel: which
 * scale, which hands and how they are set against each other, what each hand
 * plays, and how far and which way it runs.
 *
 * In words throughout. On the bar these were icons with a letter on the
 * corner, because the bar had no room for more; the panel has, and a setting
 * that cannot be chosen says why in the same place it would have been chosen.
 */
export function ScaleOptions() {
  const spec = useLearningStore((state) => state.spec)
  const updateSpec = useLearningStore((state) => state.updateSpec)
  const bpm = useLearningStore((state) => state.targetBpm)
  const typeId = React.useId()
  const apartId = React.useId()
  const roots = rootOptions(spec.scaleTypeId, {
    pitchClass: spec.rootPitchClass,
    tonic: spec.tonic,
  })
  const key = roots[spec.rootPitchClass]?.label
  // The key's names, where it has more than one: D♯ minor is also E♭ minor.
  const type = typeOf(spec.scaleTypeId)
  const names = scaleSpellings(spec.rootPitchClass, type).map((scale) => scale.root.name)
  const motions = useScaleMotions()
  const playing = playingOf(spec, motions)
  const texture = textureOf(spec)
  const textures = scaleTexturesFor(type)
  // The cadence closes a major or minor scale, played plainly, that has come
  // back down to its tonic. Anything else and there is nothing to close.
  const canClose =
    scaleHasCadence(type) &&
    texture === 'single' &&
    playing !== 'contrary' &&
    playing !== 'third' &&
    playing !== 'sixth'
  const closes = canClose && spec.direction !== 'up'
  // An interval is between two hands playing one note each.
  const canSetInterval = spec.hand === 'both' && texture === 'single'
  const intervalInForce: ChromaticInterval = canSetInterval ? (spec.apart ?? 'octave') : 'octave'
  const perBeat: NotesPerBeat = spec.notesPerBeat ?? 1

  return (
    <>
      <OptionGroup>
        <Field label="Scale" htmlFor={typeId}>
          <div className="flex gap-2">
            <div className="w-[4.75rem] shrink-0">
              <Select
                size="sm"
                aria-label="Key"
                value={String(spec.rootPitchClass)}
                // A new key starts under its usual name.
                onChange={(event) =>
                  updateSpec({ rootPitchClass: Number(event.target.value), tonic: undefined })
                }
                options={roots.map((root) => ({ value: String(root.value), label: root.label }))}
              />
            </div>
            <div className="min-w-0 flex-1">
              <Select
                id={typeId}
                size="sm"
                value={spec.scaleTypeId}
                onChange={(event) => updateSpec({ scaleTypeId: event.target.value })}
                options={SCALE_TYPES.map((entry) => ({ value: entry.id, label: entry.name }))}
              />
            </div>
          </div>
        </Field>
        {/* Two keys on the same piano keys are still two keys — other
            signature, other note names — so which one is a choice. Shown
            only for a key that has a twin somebody actually writes in. */}
        {names.length > 1 && key && (
          <Field label="Written as">
            <SegmentedControl
              label="Written as"
              value={key}
              onChange={(tonic) => updateSpec({ tonic })}
              options={names.map((name) => ({ value: name, label: name }))}
            />
          </Field>
        )}
      </OptionGroup>

      <Divider />
      <OptionGroup>
        <Field label="Hands">
          <SegmentedControl
            label="Hands"
            value={spec.hand}
            onChange={(hand) => updateSpec({ hand })}
            options={[
              { value: 'right', label: 'Right' },
              { value: 'left', label: 'Left' },
              { value: 'both', label: 'Both' },
            ]}
          />
        </Field>
        {/* How two hands are set against each other, so asked only of two. */}
        {spec.hand === 'both' && (
          <Field label="Motion" hint={PLAYING_DESCRIPTIONS[playing]}>
            <RadioGrid<ScaleMotion>
              label="Motion"
              columns={2}
              value={playing as ScaleMotion}
              options={SCALE_MOTIONS.map((motion) => {
                const offered = motions.includes(motion)
                return {
                  value: motion,
                  label: SCALE_MOTION_LABELS[motion],
                  disabled: !offered,
                  // A motion the scale cannot take says why, rather than just greying out.
                  title: offered
                    ? undefined
                    : texture === 'single'
                      ? MOTION_UNAVAILABLE[motion]
                      : 'For single notes.',
                }
              })}
              onChange={(motion) => updateSpec(specFor(motion))}
            />
          </Field>
        )}
        {/* A chromatic scale's hands can be set a third or a sixth apart —
            a setting no other scale has, so it shows for that scale only. */}
        {scaleHasIntervals(type) && (
          <Field
            label="Hands apart by"
            htmlFor={apartId}
            hint={canSetInterval ? undefined : 'For both hands, in single notes.'}
          >
            <Select
              id={apartId}
              size="sm"
              value={intervalInForce}
              disabled={!canSetInterval}
              onChange={(event) => updateSpec({ apart: event.target.value as ChromaticInterval })}
              options={CHROMATIC_INTERVALS.map((interval) => ({
                value: interval,
                label: CHROMATIC_INTERVAL_LABELS[interval],
              }))}
            />
          </Field>
        )}
      </OptionGroup>

      <Divider />
      <OptionGroup>
        <Field label="Played in" hint={TEXTURE_DESCRIPTIONS[texture]}>
          <RadioGrid<ScaleTexture>
            label="Played in"
            columns={2}
            value={texture}
            options={SCALE_TEXTURES.map((option) => {
              const offered = textures.includes(option)
              return {
                value: option,
                label: SCALE_TEXTURE_LABELS[option],
                disabled: !offered,
                title: offered ? undefined : TEXTURE_UNAVAILABLE[option],
              }
            })}
            onChange={(next) => updateSpec({ texture: next })}
          />
        </Field>
        {/* How the beat is divided belongs to the scale, not to the tempo: the
            click stays where it is and the scale goes faster under it. */}
        <Field
          label="Notes to a beat"
          hint={
            <>
              {NOTES_PER_BEAT_LABELS[perBeat]}
              {perBeat > 1
                ? ` — the click stays at ${bpm}, and the scale goes ${NOTES_PER_BEAT_WORDS[perBeat]} as fast.`
                : ' — one note to each click.'}
            </>
          }
        >
          <SegmentedControl
            label="Notes to a beat"
            value={String(perBeat)}
            onChange={(next) => updateSpec({ notesPerBeat: Number(next) as NotesPerBeat })}
            options={NOTES_PER_BEAT.map((count) => ({
              value: String(count),
              label: String(count),
            }))}
          />
        </Field>
      </OptionGroup>

      <Divider />
      <OptionGroup>
        <Field label="Direction">
          <SegmentedControl
            label="Direction"
            value={spec.direction}
            onChange={(direction) => updateSpec({ direction })}
            options={SCALE_DIRECTIONS.map((direction) => ({
              value: direction,
              label: DIRECTION_SHORT[direction],
            }))}
          />
        </Field>
        <Field label="Octaves">
          <SegmentedControl
            label="Octaves"
            value={String(spec.octaves)}
            onChange={(octaves) => updateSpec({ octaves: Number(octaves) })}
            options={['1', '2', '3'].map((count) => ({ value: count, label: count }))}
          />
        </Field>
        {/* On, off, or not possible — and which, said in the description
            rather than by a control that has silently stopped responding. */}
        <Switch
          label="End with the cadence"
          description={
            !canClose
              ? 'For a major or minor scale in single notes, the hands moving together.'
              : closes
                ? 'Close the scale with I – IV – V – I.'
                : 'Closes a scale that comes back down. Set the direction to Up & Down.'
          }
          checked={Boolean(spec.cadence) && closes}
          onChange={(cadence) => canClose && updateSpec({ cadence })}
        />
      </OptionGroup>

      <Divider />
      <TheoryLink>Understand this scale</TheoryLink>
    </>
  )
}

/** Settings that go together, in the options panel: a field's gap apart. */
export function OptionGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-3">{children}</div>
}

/** The way from an area's options to the theory of what is on the keys. */
export function TheoryLink({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 self-start text-label text-[var(--ds-accent-text)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-focus-ring)]"
      // The theory is a panel of its own, and takes this one's place.
      onClick={() => panelActions.open('theory')}
    >
      <BookOpen size={15} aria-hidden />
      {children}
    </button>
  )
}

/**
 * A grid of choices, one of which is on — the motions, the ways a scale is
 * played.
 *
 * One Tab stop for the group and arrow keys inside it, the way a radio group
 * works everywhere else; six choices that were each a Tab stop would put the
 * next setting six presses away. The arrows step over a choice that is not on
 * offer, and hovering it says why it is not.
 */
export function RadioGrid<T extends string | number>({
  label,
  value,
  options,
  onChange,
  columns,
}: {
  /** The group's accessible name. A visible label is the `Field` round it. */
  label: string
  value: T
  options: readonly { value: T; label: string; disabled?: boolean; title?: string }[]
  onChange: (value: T) => void
  columns: number
}) {
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const group = event.currentTarget
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0
    if (step === 0) return
    event.preventDefault()
    const offered = options.filter((option) => !option.disabled)
    const index = offered.findIndex((option) => option.value === value)
    const next = offered[(index + step + offered.length) % offered.length]
    if (!next) return
    onChange(next.value)
    // The chosen button is re-rendered as the Tab stop; move focus onto it.
    requestAnimationFrame(() =>
      group.querySelector<HTMLButtonElement>(`[data-value="${String(next.value)}"]`)?.focus(),
    )
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="choice-grid"
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
            disabled={option.disabled}
            title={option.title}
            className={cn('choice', checked && 'choice--on')}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Explore, Learn or Practice, side by side on the bar.
 *
 * It was an icon that opened a menu, and the icon was the only sign of which
 * mode the screen was in. The three are few enough to show.
 */
export function ModeTabs() {
  const mode = useLearningStore((state) => state.mode)
  const setMode = useLearningStore((state) => state.setMode)
  return (
    <BarTabs<LearningMode>
      label="Mode"
      value={mode}
      onChange={setMode}
      options={LEARNING_MODES.map((option) => {
        const Icon = MODE_ICONS[option]
        return {
          value: option,
          label: LEARNING_MODE_LABELS[option],
          icon: <Icon size={18} />,
          description: LEARNING_MODE_DESCRIPTIONS[option],
        }
      })}
    />
  )
}

/** The range the store keeps the target tempo in. */
const MIN_BPM = 30
const MAX_BPM = 208

const NOTES_PER_BEAT_WORDS: Record<NotesPerBeat, string> = {
  1: 'once',
  2: 'twice',
  3: 'three times',
  4: 'four times',
}

/** The target tempo: on the bar, and in Settings for a bar too narrow to hold it. */
export function TempoControl({ className, panel }: { className?: string; panel?: boolean }) {
  const bpm = useLearningStore((state) => state.targetBpm)
  const setTargetBpm = useLearningStore((state) => state.setTargetBpm)
  // A divided beat is part of how fast the scale goes, so the tooltip says it.
  const divided = useLearningStore((state) =>
    state.topic === 'scales' && (state.spec.notesPerBeat ?? 1) > 1
      ? NOTES_PER_BEAT_LABELS[state.spec.notesPerBeat ?? 1].toLowerCase()
      : undefined,
  )
  return (
    <TempoField
      value={bpm}
      min={MIN_BPM}
      max={MAX_BPM}
      onChange={setTargetBpm}
      detail={divided}
      panel={panel}
      className={className}
    />
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
  // What is about to be heard, in the words of the area it is in.
  const what = useLearningStore((state) => EXERCISE_NOUNS[state.exercise?.kind ?? 'scale'])
  const demo = useScaleDemo()
  const playing = demo.status === 'playing'
  // The label is the tooltip too, so a disabled button says why it is off
  // instead of leaving a dead control to be puzzled over.
  const label = running
    ? `Stop the run to hear the ${what}`
    : playing
      ? 'Pause'
      : demo.status === 'paused'
        ? `Resume the ${what}`
        : `Hear the ${what}`

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
 * already yours — so there the button is off, and says why. It keeps its place
 * rather than giving it up: the mode tabs sit to its left, and a button that
 * came and went would slide them out from under the press that changed them.
 */
export function StartButton() {
  const mode = useLearningStore((state) => state.mode)
  const running = useLearningStore((state) => state.session.status === 'running')
  const start = useLearningStore((state) => state.start)
  const reset = useLearningStore((state) => state.reset)

  return (
    <StartStopButton
      running={running}
      onStart={start}
      onStop={reset}
      unavailable={
        mode === 'explore' ? 'Explore is always on: there is nothing to start' : undefined
      }
    />
  )
}

/**
 * The learn-mode Start, as an icon: play to begin, back-to-the-top while the
 * run is going. Both states are the same square, so pressing it does not shift
 * the rest of the bar. Not a stop square: Record, one button along, turns into
 * one while it records, and two of them side by side ask which one ends what.
 * Shared with Songs, whose Learn works the same way.
 */
export function StartStopButton({
  running,
  onStart,
  onStop,
  unavailable,
}: {
  running: boolean
  onStart: () => void
  onStop: () => void
  /** Why there is nothing to start, where there is not. The button's name while it is off. */
  unavailable?: string
}) {
  return running ? (
    <button
      type="button"
      className="bar-start bar-start--icon bar-start--stop"
      aria-label="Stop"
      title="Stop"
      onClick={onStop}
    >
      <RotateCcw size={18} aria-hidden />
    </button>
  ) : (
    <button
      type="button"
      className="bar-start bar-start--icon"
      aria-label={unavailable ?? 'Start'}
      title={unavailable ?? 'Start'}
      disabled={unavailable !== undefined}
      onClick={onStart}
    >
      <Play size={18} aria-hidden />
    </button>
  )
}
