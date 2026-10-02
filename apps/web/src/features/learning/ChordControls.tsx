import * as React from 'react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BookOpen,
  Dumbbell,
  Hand,
  Layers,
  ListOrdered,
  Music,
  Route,
  Rows3,
  type LucideIcon,
} from 'lucide-react'
import {
  ARPEGGIO_CHORDS,
  CADENCE_DOMINANTS,
  CADENCE_FORM_LABELS,
  CADENCE_FORMS,
  CADENCE_POSITION_NAMES,
  CHORD_FORMS,
  CHORD_KIND_LABELS,
  CHORD_STYLE_LABELS,
  CHORD_STYLES,
  chordStylesFor,
  chordPositionName,
  findScaleType,
  HAND_LABELS,
  KEY_MODE_LABELS,
  KEY_MODES,
  PROGRESSION_TYPE_DESCRIPTIONS,
  PROGRESSION_TYPE_LABELS,
  PROGRESSION_TYPES,
  ROUTINE_DESCRIPTIONS,
  ROUTINE_LABELS,
  routineHands,
  routineHasMode,
  ROUTINES,
  SCALE_DIRECTION_LABELS,
  SCALE_DIRECTIONS,
  SCALE_HANDS,
  scaleSpellings,
  SCALE_TYPES,
  spellScale,
  type ArpeggioChord,
  type CadenceDominant,
  type CadenceForm,
  type CadenceSpec,
  type ChordForm,
  type ChordStyle,
  type KeyMode,
  type ProgressionType,
  type Routine,
  type ScaleDirection,
  type ScaleHands,
} from '@sonara/shared'
import { Popover, SelectMenu } from '@/ui/Menu'
import { SegmentedControl, Select } from '@/ui/Controls'
import { BarGlyph } from '@/ui/BarGlyph'
import { useLearningStore } from '@/state/learning-store'
import { pageActions } from '@/state/page-store'
import { panelActions } from '@/state/panel-store'
import { THEORY_TITLES } from '@/features/theory/KeyTheoryDrawer'
import { CompactField, RadioGrid } from './ScaleControls'

/**
 * The Chords, Arpeggios and Progressions controls, as they sit in the app bar.
 *
 * Built the way the Scales controls are, so the areas read as one
 * instrument: the key first, behind an icon that carries its name; then what
 * is played and which hand plays it, each an icon with its value on a badge.
 * On a narrow screen everything after the key folds into the key's own
 * popover.
 */

type Area = 'chords' | 'arpeggios' | 'progressions' | 'exercises'

/** The area's settings and the action that changes them, whichever area it is. */
function useKey(area: Area) {
  const chord = useLearningStore((state) => state.chordSpec)
  const arpeggio = useLearningStore((state) => state.arpeggioSpec)
  // Progressions keeps a spec for each of its types. Cadences is the only one
  // so far; the next adds its own here, chosen by the type the area is on.
  const cadence = useLearningStore((state) => state.cadenceSpec)
  const routine = useLearningStore((state) => state.routineSpec)
  const updateChord = useLearningStore((state) => state.updateChordSpec)
  const updateArpeggio = useLearningStore((state) => state.updateArpeggioSpec)
  const updateCadence = useLearningStore((state) => state.updateCadenceSpec)
  const updateRoutine = useLearningStore((state) => state.updateRoutineSpec)
  const spec = {
    chords: chord,
    arpeggios: arpeggio,
    progressions: cadence,
    exercises: routine,
  }[area]
  // The fields the areas share. Each action takes its own area's patch; a key,
  // a mode and a hand are part of all of them.
  const update = {
    chords: updateChord,
    arpeggios: updateArpeggio,
    progressions: updateCadence,
    exercises: updateRoutine,
  }[area] as (patch: {
    rootPitchClass?: number
    tonic?: string
    mode?: KeyMode
    hand?: ScaleHands
  }) => void
  return { spec, update }
}

/** The scale a key's notes are spelled from: its harmonic form, in a minor key. */
const keyScale = (mode: KeyMode) =>
  findScaleType(mode === 'major' ? 'major' : 'harmonic-minor') ?? SCALE_TYPES[0]!

const HAND_BADGES: Record<ScaleHands, string> = { right: 'R', left: 'L', both: 'LR' }
const HAND_OPTIONS = SCALE_HANDS.map((hand) => ({ value: hand, label: HAND_LABELS[hand] }))

const KIND_BADGES: Record<ChordForm, string> = {
  triad: '3',
  'four-note': '4',
  seventh: '7',
  'key-triads': 'Key',
}
const STYLE_BADGES: Record<ChordStyle, string> = {
  solid: 'S',
  broken: 'B',
  'broken-alternate': 'Alt',
}

const ARPEGGIO_CHORD_LABELS: Record<ArpeggioChord, string> = {
  triad: 'Triad',
  seventh: 'Seventh Chord',
}

/** What the seventh chord of a key is: dominant in a major key, diminished in a minor. */
const seventhName = (mode: KeyMode) =>
  mode === 'major' ? 'Dominant seventh' : 'Diminished seventh'

const DIRECTION_SHORT: Record<ScaleDirection, string> = {
  up: 'Ascending',
  down: 'Descending',
  'up-down': 'Up then Down',
}
const DIRECTION_ICONS: Record<ScaleDirection, LucideIcon> = {
  up: ArrowUp,
  down: ArrowDown,
  'up-down': ArrowUpDown,
}

/** The positions an arpeggio can start from: three for a triad, four for a seventh. */
const positionsOf = (chord: ArpeggioChord) => (chord === 'triad' ? [0, 1, 2] : [0, 1, 2, 3])
const POSITION_BADGES = ['R', '1', '2', '3']

/**
 * The key: its tonic, major or minor, and which name it is written under.
 *
 * `children` is the rest of the area's bar, for when the bar is too narrow to
 * hold it.
 */
function KeyPicker({
  area,
  children,
  hands = true,
  modes = true,
}: {
  area: Area
  children: React.ReactNode
  /** False where the setting above it has already decided which hands play. */
  hands?: boolean
  /** False where what is played is built on a note rather than in a key. */
  modes?: boolean
}) {
  const { spec, update } = useKey(area)
  const title = useLearningStore((state) => state.exercise?.title ?? 'Choose a key')
  const kind = useLearningStore((state) => state.exercise?.kind)
  const [open, setOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const close = React.useCallback(() => setOpen(false), [])

  // Built on a note, it is named as the major key on that note is.
  const mode: KeyMode = modes ? spec.mode : 'major'
  const type = keyScale(mode)
  const roots = Array.from({ length: 12 }, (_, pitchClass) => ({
    value: pitchClass,
    label: spellScale(pitchClass, type, pitchClass === spec.rootPitchClass ? spec.tonic : undefined)
      .root.name,
  }))
  const key = roots[spec.rootPitchClass]?.label ?? ''
  const names = scaleSpellings(spec.rootPitchClass, type).map((scale) => scale.root.name)
  const what = modes ? 'Key' : 'Root'
  const label = `${what}: ${key}${modes ? ` ${KEY_MODE_LABELS[mode]}` : ''} — ${title}`

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="bar-icon-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((current) => !current)}
      >
        {/* `Am`, the way a chord chart writes a minor key. */}
        <BarGlyph icon={<Music size={18} />} badge={mode === 'minor' ? `${key}m` : key} />
      </button>
      <Popover
        open={open}
        onClose={close}
        anchorRef={triggerRef}
        label={what}
        className="popover--scale"
      >
        <div className="flex flex-col gap-4 p-4">
          <RadioGrid
            label={what}
            columns={6}
            value={spec.rootPitchClass}
            options={roots}
            // A new key starts under its usual name.
            onChange={(rootPitchClass) => update({ rootPitchClass, tonic: undefined })}
          />
          {modes && (
            <CompactField label="Major or minor">
              <SegmentedControl<KeyMode>
                label="Major or minor"
                value={spec.mode}
                // The other mode on the same tonic is a different key, with its
                // own names: D♯ minor's major is E♭.
                onChange={(next) => update({ mode: next, tonic: undefined })}
                options={KEY_MODES.map((option) => ({
                  value: option,
                  label: KEY_MODE_LABELS[option],
                }))}
              />
            </CompactField>
          )}
          {names.length > 1 && (
            <CompactField label="Written as">
              <SegmentedControl
                label="Written as"
                value={key}
                onChange={(tonic) => update({ tonic })}
                options={names.map((name) => ({ value: name, label: name }))}
              />
            </CompactField>
          )}

          {/* The rest of the bar, for when the bar is too narrow to hold it. */}
          <div className="popover-compact flex flex-col gap-3 border-t border-[var(--ds-border-subtle)] pt-4">
            {children}
            {hands && (
              <CompactField label="Hand">
                <SegmentedControl<ScaleHands>
                  label="Hand"
                  value={spec.hand}
                  onChange={(hand) => update({ hand })}
                  options={[
                    { value: 'right', label: 'Right' },
                    { value: 'left', label: 'Left' },
                    { value: 'both', label: 'Both' },
                  ]}
                />
              </CompactField>
            )}
          </div>

          {kind && (
            <button
              type="button"
              className="inline-flex items-center gap-2 self-start text-label-sm text-[var(--ds-accent-text)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-focus-ring)]"
              onClick={() => {
                setOpen(false)
                panelActions.open('theory')
              }}
            >
              <BookOpen size={15} aria-hidden />
              {THEORY_TITLES[kind]}
            </button>
          )}
        </div>
      </Popover>
    </>
  )
}

function HandsMenu({ area }: { area: Area }) {
  const { spec, update } = useKey(area)
  return (
    <SelectMenu<ScaleHands>
      label="Hands"
      value={spec.hand}
      options={HAND_OPTIONS}
      onChange={(hand) => update({ hand })}
      iconOnly
      icon={<BarGlyph icon={<Hand size={18} />} badge={HAND_BADGES[spec.hand]} />}
      className="bar-wide"
    />
  )
}

/** The left of the bar in the Chords area. */
export function ChordSettings() {
  const spec = useLearningStore((state) => state.chordSpec)
  const update = useLearningStore((state) => state.updateChordSpec)
  const kindLabel = (kind: ChordForm) =>
    kind === 'seventh' ? seventhName(spec.mode) : CHORD_KIND_LABELS[kind]
  // The style in force: a chord that cannot be broken the alternate way is
  // broken the plain way, and the control says so rather than lying.
  const styles = chordStylesFor(spec.chord)
  const style: ChordStyle = styles.includes(spec.style) ? spec.style : 'broken'
  const playedHelp =
    spec.chord === 'key-triads'
      ? 'A note at a time. With both hands, the left plays each chord and the right answers.'
      : 'A note at a time, up through the positions and back.'

  return (
    <>
      <KeyPicker area="chords">
        <CompactField label="Chord">
          <Select
            size="sm"
            aria-label="Chord"
            value={spec.chord}
            onChange={(event) => update({ chord: event.target.value as ChordForm })}
            options={CHORD_FORMS.map((kind) => ({ value: kind, label: kindLabel(kind) }))}
          />
        </CompactField>
        <CompactField label="Played">
          <Select
            size="sm"
            aria-label="Played"
            value={style}
            onChange={(event) => update({ style: event.target.value as ChordStyle })}
            options={CHORD_STYLES.map((option) => ({
              value: option,
              label: CHORD_STYLE_LABELS[option],
              disabled: !styles.includes(option),
            }))}
          />
        </CompactField>
      </KeyPicker>
      <SelectMenu<ChordForm>
        label="Chord"
        value={spec.chord}
        options={CHORD_FORMS.map((kind) => ({
          value: kind,
          label: kindLabel(kind),
          description:
            kind === 'triad'
              ? 'Three notes: root position and both inversions.'
              : kind === 'four-note'
                ? 'The triad with its octave added.'
                : kind === 'seventh'
                  ? 'Root position and three inversions.'
                  : 'The triad on every note of the scale, up to the octave.',
        }))}
        onChange={(chord) => update({ chord })}
        iconOnly
        icon={<BarGlyph icon={<Layers size={18} />} badge={KIND_BADGES[spec.chord]} />}
        className="bar-wide"
      />
      <SelectMenu<ChordStyle>
        label="Played"
        value={style}
        options={[
          { value: 'solid', label: 'Solid', description: 'Every note of the chord together.' },
          {
            value: 'broken',
            label: 'Broken',
            description: playedHelp,
          },
          {
            value: 'broken-alternate',
            label: CHORD_STYLE_LABELS['broken-alternate'],
            description: styles.includes('broken-alternate')
              ? 'Bottom, third note, second, top: the hand rocks instead of running.'
              : 'For four-note chords.',
            disabled: !styles.includes('broken-alternate'),
          },
        ]}
        onChange={(next) => update({ style: next })}
        iconOnly
        icon={<BarGlyph icon={<Rows3 size={18} />} badge={STYLE_BADGES[style]} />}
        className="bar-wide"
      />
      <HandsMenu area="chords" />
    </>
  )
}

/** The left of the bar in the Arpeggios area. */
export function ArpeggioSettings() {
  const spec = useLearningStore((state) => state.arpeggioSpec)
  const update = useLearningStore((state) => state.updateArpeggioSpec)
  const positions = positionsOf(spec.chord)
  const toneCount = positions.length
  // A triad has no third inversion; asked for one, it plays the root position.
  const position = spec.position % toneCount
  const chordLabel = (chord: ArpeggioChord) =>
    chord === 'seventh' ? seventhName(spec.mode) : ARPEGGIO_CHORD_LABELS[chord]
  const Arrow = DIRECTION_ICONS[spec.direction]

  return (
    <>
      <KeyPicker area="arpeggios">
        <CompactField label="Chord">
          <SegmentedControl<ArpeggioChord>
            label="Chord"
            value={spec.chord}
            onChange={(chord) => update({ chord })}
            options={ARPEGGIO_CHORDS.map((chord) => ({
              value: chord,
              label: chord === 'triad' ? 'Triad' : 'Seventh',
            }))}
          />
        </CompactField>
        <CompactField label="Position">
          <Select
            size="sm"
            aria-label="Position"
            value={String(position)}
            onChange={(event) => update({ position: Number(event.target.value) })}
            options={positions.map((at) => ({
              value: String(at),
              label: chordPositionName(toneCount, at),
            }))}
          />
        </CompactField>
        <CompactField label="Direction">
          <SegmentedControl<ScaleDirection>
            label="Direction"
            value={spec.direction}
            onChange={(direction) => update({ direction })}
            options={SCALE_DIRECTIONS.map((direction) => ({
              value: direction,
              label: direction === 'up-down' ? 'Up & down' : DIRECTION_SHORT[direction],
            }))}
          />
        </CompactField>
      </KeyPicker>
      <SelectMenu<ArpeggioChord>
        label="Chord"
        value={spec.chord}
        options={ARPEGGIO_CHORDS.map((chord) => ({ value: chord, label: chordLabel(chord) }))}
        onChange={(chord) => update({ chord })}
        iconOnly
        icon={<BarGlyph icon={<Layers size={18} />} badge={spec.chord === 'triad' ? '3' : '7'} />}
        className="bar-wide"
      />
      <SelectMenu<number>
        label="Position"
        value={position}
        options={positions.map((at) => ({ value: at, label: chordPositionName(toneCount, at) }))}
        onChange={(next) => update({ position: next })}
        iconOnly
        icon={<BarGlyph icon={<ListOrdered size={18} />} badge={POSITION_BADGES[position]} />}
        className="bar-wide"
      />
      <HandsMenu area="arpeggios" />
      <SelectMenu<ScaleDirection>
        label="Direction"
        value={spec.direction}
        options={SCALE_DIRECTIONS.map((option) => ({
          value: option,
          label: DIRECTION_SHORT[option],
          description: SCALE_DIRECTION_LABELS[option],
        }))}
        onChange={(direction) => update({ direction })}
        iconOnly
        icon={<Arrow size={18} aria-hidden />}
        className="bar-wide"
      />
    </>
  )
}

/*
 * How the cadence is laid out between the hands — the bar calls it Voicing.
 *
 * It was labelled Cadence, which said nothing the area's name had not, and
 * its first option is Three Positions, right beside a setting called Position.
 * Two controls that both sounded like "position" read as one choice made
 * twice. Position is the inversion the tonic chord starts in; this is who
 * plays the chords and who plays the roots.
 */
const FORM_BADGES: Record<CadenceForm, string> = {
  positions: '3',
  'root-in-bass': 'B',
  'root-in-treble': 'T',
}
const FORM_DESCRIPTIONS: Record<CadenceForm, string> = {
  positions: 'The chords in both hands, from each position of the tonic.',
  'root-in-bass': 'Right hand on the chords, left hand on the root of each.',
  'root-in-treble': 'Left hand on the chords, right hand on the root of each.',
}

type CadencePosition = CadenceSpec['position']
const POSITION_OPTIONS: readonly { value: CadencePosition; label: string; badge: string }[] = [
  { value: 'all', label: 'All Three', badge: 'All' },
  ...CADENCE_POSITION_NAMES.map((label, index) => ({
    value: index as CadencePosition,
    label,
    badge: POSITION_BADGES[index]!,
  })),
]

const DOMINANT_LABELS: Record<CadenceDominant, string> = {
  V: 'Dominant triad',
  V7: 'Dominant seventh',
}

/** What the bar's badge calls each type of progression, at badge size. */
const PROGRESSION_TYPE_BADGES: Record<ProgressionType, string> = {
  cadences: 'Cad',
}

/**
 * The left of the bar in the Progressions area.
 *
 * Progressions is a category: what is practised in it is one of its types, and
 * each type brings its own settings. So the bar opens with the type, and the
 * rest of it is whatever that type needs — a type added later adds its own
 * settings here and leaves the others alone.
 */
export function ProgressionSettings() {
  const type = useLearningStore((state) => state.progressionType)

  return (
    <>
      <SelectMenu<ProgressionType>
        label="Progression"
        value={type}
        options={PROGRESSION_TYPES.map((option) => ({
          value: option,
          label: PROGRESSION_TYPE_LABELS[option],
          description: PROGRESSION_TYPE_DESCRIPTIONS[option],
        }))}
        // Through the address, so the type survives a reload and Back undoes it.
        onChange={pageActions.openProgression}
        iconOnly
        icon={<BarGlyph icon={<Route size={18} />} badge={PROGRESSION_TYPE_BADGES[type]} />}
        className="bar-wide"
      />
      {type === 'cadences' && <CadenceSettings />}
    </>
  )
}

/** The type, for the key's popover: where the bar's own menu goes when it folds. */
function ProgressionTypeField() {
  const type = useLearningStore((state) => state.progressionType)
  return (
    <CompactField label="Progression">
      <Select
        size="sm"
        aria-label="Progression"
        value={type}
        onChange={(event) => pageActions.openProgression(event.target.value as ProgressionType)}
        options={PROGRESSION_TYPES.map((option) => ({
          value: option,
          label: PROGRESSION_TYPE_LABELS[option],
        }))}
      />
    </CompactField>
  )
}

/** Cadences: the settings of the first type of progression. */
function CadenceSettings() {
  const spec = useLearningStore((state) => state.cadenceSpec)
  const update = useLearningStore((state) => state.updateCadenceSpec)
  // The rooted forms are two-handed by nature and play one position, with both
  // dominants in turn: those three settings belong to the three positions only.
  const positions = spec.form === 'positions'
  const position = POSITION_OPTIONS.find((option) => option.value === spec.position)!
  const notForThis = `For ${CADENCE_FORM_LABELS.positions}.`

  return (
    <>
      <KeyPicker area="progressions" hands={positions}>
        <ProgressionTypeField />
        <CompactField label="Voicing">
          <Select
            size="sm"
            aria-label="Voicing"
            value={spec.form}
            onChange={(event) => update({ form: event.target.value as CadenceForm })}
            options={CADENCE_FORMS.map((form) => ({
              value: form,
              label: CADENCE_FORM_LABELS[form],
            }))}
          />
        </CompactField>
        {positions && (
          <>
            <CompactField label="Position">
              <Select
                size="sm"
                aria-label="Position"
                value={String(spec.position)}
                onChange={(event) =>
                  update({
                    position:
                      event.target.value === 'all'
                        ? 'all'
                        : (Number(event.target.value) as CadencePosition),
                  })
                }
                options={POSITION_OPTIONS.map((option) => ({
                  value: String(option.value),
                  label: option.label,
                }))}
              />
            </CompactField>
            <CompactField label="Dominant">
              <SegmentedControl<CadenceDominant>
                label="Dominant"
                value={spec.dominant}
                onChange={(dominant) => update({ dominant })}
                options={CADENCE_DOMINANTS.map((chord) => ({
                  value: chord,
                  label: chord,
                }))}
              />
            </CompactField>
          </>
        )}
      </KeyPicker>
      <SelectMenu<CadenceForm>
        label="Voicing"
        value={spec.form}
        options={CADENCE_FORMS.map((form) => ({
          value: form,
          label: CADENCE_FORM_LABELS[form],
          description: FORM_DESCRIPTIONS[form],
        }))}
        onChange={(form) => update({ form })}
        iconOnly
        icon={<BarGlyph icon={<Layers size={18} />} badge={FORM_BADGES[spec.form]} />}
        className="bar-wide"
      />
      <SelectMenu<CadencePosition>
        label="Position"
        value={spec.position}
        options={POSITION_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label,
          description: positions
            ? option.value === 'all'
              ? 'The cadence from each position of the tonic chord, in turn.'
              : undefined
            : notForThis,
          disabled: !positions,
        }))}
        onChange={(next) => update({ position: next })}
        iconOnly
        icon={
          <BarGlyph icon={<ListOrdered size={18} />} badge={positions ? position.badge : 'R'} />
        }
        className="bar-wide"
      />
      <SelectMenu<CadenceDominant>
        label="Dominant"
        value={spec.dominant}
        options={CADENCE_DOMINANTS.map((chord) => ({
          value: chord,
          label: DOMINANT_LABELS[chord],
          description: positions
            ? chord === 'V'
              ? 'I – IV – I – V – I.'
              : 'I – IV – I – V7 – I.'
            : 'This form plays both: V, then V7.',
          disabled: !positions,
        }))}
        onChange={(dominant) => update({ dominant })}
        iconOnly
        icon={<BarGlyph icon={<Rows3 size={18} />} badge={positions ? spec.dominant : 'V·7'} />}
        className="bar-wide"
      />
      {positions && <HandsMenu area="progressions" />}
    </>
  )
}

/** What the bar's badge calls each routine: a word's worth, at badge size. */
const ROUTINE_BADGES: Record<Routine, string> = {
  blocked: 'Blk',
  'expanding-1': 'Ex1',
  'expanding-2': 'Ex2',
  accelerating: 'Acc',
  'grand-form': 'GF',
  'harmonized-bass': 'HB',
  'harmonized-treble': 'HT',
  'triad-chain': 'TC',
}

/** The left of the bar in the Exercises area. */
export function ExerciseSettings() {
  const spec = useLearningStore((state) => state.routineSpec)
  const update = useLearningStore((state) => state.updateRoutineSpec)
  // A routine written for two hands is played with two, whatever was last
  // chosen; the choice is kept for the routines that have one.
  const choosesHand = routineHands(spec.routine).length > 1

  return (
    <>
      <KeyPicker area="exercises" hands={choosesHand} modes={routineHasMode(spec.routine)}>
        <CompactField label="Routine">
          <Select
            size="sm"
            aria-label="Routine"
            value={spec.routine}
            onChange={(event) => update({ routine: event.target.value as Routine })}
            options={ROUTINES.map((routine) => ({
              value: routine,
              label: ROUTINE_LABELS[routine],
            }))}
          />
        </CompactField>
      </KeyPicker>
      <SelectMenu<Routine>
        label="Routine"
        value={spec.routine}
        options={ROUTINES.map((routine) => ({
          value: routine,
          label: ROUTINE_LABELS[routine],
          description: ROUTINE_DESCRIPTIONS[routine],
        }))}
        onChange={(routine) => update({ routine })}
        iconOnly
        icon={<BarGlyph icon={<Dumbbell size={18} />} badge={ROUTINE_BADGES[spec.routine]} />}
        className="bar-wide"
      />
      {choosesHand ? (
        <HandsMenu area="exercises" />
      ) : (
        <SelectMenu<ScaleHands>
          label="Hands"
          value="both"
          options={HAND_OPTIONS.map((option) => ({
            ...option,
            description:
              option.value === 'both' ? 'This routine is written for two hands.' : undefined,
            disabled: option.value !== 'both',
          }))}
          onChange={() => {}}
          iconOnly
          icon={<BarGlyph icon={<Hand size={18} />} badge={HAND_BADGES.both} />}
          className="bar-wide"
        />
      )}
    </>
  )
}
