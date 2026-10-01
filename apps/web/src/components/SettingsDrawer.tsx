import { ChevronLeft, ChevronRight, Piano, Volume2, VolumeX } from 'lucide-react'
import {
  DEFAULT_FINGERING_SYSTEM,
  FINGERING_SYSTEM_IDS,
  FINGERING_SYSTEMS,
  fingeringSystem,
  isFingeringSystemId,
  noteName,
  type Instrument,
} from '@sonara/shared'
import { Drawer } from '@/ui/Drawer'
import { Button, IconButton } from '@/ui/Button'
import { Field, SegmentedControl, Select, Slider, Switch } from '@/ui/Controls'
import { Section } from '@/ui/Surface'
import { Divider } from '@/ui/Display'
import { useAudio } from '@/audio/AudioProvider'
import { EngineChip } from '@/audio/EngineChip'
import { InstrumentSelect } from '@/features/instruments/InstrumentSelect'
import { KEYBOARD_SPANS, canShift } from '@/features/keyboard/keyboard-layout'
import { useLearningStore, type KeyLabels } from '@/state/learning-store'
import { AUTO_SPAN, useViewStore } from '@/state/view-store'
import { useCurrentSong, useSongStore, type FingeringDensity } from '@/state/song-store'
import { panelActions, usePanelStore } from '@/state/panel-store'
import { RecordButton } from '@/features/recording/RecordControls'
import { useMidi } from '@/midi/MidiProvider'
import { MetronomeToggle, TempoStepper } from '@/features/learning/ScaleControls'
import {
  PartMenu,
  SongGuidanceMenu,
  SongMetronomeToggle,
  SongTempoMenu,
} from '@/features/songs/SongControls'

/**
 * How the instrument sounds and how it is shown — everything that changes the
 * view of the practice rather than the practice itself.
 *
 * This is what used to be the toolbar under the keyboard, plus the piano and
 * the volume from the app bar. None of it is touched mid-run, so none of it
 * needs to be on screen while playing; one click away is close enough, and the
 * screen goes to the staff and the keys.
 *
 * The practice and song sections repeat controls that are in the bar on a wide
 * screen. On a narrow one the bar folds them away, and this is where they land
 * — so they are here at every width rather than appearing and disappearing.
 */
export function SettingsDrawer({
  instruments,
  selectedId,
  onSelectInstrument,
  catalogueFailed,
}: {
  instruments: readonly Instrument[]
  selectedId: string | null
  onSelectInstrument: (instrument: Instrument) => void
  catalogueFailed: boolean
}) {
  const open = usePanelStore((state) => state.panel === 'settings')
  const close = usePanelStore((state) => state.close)
  const topic = useLearningStore((state) => state.topic)

  return (
    <Drawer
      open={open}
      onClose={close}
      title="Settings"
      description="How the piano sounds and how the keys and staff are shown."
    >
      <div className="flex flex-col gap-6">
        <SoundSection
          instruments={instruments}
          selectedId={selectedId}
          onSelectInstrument={onSelectInstrument}
          catalogueFailed={catalogueFailed}
        />
        <Divider />
        <KeyboardSection />
        <Divider />
        <StaffSection />
        <Divider />
        {/* A song brings its own fingering, from its file or worked out for
            its notes. A system is about the material a method book prints. */}
        {topic !== 'songs' && (
          <>
            <FingeringSection />
            <Divider />
          </>
        )}
        {topic !== 'songs' ? <PracticeSection /> : <SongSection />}
        <Divider />
        <Section title="Keyboard & MIDI" description={<MidiLine />}>
          <Button
            variant="outlined"
            size="sm"
            startIcon={<Piano />}
            className="self-start"
            onClick={() => panelActions.open('devices')}
          >
            Keyboard & MIDI setup
          </Button>
        </Section>
      </div>
    </Drawer>
  )
}

function SoundSection({
  instruments,
  selectedId,
  onSelectInstrument,
  catalogueFailed,
}: {
  instruments: readonly Instrument[]
  selectedId: string | null
  onSelectInstrument: (instrument: Instrument) => void
  catalogueFailed: boolean
}) {
  const audio = useAudio()
  const muted = audio.volume === 0
  return (
    <Section title="Sound" actions={<EngineChip />}>
      <Field label="Piano">
        <InstrumentSelect
          instruments={instruments}
          selectedId={selectedId}
          onSelect={onSelectInstrument}
          failed={catalogueFailed}
        />
      </Field>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Slider
            label="Volume"
            min={0}
            max={100}
            value={Math.round(audio.volume * 100)}
            formatValue={(value) => `${value}%`}
            onChange={(value) => audio.setVolume(value / 100)}
          />
        </div>
        <IconButton
          label={muted ? 'Unmute' : 'Mute'}
          icon={muted ? <VolumeX /> : <Volume2 />}
          size="sm"
          variant="outlined"
          onClick={() => audio.setVolume(muted ? 0.8 : 0)}
        />
      </div>
    </Section>
  )
}

function KeyboardSection() {
  const spanId = useViewStore((state) => state.spanId)
  const setSpanId = useViewStore((state) => state.setSpanId)
  const autoSpanLabel = useViewStore((state) => state.autoSpanLabel)
  const follow = useViewStore((state) => state.follow)
  const setFollow = useViewStore((state) => state.setFollow)
  const window = useViewStore((state) => state.window)
  const shiftOctave = useViewStore((state) => state.shiftOctave)
  const keyLabels = useLearningStore((state) => state.keyLabels)
  const setKeyLabels = useLearningStore((state) => state.setKeyLabels)
  const showStructure = useLearningStore((state) => state.showStructure)
  const setShowStructure = useLearningStore((state) => state.setShowStructure)
  const hasStructure = useLearningStore((state) => Boolean(state.exercise?.tetrachordGroups))

  return (
    <Section title="Keyboard">
      <Field label="Visible range" htmlFor="span-select">
        <div className="flex items-center gap-2 coarse:gap-3">
          <Select
            id="span-select"
            size="sm"
            className="min-w-[9rem]"
            value={spanId}
            onChange={(event) => setSpanId(event.target.value)}
            options={[
              { value: AUTO_SPAN, label: `Auto — ${autoSpanLabel}` },
              ...KEYBOARD_SPANS.map((option) => ({ value: option.id, label: option.label })),
            ]}
          />
          <IconButton
            label="Octave down"
            icon={<ChevronLeft />}
            size="sm"
            variant="outlined"
            disabled={!canShift(window, -1)}
            onClick={() => shiftOctave(-1)}
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
            disabled={!canShift(window, 1)}
            onClick={() => shiftOctave(1)}
          />
        </div>
      </Field>
      <Switch
        label="Follow"
        description="Move the view to whatever you play, and to the note you are asked for."
        checked={follow}
        onChange={setFollow}
      />
      <Field label="Key labels">
        <SegmentedControl<KeyLabels>
          label="Key labels"
          value={keyLabels}
          onChange={setKeyLabels}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'notes', label: 'Notes' },
            { value: 'degrees', label: 'Degrees' },
            { value: 'fingers', label: 'Fingers' },
          ]}
        />
      </Field>
      <Switch
        label="Structure"
        description={
          hasStructure
            ? 'Separate the two four-note groups this scale is built from.'
            : 'Only for a scale built from two matching halves.'
        }
        checked={showStructure && hasStructure}
        onChange={(checked) => hasStructure && setShowStructure(checked)}
      />
    </Section>
  )
}

function StaffSection() {
  const showStaff = useViewStore((state) => state.showStaff)
  const setShowStaff = useViewStore((state) => state.setShowStaff)
  const topic = useLearningStore((state) => state.topic)
  const song = useCurrentSong()
  const staffView = useSongStore((state) => state.staffView)
  const setStaffView = useSongStore((state) => state.setStaffView)
  const fingering = useSongStore((state) => state.fingering)
  const setFingering = useSongStore((state) => state.setFingering)
  const scoreOpen = topic === 'songs' && song !== null

  return (
    <Section title="Staff">
      <Switch
        label="Show the staff"
        description="Write the music out above the keys."
        checked={showStaff}
        onChange={setShowStaff}
      />
      {/* Only where there is a score to lay out and fingering to print. A scale
          is one line of notes with its fingering on the keys. */}
      {showStaff && scoreOpen && (
        <>
          <Field label="Score layout">
            <SegmentedControl
              label="Score layout"
              value={staffView}
              onChange={setStaffView}
              options={[
                { value: 'sheet', label: 'Sheet' },
                { value: 'flow', label: 'Flow' },
              ]}
            />
          </Field>
          <Field label="Fingering on the staff">
            <SegmentedControl<FingeringDensity>
              label="Fingering on the staff"
              value={fingering}
              onChange={setFingering}
              options={[
                { value: 'all', label: 'All' },
                { value: 'hints', label: 'Key' },
                { value: 'off', label: 'Off' },
              ]}
            />
          </Field>
        </>
      )}
    </Section>
  )
}

/**
 * Whose fingering the recommended numbers are.
 *
 * A select with one entry, on purpose. It says where the numbers come from,
 * which is worth knowing even before there is a choice — and the next system
 * is then an option in this list rather than a new control.
 */
function FingeringSection() {
  const system = useLearningStore((state) => state.fingeringSystem)
  const setSystem = useLearningStore((state) => state.setFingeringSystem)
  return (
    <Section title="Fingering">
      <Field
        label="Fingering system"
        htmlFor="fingering-system"
        hint={fingeringSystem(system).description}
      >
        <Select
          id="fingering-system"
          size="sm"
          value={system}
          onChange={(event) => {
            if (isFingeringSystemId(event.target.value)) setSystem(event.target.value)
          }}
          options={FINGERING_SYSTEM_IDS.map((id) => {
            const { name } = FINGERING_SYSTEMS[id]
            return {
              value: id,
              label: id === DEFAULT_FINGERING_SYSTEM ? `${name} (Default)` : name,
            }
          })}
        />
      </Field>
    </Section>
  )
}

function PracticeSection() {
  const autoTempo = useLearningStore((state) => state.autoTempo)
  const setAutoTempo = useLearningStore((state) => state.setAutoTempo)
  return (
    <Section title="Practice">
      <Field label="Target tempo">
        <div className="flex items-center gap-2 coarse:gap-3">
          <TempoStepper className="tempo-stepper--panel" />
          <MetronomeToggle className="bar-icon-button--panel" />
        </div>
      </Field>
      <Switch
        label="Auto tempo"
        description="Raises the target after a clean run at this speed, and eases off after a scrappy one."
        checked={autoTempo}
        onChange={setAutoTempo}
      />
      <Field label="Recording">
        <div className="flex items-center gap-2">
          <RecordButton />
          <span className="text-body-sm text-[var(--ds-fg-secondary)]">
            Record what you play, then export it.
          </span>
        </div>
      </Field>
    </Section>
  )
}

function SongSection() {
  const song = useCurrentSong()
  if (!song) return null
  return (
    <Section title="Song">
      <div className="settings-menus">
        <PartMenu />
        <SongGuidanceMenu />
        <SongTempoMenu />
        <SongMetronomeToggle className="bar-icon-button--panel" />
      </div>
    </Section>
  )
}

/** Whether a MIDI keyboard is connected — the bar's readout, for when the bar has folded it away. */
function MidiLine() {
  const midi = useMidi()
  const connected = midi.connectedPorts.length
  if (connected === 0) return <>No MIDI keyboard connected. The on-screen keys always work.</>
  if (connected === 1) return <>{midi.connectedPorts[0]?.name ?? 'A keyboard'} is connected.</>
  return <>{connected} keyboards are connected.</>
}
