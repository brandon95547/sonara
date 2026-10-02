import * as React from 'react'
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
  SCALE_DIRECTIONS,
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
import { Field, SegmentedControl, Select } from '@/ui/Controls'
import { Divider } from '@/ui/Display'
import { useLearningStore } from '@/state/learning-store'
import { pageActions } from '@/state/page-store'
import { THEORY_TITLES } from '@/features/theory/KeyTheoryDrawer'
import { DIRECTION_SHORT, OptionGroup, TheoryLink } from './ScaleControls'

/**
 * The Chords, Arpeggios, Progressions and Exercises options, for the panel the
 * bar's Options button opens.
 *
 * Built the way the Scales options are, so the areas read as one instrument:
 * what is played first, then the key it is played in, then which hand plays
 * it. Each setting is a field with its name over it, and the ones whose
 * choices need a sentence say it under the field, for the choice that is made.
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

const HAND_OPTIONS: readonly { value: ScaleHands; label: string }[] = [
  { value: 'right', label: 'Right' },
  { value: 'left', label: 'Left' },
  { value: 'both', label: 'Both' },
]

/** What each kind of chord is, said under the field that chooses it. */
const KIND_DESCRIPTIONS: Record<ChordForm, string> = {
  triad: 'Three notes: root position and both inversions.',
  'four-note': 'The triad with its octave added.',
  seventh: 'Root position and three inversions.',
  'key-triads': 'The triad on every note of the scale, up to the octave.',
}

const ARPEGGIO_CHORD_LABELS: Record<ArpeggioChord, string> = {
  triad: 'Triad',
  seventh: 'Seventh Chord',
}

/** What the seventh chord of a key is: dominant in a major key, diminished in a minor. */
const seventhName = (mode: KeyMode) =>
  mode === 'major' ? 'Dominant seventh' : 'Diminished seventh'

/** The positions an arpeggio can start from: three for a triad, four for a seventh. */
const positionsOf = (chord: ArpeggioChord) => (chord === 'triad' ? [0, 1, 2] : [0, 1, 2, 3])

/**
 * The key: its tonic, major or minor, and which name it is written under.
 */
function KeyFields({
  area,
  modes = true,
}: {
  area: Area
  /** False where what is played is built on a note rather than in a key. */
  modes?: boolean
}) {
  const { spec, update } = useKey(area)
  const rootId = React.useId()

  // Built on a note, it is named as the major key on that note is.
  const mode: KeyMode = modes ? spec.mode : 'major'
  const type = keyScale(mode)
  const roots = Array.from({ length: 12 }, (_, pitchClass) => ({
    value: String(pitchClass),
    label: spellScale(pitchClass, type, pitchClass === spec.rootPitchClass ? spec.tonic : undefined)
      .root.name,
  }))
  const key = roots[spec.rootPitchClass]?.label ?? ''
  const names = scaleSpellings(spec.rootPitchClass, type).map((scale) => scale.root.name)

  return (
    <>
      <Field label={modes ? 'Key' : 'Root'} htmlFor={rootId}>
        <div className="flex gap-2">
          <div className={modes ? 'w-[4.75rem] shrink-0' : 'min-w-0 flex-1'}>
            <Select
              id={rootId}
              size="sm"
              value={String(spec.rootPitchClass)}
              // A new key starts under its usual name.
              onChange={(event) =>
                update({ rootPitchClass: Number(event.target.value), tonic: undefined })
              }
              options={roots}
            />
          </div>
          {modes && (
            <SegmentedControl<KeyMode>
              label="Major or minor"
              className="min-w-0 flex-1"
              value={spec.mode}
              // The other mode on the same tonic is a different key, with its
              // own names: D♯ minor's major is E♭.
              onChange={(next) => update({ mode: next, tonic: undefined })}
              options={KEY_MODES.map((option) => ({
                value: option,
                label: KEY_MODE_LABELS[option],
              }))}
            />
          )}
        </div>
      </Field>
      {names.length > 1 && (
        <Field label="Written as">
          <SegmentedControl
            label="Written as"
            value={key}
            onChange={(tonic) => update({ tonic })}
            options={names.map((name) => ({ value: name, label: name }))}
          />
        </Field>
      )}
    </>
  )
}

function HandsField({ area }: { area: Area }) {
  const { spec, update } = useKey(area)
  return (
    <Field label="Hands">
      <SegmentedControl<ScaleHands>
        label="Hands"
        value={spec.hand}
        onChange={(hand) => update({ hand })}
        options={HAND_OPTIONS}
      />
    </Field>
  )
}

/** The way to the theory of what the area has on the keys, once it has something. */
function AreaTheoryLink() {
  const kind = useLearningStore((state) => state.exercise?.kind)
  if (!kind) return null
  return (
    <>
      <Divider />
      <TheoryLink>{THEORY_TITLES[kind]}</TheoryLink>
    </>
  )
}

/** The options of the Chords area. */
export function ChordOptions() {
  const spec = useLearningStore((state) => state.chordSpec)
  const update = useLearningStore((state) => state.updateChordSpec)
  const chordId = React.useId()
  const playedId = React.useId()
  const kindLabel = (kind: ChordForm) =>
    kind === 'seventh' ? seventhName(spec.mode) : CHORD_KIND_LABELS[kind]
  // The style in force: a chord that cannot be broken the alternate way is
  // broken the plain way, and the control says so rather than lying.
  const styles = chordStylesFor(spec.chord)
  const style: ChordStyle = styles.includes(spec.style) ? spec.style : 'broken'
  const styleHelp: Record<ChordStyle, string> = {
    solid: 'Every note of the chord together.',
    broken:
      spec.chord === 'key-triads'
        ? 'A note at a time. With both hands, the left plays each chord and the right answers.'
        : 'A note at a time, up through the positions and back.',
    'broken-alternate': 'Bottom, third note, second, top: the hand rocks instead of running.',
  }

  return (
    <>
      <OptionGroup>
        <Field label="Chord" htmlFor={chordId} hint={KIND_DESCRIPTIONS[spec.chord]}>
          <Select
            id={chordId}
            size="sm"
            value={spec.chord}
            onChange={(event) => update({ chord: event.target.value as ChordForm })}
            options={CHORD_FORMS.map((kind) => ({ value: kind, label: kindLabel(kind) }))}
          />
        </Field>
        <Field label="Played" htmlFor={playedId} hint={styleHelp[style]}>
          <Select
            id={playedId}
            size="sm"
            value={style}
            onChange={(event) => update({ style: event.target.value as ChordStyle })}
            options={CHORD_STYLES.map((option) => ({
              value: option,
              // The one that is off says why, in the only place a native option can.
              label: styles.includes(option)
                ? CHORD_STYLE_LABELS[option]
                : `${CHORD_STYLE_LABELS[option]} (four-note chords)`,
              disabled: !styles.includes(option),
            }))}
          />
        </Field>
      </OptionGroup>
      <Divider />
      <OptionGroup>
        <KeyFields area="chords" />
      </OptionGroup>
      <Divider />
      <OptionGroup>
        <HandsField area="chords" />
      </OptionGroup>
      <AreaTheoryLink />
    </>
  )
}

/** The options of the Arpeggios area. */
export function ArpeggioOptions() {
  const spec = useLearningStore((state) => state.arpeggioSpec)
  const update = useLearningStore((state) => state.updateArpeggioSpec)
  const positionId = React.useId()
  const positions = positionsOf(spec.chord)
  const toneCount = positions.length
  // A triad has no third inversion; asked for one, it plays the root position.
  const position = spec.position % toneCount
  const chordLabel = (chord: ArpeggioChord) =>
    chord === 'seventh' ? seventhName(spec.mode) : ARPEGGIO_CHORD_LABELS[chord]

  return (
    <>
      <OptionGroup>
        <Field label="Chord">
          <SegmentedControl<ArpeggioChord>
            label="Chord"
            value={spec.chord}
            onChange={(chord) => update({ chord })}
            options={ARPEGGIO_CHORDS.map((chord) => ({ value: chord, label: chordLabel(chord) }))}
          />
        </Field>
        <Field label="Position" htmlFor={positionId}>
          <Select
            id={positionId}
            size="sm"
            value={String(position)}
            onChange={(event) => update({ position: Number(event.target.value) })}
            options={positions.map((at) => ({
              value: String(at),
              label: chordPositionName(toneCount, at),
            }))}
          />
        </Field>
        <Field label="Direction">
          <SegmentedControl<ScaleDirection>
            label="Direction"
            value={spec.direction}
            onChange={(direction) => update({ direction })}
            options={SCALE_DIRECTIONS.map((direction) => ({
              value: direction,
              label: DIRECTION_SHORT[direction],
            }))}
          />
        </Field>
      </OptionGroup>
      <Divider />
      <OptionGroup>
        <KeyFields area="arpeggios" />
      </OptionGroup>
      <Divider />
      <OptionGroup>
        <HandsField area="arpeggios" />
      </OptionGroup>
      <AreaTheoryLink />
    </>
  )
}

/*
 * How the cadence is laid out between the hands — the panel calls it Voicing.
 *
 * It was labelled Cadence, which said nothing the area's name had not, and
 * its first option is Three Positions, right beside a setting called Position.
 * Two controls that both sounded like "position" read as one choice made
 * twice. Position is the inversion the tonic chord starts in; this is who
 * plays the chords and who plays the roots.
 */
const FORM_DESCRIPTIONS: Record<CadenceForm, string> = {
  positions: 'The chords in both hands, from each position of the tonic.',
  'root-in-bass': 'Right hand on the chords, left hand on the root of each.',
  'root-in-treble': 'Left hand on the chords, right hand on the root of each.',
}

type CadencePosition = CadenceSpec['position']
const POSITION_OPTIONS: readonly { value: CadencePosition; label: string }[] = [
  { value: 'all', label: 'All Three' },
  ...CADENCE_POSITION_NAMES.map((label, index) => ({ value: index as CadencePosition, label })),
]

const DOMINANT_LABELS: Record<CadenceDominant, string> = {
  V: 'Dominant triad',
  V7: 'Dominant seventh',
}
const DOMINANT_DESCRIPTIONS: Record<CadenceDominant, string> = {
  V: 'I – IV – I – V – I.',
  V7: 'I – IV – I – V7 – I.',
}

/**
 * The options of the Progressions area.
 *
 * Progressions is a category: what is practised in it is one of its types, and
 * each type brings its own settings. So the panel opens with the type, and the
 * rest of it is whatever that type needs — a type added later adds its own
 * settings here and leaves the others alone.
 */
export function ProgressionOptions() {
  const type = useLearningStore((state) => state.progressionType)
  const typeId = React.useId()

  return (
    <>
      <OptionGroup>
        <Field label="Progression" htmlFor={typeId} hint={PROGRESSION_TYPE_DESCRIPTIONS[type]}>
          <Select
            id={typeId}
            size="sm"
            value={type}
            // Through the address, so the type survives a reload and Back undoes it.
            onChange={(event) => pageActions.openProgression(event.target.value as ProgressionType)}
            options={PROGRESSION_TYPES.map((option) => ({
              value: option,
              label: PROGRESSION_TYPE_LABELS[option],
            }))}
          />
        </Field>
      </OptionGroup>
      <Divider />
      {type === 'cadences' && <CadenceOptions />}
      <AreaTheoryLink />
    </>
  )
}

/** Cadences: the settings of the first type of progression. */
function CadenceOptions() {
  const spec = useLearningStore((state) => state.cadenceSpec)
  const update = useLearningStore((state) => state.updateCadenceSpec)
  const formId = React.useId()
  const positionId = React.useId()
  // The rooted forms are two-handed by nature and play one position, with both
  // dominants in turn: those three settings belong to the three positions only,
  // and step aside for the forms that have already decided them.
  const positions = spec.form === 'positions'

  return (
    <>
      <OptionGroup>
        <KeyFields area="progressions" />
      </OptionGroup>
      <Divider />
      <OptionGroup>
        <Field label="Voicing" htmlFor={formId} hint={FORM_DESCRIPTIONS[spec.form]}>
          <Select
            id={formId}
            size="sm"
            value={spec.form}
            onChange={(event) => update({ form: event.target.value as CadenceForm })}
            options={CADENCE_FORMS.map((form) => ({
              value: form,
              label: CADENCE_FORM_LABELS[form],
            }))}
          />
        </Field>
        {positions && (
          <>
            <Field
              label="Position"
              htmlFor={positionId}
              hint={
                spec.position === 'all'
                  ? 'The cadence from each position of the tonic chord, in turn.'
                  : undefined
              }
            >
              <Select
                id={positionId}
                size="sm"
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
            </Field>
            <Field label="Dominant" hint={DOMINANT_DESCRIPTIONS[spec.dominant]}>
              <SegmentedControl<CadenceDominant>
                label="Dominant"
                value={spec.dominant}
                onChange={(dominant) => update({ dominant })}
                options={CADENCE_DOMINANTS.map((chord) => ({
                  value: chord,
                  label: DOMINANT_LABELS[chord],
                }))}
              />
            </Field>
          </>
        )}
      </OptionGroup>
      {positions && (
        <>
          <Divider />
          <OptionGroup>
            <HandsField area="progressions" />
          </OptionGroup>
        </>
      )}
    </>
  )
}

/** The options of the Exercises area. */
export function ExerciseOptions() {
  const spec = useLearningStore((state) => state.routineSpec)
  const update = useLearningStore((state) => state.updateRoutineSpec)
  const routineId = React.useId()
  // A routine written for two hands is played with two, whatever was last
  // chosen; the choice is kept for the routines that have one.
  const choosesHand = routineHands(spec.routine).length > 1

  return (
    <>
      <OptionGroup>
        <Field label="Routine" htmlFor={routineId} hint={ROUTINE_DESCRIPTIONS[spec.routine]}>
          <Select
            id={routineId}
            size="sm"
            value={spec.routine}
            onChange={(event) => update({ routine: event.target.value as Routine })}
            options={ROUTINES.map((routine) => ({
              value: routine,
              label: ROUTINE_LABELS[routine],
            }))}
          />
        </Field>
      </OptionGroup>
      <Divider />
      <OptionGroup>
        <KeyFields area="exercises" modes={routineHasMode(spec.routine)} />
      </OptionGroup>
      <Divider />
      <OptionGroup>
        {choosesHand ? (
          <HandsField area="exercises" />
        ) : (
          <Field label="Hands">
            <p className="text-body-sm text-[var(--ds-fg-secondary)]">
              Both — this routine is written for two hands.
            </p>
          </Field>
        )}
      </OptionGroup>
      <AreaTheoryLink />
    </>
  )
}
