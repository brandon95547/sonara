import * as React from 'react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BookOpen,
  Compass,
  GraduationCap,
  Hand,
  Headphones,
  Minus,
  MoveHorizontal,
  Music,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Rows2,
  Target,
  Timer,
  type LucideIcon,
} from 'lucide-react'
import {
  HAND_LABELS,
  LEARNING_MODE_DESCRIPTIONS,
  LEARNING_MODE_LABELS,
  LEARNING_MODES,
  SCALE_DIRECTION_LABELS,
  SCALE_DIRECTIONS,
  SCALE_MOTION_LABELS,
  SCALE_MOTIONS,
  SCALE_TEXTURE_LABELS,
  SCALE_TEXTURES,
  scaleHasCadence,
  scaleMotionsFor,
  scaleTexturesFor,
  SCALE_TYPES,
  scaleSpellings,
  spellScale,
  type ExerciseKind,
  type LearningMode,
  type ScaleDirection,
  type ScaleMotion,
  type ScaleSpec,
  type ScaleTexture,
} from '@sonara/shared'
import { cn } from '@/lib/cn'
import { Popover, SelectMenu } from '@/ui/Menu'
import { SegmentedControl, Select, Switch } from '@/ui/Controls'
import { useMidi } from '@/midi/MidiProvider'
import { useLearningStore } from '@/state/learning-store'
import { panelActions } from '@/state/panel-store'
import { useMetronome } from '@/audio/use-metronome'
import { playSoundEffect, stopSoundEffect } from '@/audio/sound-effects'
import { useScaleDemo } from './use-scale-demo'
import { MetronomeIcon } from '@/ui/MetronomeIcon'
import { BarGlyph } from '@/ui/BarGlyph'

/**
 * The Scales controls, as they sit in the app bar.
 *
 * Each setting is an icon that shows its value where it can — the key on the
 * scale, "R" on the hand, the arrow pointing the way the scale runs — with the
 * setting and its value spelled out in the tooltip. They used to be buttons
 * naming their values, "Right Hand ▾", and six of those filled the bar.
 *
 * On the left, what is being practised: which scale, which hand, how far,
 * which way. On the right, how: the guidance and the tempo, next to the
 * buttons that act on it.
 *
 * On a screen too narrow for all of them, the three after the scale fold into
 * the scale's own popover (`.bar-wide` / `.popover-compact` in the stylesheet),
 * so every one of them stays one tap away and none is squeezed.
 */

/**
 * Who plays, as one list: a hand on its own, or the two together in one of the
 * ways a scale book sets them against each other.
 *
 * One setting on the bar and two in the spec — a hand and a motion — because a
 * motion only means anything with both hands, and a second menu that is dead
 * two times out of three is a menu to be puzzled over.
 */
type Playing = 'right' | 'left' | ScaleMotion

const PLAYING: readonly Playing[] = ['right', 'left', ...SCALE_MOTIONS]

const PLAYING_LABELS: Record<Playing, string> = {
  right: HAND_LABELS.right,
  left: HAND_LABELS.left,
  similar: HAND_LABELS.both,
  contrary: SCALE_MOTION_LABELS.contrary,
  third: SCALE_MOTION_LABELS.third,
  sixth: SCALE_MOTION_LABELS.sixth,
}

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
  'double-thirds': 'Each note with the third above it, in the same hand.',
  'staccato-octaves': 'Each note with its octave, detached: thumb and little finger.',
  'legato-octaves': 'Each note with its octave, joined: the 4th finger takes the black keys.',
}

const TEXTURE_BADGES: Record<ScaleTexture, string> = {
  single: '1',
  'double-thirds': '3',
  'staccato-octaves': 'S8',
  'legato-octaves': 'L8',
}

const typeOf = (scaleTypeId: string) =>
  SCALE_TYPES.find((type) => type.id === scaleTypeId) ?? SCALE_TYPES[0]!

/** The texture in force: the one chosen, where the scale can be played that way. */
const textureOf = (spec: ScaleSpec): ScaleTexture =>
  spec.texture && scaleTexturesFor(typeOf(spec.scaleTypeId)).includes(spec.texture)
    ? spec.texture
    : 'single'

/** The setting, as the bar's badge says it. Both is both letters, in keyboard order. */
const PLAYING_BADGES: Record<Playing, string> = {
  right: 'R',
  left: 'L',
  similar: 'LR',
  // Plain characters: an arrow glyph at this size is two dots.
  contrary: '<>',
  third: '3rd',
  sixth: '6th',
}

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

/** The arrow is the value: it points the way the scale runs. */
const DIRECTION_ICONS: Record<ScaleDirection, LucideIcon> = {
  up: ArrowUp,
  down: ArrowDown,
  'up-down': ArrowUpDown,
}

/** What an exercise is called in a sentence: "Hear the scale", "the arpeggio". */
export const EXERCISE_NOUNS: Record<ExerciseKind, string> = {
  scale: 'scale',
  chord: 'chords',
  arpeggio: 'arpeggio',
  progression: 'progression',
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
  useMetronome(metronome, bpm)

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

export function ScalePicker() {
  const title = useLearningStore((state) => state.exercise?.title ?? 'Choose a scale')
  const spec = useLearningStore((state) => state.spec)
  const updateSpec = useLearningStore((state) => state.updateSpec)
  const [open, setOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const close = React.useCallback(() => setOpen(false), [])
  const roots = rootOptions(spec.scaleTypeId, {
    pitchClass: spec.rootPitchClass,
    tonic: spec.tonic,
  })
  const key = roots[spec.rootPitchClass]?.label
  // The key's names, where it has more than one: D♯ minor is also E♭ minor.
  const type = SCALE_TYPES.find((entry) => entry.id === spec.scaleTypeId) ?? SCALE_TYPES[0]!
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

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="bar-icon-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Scale: ${title}`}
        title={`Scale: ${title}`}
        onClick={() => setOpen((current) => !current)}
      >
        <BarGlyph icon={<Music size={18} />} badge={key} />
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
            // A new key starts under its usual name.
            onChange={(rootPitchClass) => updateSpec({ rootPitchClass, tonic: undefined })}
          />
          {/* Two keys on the same piano keys are still two keys — other
              signature, other note names — so which one is a choice. Shown
              only for a key that has a twin somebody actually writes in. */}
          {names.length > 1 && key && (
            <CompactField label="Written as">
              <SegmentedControl
                label="Written as"
                value={key}
                onChange={(tonic) => updateSpec({ tonic })}
                options={names.map((name) => ({ value: name, label: name }))}
              />
            </CompactField>
          )}
          <RadioGrid
            label="Scale type"
            columns={2}
            value={spec.scaleTypeId}
            options={SCALE_TYPES.map((type) => ({ value: type.id, label: type.name }))}
            onChange={(scaleTypeId) => updateSpec({ scaleTypeId })}
          />
          {/* On, off, or not possible — and which, said in the description
              rather than by a control that has silently stopped responding. */}
          <Switch
            label="End with the cadence"
            description={
              !canClose
                ? 'For a major or minor scale in single notes, the hands moving together.'
                : closes
                  ? 'Close the scale with I – IV – V – I.'
                  : 'Closes a scale that comes back down. Set the direction to Up then Down.'
            }
            checked={Boolean(spec.cadence) && closes}
            onChange={(cadence) => canClose && updateSpec({ cadence })}
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
                  { value: 'both', label: 'Both' },
                ]}
              />
            </CompactField>
            {spec.hand === 'both' && (
              <CompactField label="Motion">
                <Select
                  size="sm"
                  aria-label="Motion"
                  value={playing}
                  onChange={(event) => updateSpec(specFor(event.target.value as Playing))}
                  options={SCALE_MOTIONS.map((motion) => ({
                    value: motion,
                    label: SCALE_MOTION_LABELS[motion],
                    disabled: !motions.includes(motion),
                  }))}
                />
              </CompactField>
            )}
            <CompactField label="Played in">
              <Select
                size="sm"
                aria-label="Played in"
                value={texture}
                onChange={(event) => updateSpec({ texture: event.target.value as ScaleTexture })}
                options={SCALE_TEXTURES.map((option) => ({
                  value: option,
                  label: SCALE_TEXTURE_LABELS[option],
                  disabled: !textures.includes(option),
                }))}
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

export function CompactField({ label, children }: { label: string; children: React.ReactNode }) {
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
export function RadioGrid<T extends string | number>({
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
  const spec = useLearningStore((state) => state.spec)
  const updateSpec = useLearningStore((state) => state.updateSpec)
  const motions = useScaleMotions()
  const playing = playingOf(spec, motions)
  return (
    <SelectMenu<Playing>
      label="Hands"
      value={playing}
      options={PLAYING.map((option) => {
        const offered = option === 'right' || option === 'left' || motions.includes(option)
        return {
          value: option,
          label: PLAYING_LABELS[option],
          // A motion the scale cannot take says why, rather than just greying out.
          description: offered
            ? PLAYING_DESCRIPTIONS[option]
            : textureOf(spec) === 'single'
              ? MOTION_UNAVAILABLE[option as ScaleMotion]
              : 'For single notes.',
          disabled: !offered,
        }
      })}
      onChange={(next) => updateSpec(specFor(next))}
      iconOnly
      icon={<BarGlyph icon={<Hand size={18} />} badge={PLAYING_BADGES[playing]} />}
      className="bar-wide"
    />
  )
}

/** What each hand plays: single notes, thirds, or octaves. */
export function TextureMenu() {
  const spec = useLearningStore((state) => state.spec)
  const updateSpec = useLearningStore((state) => state.updateSpec)
  const texture = textureOf(spec)
  const textures = scaleTexturesFor(typeOf(spec.scaleTypeId))
  return (
    <SelectMenu<ScaleTexture>
      label="Played in"
      value={texture}
      options={SCALE_TEXTURES.map((option) => {
        const offered = textures.includes(option)
        return {
          value: option,
          label: SCALE_TEXTURE_LABELS[option],
          description: offered ? TEXTURE_DESCRIPTIONS[option] : 'For major scales.',
          disabled: !offered,
        }
      })}
      onChange={(next) => updateSpec({ texture: next })}
      iconOnly
      icon={<BarGlyph icon={<Rows2 size={18} />} badge={TEXTURE_BADGES[texture]} />}
      className="bar-wide"
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
      iconOnly
      icon={<BarGlyph icon={<MoveHorizontal size={18} />} badge={String(octaves)} />}
      className="bar-wide"
    />
  )
}

export function DirectionMenu() {
  const direction = useLearningStore((state) => state.spec.direction)
  const updateSpec = useLearningStore((state) => state.updateSpec)
  const Arrow = DIRECTION_ICONS[direction]
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
      iconOnly
      icon={<Arrow size={18} aria-hidden />}
      className="bar-wide"
    />
  )
}

export function GuidanceMenu() {
  const mode = useLearningStore((state) => state.mode)
  const setMode = useLearningStore((state) => state.setMode)
  const Icon = MODE_ICONS[mode]
  return (
    <SelectMenu<LearningMode>
      label="Mode"
      value={mode}
      options={LEARNING_MODES.map((option) => ({
        value: option,
        label: LEARNING_MODE_LABELS[option],
        description: LEARNING_MODE_DESCRIPTIONS[option],
      }))}
      onChange={setMode}
      iconOnly
      icon={<Icon size={18} aria-hidden />}
      align="end"
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

const MIN_BPM = 30
const MAX_BPM = 208

/**
 * The target tempo, behind one icon.
 *
 * It was a − 72 BPM + stepper in the bar, the widest thing in it for a setting
 * touched once a run. Now the number rides on the icon, and the panel it opens
 * has room for a slider as well — a jump from 60 to 120 was fifteen clicks.
 */
export function TempoButton({ className }: { className?: string }) {
  const bpm = useLearningStore((state) => state.targetBpm)
  const setTargetBpm = useLearningStore((state) => state.setTargetBpm)
  const [open, setOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const close = React.useCallback(() => setOpen(false), [])
  const label = `Tempo: ${bpm} BPM`
  const percent = ((bpm - MIN_BPM) / (MAX_BPM - MIN_BPM)) * 100

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={cn('bar-icon-button', className)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((current) => !current)}
      >
        <BarGlyph icon={<Timer size={18} />} badge={String(bpm)} />
      </button>
      <Popover
        open={open}
        onClose={close}
        anchorRef={triggerRef}
        align="end"
        label="Tempo"
        className="popover--tempo"
      >
        <div className="flex flex-col gap-4 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-label text-[var(--ds-fg-secondary)]">Target tempo</span>
            <TempoStepper className="tempo-stepper--panel" />
          </div>
          <input
            type="range"
            min={MIN_BPM}
            max={MAX_BPM}
            value={bpm}
            aria-label="Target tempo"
            aria-valuetext={`${bpm} BPM`}
            data-autofocus
            onChange={(event) => setTargetBpm(Number(event.target.value))}
            className="sonara-slider"
            style={{ '--slider-from': '0%', '--slider-to': `${percent}%` } as React.CSSProperties}
          />
          <div className="flex justify-between text-caption text-[var(--ds-fg-muted)]" data-tabular>
            <span>{MIN_BPM}</span>
            <span>{MAX_BPM}</span>
          </div>
        </div>
      </Popover>
    </>
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

  return <StartStopButton running={running} onStart={start} onStop={reset} />
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
}: {
  running: boolean
  onStart: () => void
  onStop: () => void
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
      aria-label="Start"
      title="Start"
      onClick={onStart}
    >
      <Play size={18} aria-hidden />
    </button>
  )
}
