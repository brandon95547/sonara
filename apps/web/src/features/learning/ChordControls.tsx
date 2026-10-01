import * as React from 'react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Hand,
  Layers,
  ListOrdered,
  Music,
  Rows3,
  type LucideIcon,
} from 'lucide-react'
import {
  ARPEGGIO_CHORDS,
  CHORD_KIND_LABELS,
  CHORD_KINDS,
  CHORD_STYLE_LABELS,
  CHORD_STYLES,
  chordPositionName,
  findScaleType,
  HAND_LABELS,
  KEY_MODE_LABELS,
  KEY_MODES,
  SCALE_DIRECTION_LABELS,
  SCALE_DIRECTIONS,
  SCALE_HANDS,
  scaleSpellings,
  SCALE_TYPES,
  spellScale,
  type ArpeggioChord,
  type ChordKind,
  type ChordStyle,
  type KeyMode,
  type ScaleDirection,
  type ScaleHands,
} from '@sonara/shared'
import { Popover, SelectMenu } from '@/ui/Menu'
import { SegmentedControl, Select } from '@/ui/Controls'
import { BarGlyph } from '@/ui/BarGlyph'
import { useLearningStore } from '@/state/learning-store'
import { CompactField, RadioGrid } from './ScaleControls'

/**
 * The Chords and Arpeggios controls, as they sit in the app bar.
 *
 * Built the way the Scales controls are, so the three areas read as one
 * instrument: the key first, behind an icon that carries its name; then what
 * is played and which hand plays it, each an icon with its value on a badge.
 * On a narrow screen everything after the key folds into the key's own
 * popover.
 */

type Area = 'chords' | 'arpeggios'

/** The area's settings and the action that changes them, whichever area it is. */
function useKey(area: Area) {
  const chord = useLearningStore((state) => state.chordSpec)
  const arpeggio = useLearningStore((state) => state.arpeggioSpec)
  const updateChord = useLearningStore((state) => state.updateChordSpec)
  const updateArpeggio = useLearningStore((state) => state.updateArpeggioSpec)
  const spec = area === 'chords' ? chord : arpeggio
  // The fields the two areas share. Each action takes its own area's patch;
  // a key, a mode and a hand are part of both.
  const update = (area === 'chords' ? updateChord : updateArpeggio) as (patch: {
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

const KIND_BADGES: Record<ChordKind, string> = { triad: '3', 'four-note': '4', seventh: '7' }
const STYLE_BADGES: Record<ChordStyle, string> = { solid: 'S', broken: 'B' }

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
function KeyPicker({ area, children }: { area: Area; children: React.ReactNode }) {
  const { spec, update } = useKey(area)
  const title = useLearningStore((state) => state.exercise?.title ?? 'Choose a key')
  const [open, setOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const close = React.useCallback(() => setOpen(false), [])

  const type = keyScale(spec.mode)
  const roots = Array.from({ length: 12 }, (_, pitchClass) => ({
    value: pitchClass,
    label: spellScale(pitchClass, type, pitchClass === spec.rootPitchClass ? spec.tonic : undefined)
      .root.name,
  }))
  const key = roots[spec.rootPitchClass]?.label ?? ''
  const names = scaleSpellings(spec.rootPitchClass, type).map((scale) => scale.root.name)
  const label = `Key: ${key} ${KEY_MODE_LABELS[spec.mode]} — ${title}`

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
        <BarGlyph icon={<Music size={18} />} badge={spec.mode === 'minor' ? `${key}m` : key} />
      </button>
      <Popover
        open={open}
        onClose={close}
        anchorRef={triggerRef}
        label="Key"
        className="popover--scale"
      >
        <div className="flex flex-col gap-4 p-4">
          <RadioGrid
            label="Key"
            columns={6}
            value={spec.rootPitchClass}
            options={roots}
            // A new key starts under its usual name.
            onChange={(rootPitchClass) => update({ rootPitchClass, tonic: undefined })}
          />
          <CompactField label="Major or minor">
            <SegmentedControl<KeyMode>
              label="Major or minor"
              value={spec.mode}
              // The other mode on the same tonic is a different key, with its
              // own names: D♯ minor's major is E♭.
              onChange={(mode) => update({ mode, tonic: undefined })}
              options={KEY_MODES.map((mode) => ({ value: mode, label: KEY_MODE_LABELS[mode] }))}
            />
          </CompactField>
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
          </div>
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
  const kindLabel = (kind: ChordKind) =>
    kind === 'seventh' ? seventhName(spec.mode) : CHORD_KIND_LABELS[kind]

  return (
    <>
      <KeyPicker area="chords">
        <CompactField label="Chord">
          <Select
            size="sm"
            aria-label="Chord"
            value={spec.chord}
            onChange={(event) => update({ chord: event.target.value as ChordKind })}
            options={CHORD_KINDS.map((kind) => ({ value: kind, label: kindLabel(kind) }))}
          />
        </CompactField>
        <CompactField label="Played">
          <SegmentedControl<ChordStyle>
            label="Played"
            value={spec.style}
            onChange={(style) => update({ style })}
            options={CHORD_STYLES.map((style) => ({
              value: style,
              label: CHORD_STYLE_LABELS[style],
            }))}
          />
        </CompactField>
      </KeyPicker>
      <SelectMenu<ChordKind>
        label="Chord"
        value={spec.chord}
        options={CHORD_KINDS.map((kind) => ({
          value: kind,
          label: kindLabel(kind),
          description:
            kind === 'triad'
              ? 'Three notes: root position and both inversions.'
              : kind === 'four-note'
                ? 'The triad with its octave added.'
                : 'Root position and three inversions.',
        }))}
        onChange={(chord) => update({ chord })}
        iconOnly
        icon={<BarGlyph icon={<Layers size={18} />} badge={KIND_BADGES[spec.chord]} />}
        className="bar-wide"
      />
      <SelectMenu<ChordStyle>
        label="Played"
        value={spec.style}
        options={[
          { value: 'solid', label: 'Solid', description: 'Every note of the chord together.' },
          {
            value: 'broken',
            label: 'Broken',
            description: 'A note at a time, up through the positions and back.',
          },
        ]}
        onChange={(style) => update({ style })}
        iconOnly
        icon={<BarGlyph icon={<Rows3 size={18} />} badge={STYLE_BADGES[spec.style]} />}
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
