import {
  AudioWaveform,
  Circle,
  Gauge,
  Hand,
  Lock,
  MoreVertical,
  Music4,
  Piano,
  SlidersHorizontal,
  Square,
  Upload,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { ActionMenu, SelectMenu, type MenuAction } from '@/ui/Menu'
import { useMidi } from '@/midi/MidiProvider'
import {
  AVAILABLE_TOPICS,
  LEARNING_TOPIC_LABELS,
  LEARNING_TOPICS,
  useLearningStore,
  type LearningTopic,
} from '@/state/learning-store'
import { panelActions } from '@/state/panel-store'
import { useRecordingStore } from '@/state/recording-store'
import { LastTakeButton, RecordButton } from '@/features/recording/RecordControls'
import {
  DemoButton,
  DirectionMenu,
  GuidanceMenu,
  HandMenu,
  MetronomeToggle,
  OctavesMenu,
  ScalePicker,
  StartButton,
  TempoStepper,
} from '@/features/learning/ScaleControls'
import {
  PartMenu,
  SongGuidanceMenu,
  SongMetronomeToggle,
  SongPicker,
  SongTempoMenu,
  SongTransport,
} from '@/features/songs/SongControls'

/**
 * Everything you can set, in one row across the top.
 *
 * Read left to right it is the order the decisions are made in: what you are
 * working on, which exactly, how, how fast — then Start. The utilities that do
 * not change what is being practised (the MIDI readout, the Progress and
 * Settings panels, the overflow) sit after Start, apart from it, because they
 * are consulted rather than decided.
 *
 * The row does not wrap and does not scroll. It folds: below `xl` the settings
 * after the scale move into the scale's popover, below `lg` the tempo, the
 * metronome and recording move out to their panels, and on a phone the two
 * panel buttons join the overflow and the brand steps aside. Every control is
 * still reachable at 320px; none of them is ever cut in half.
 */
export function TopBar() {
  const topic = useLearningStore((state) => state.topic)

  return (
    <header className="top-bar">
      <div className="top-bar__row">
        <Brand />
        <span className="top-bar__divider bar-sm" aria-hidden />
        <TopicMenu />

        {topic === 'scales' && (
          <>
            <span className="top-bar__divider" aria-hidden />
            <ScalePicker />
            <span className="top-bar__divider bar-wide" aria-hidden />
            <span className="bar-wide">
              <HandMenu />
            </span>
            <span className="top-bar__divider bar-wide" aria-hidden />
            <span className="bar-wide">
              <OctavesMenu />
            </span>
            <span className="top-bar__divider bar-wide" aria-hidden />
            <span className="bar-wide">
              <DirectionMenu />
            </span>
            <span className="top-bar__divider bar-wide" aria-hidden />
            <span className="bar-wide">
              <GuidanceMenu />
            </span>

            <span className="top-bar__spacer" />

            <TempoStepper className="bar-mid" />
            <MetronomeToggle className="bar-mid" />
            <DemoButton />
            <span className="bar-mid top-bar__cluster">
              <RecordButton />
              <LastTakeButton />
            </span>
            <StartButton />
          </>
        )}

        {topic === 'songs' && (
          <>
            <span className="top-bar__divider" aria-hidden />
            <SongPicker />
            <span className="top-bar__divider bar-wide" aria-hidden />
            <span className="bar-wide">
              <PartMenu />
            </span>
            <span className="top-bar__divider bar-wide" aria-hidden />
            <span className="bar-wide">
              <SongGuidanceMenu />
            </span>

            <span className="top-bar__spacer" />

            <span className="bar-mid">
              <SongTempoMenu />
            </span>
            <SongMetronomeToggle className="bar-mid" />
            <SongTransport />
          </>
        )}

        <span className="top-bar__divider bar-mid" aria-hidden />
        <Utilities />
      </div>
    </header>
  )
}

/** The name, which a phone gives up first: the tab already says it, and the controls cannot. */
function Brand() {
  return (
    <div className="top-bar__brand bar-sm">
      <span className="top-bar__logo" aria-hidden>
        <Music4 size={18} />
      </span>
      <span className="top-bar__name">Sonara</span>
    </div>
  )
}

function TopicMenu() {
  const topic = useLearningStore((state) => state.topic)
  const setTopic = useLearningStore((state) => state.setTopic)
  return (
    <SelectMenu<LearningTopic>
      label="Learning topic"
      value={topic}
      onChange={setTopic}
      options={LEARNING_TOPICS.map((option) => {
        const available = AVAILABLE_TOPICS.includes(option)
        return {
          value: option,
          label: LEARNING_TOPIC_LABELS[option],
          disabled: !available,
          description: available
            ? undefined
            : 'Coming next — the engine behind it is already here.',
          badge: available ? undefined : <Lock size={13} />,
        }
      })}
    />
  )
}

function Utilities() {
  const topic = useLearningStore((state) => state.topic)
  const recording = useRecordingStore((state) => state.status)
  const live = recording === 'recording' || recording === 'counting'
  const progressLabel = topic === 'songs' ? 'Hand position' : 'Progress'

  const actions: MenuAction[] = [
    {
      id: 'progress',
      label: progressLabel,
      icon: topic === 'songs' ? <Hand size={16} /> : <Gauge size={16} />,
      onSelect: () => panelActions.open('session'),
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <SlidersHorizontal size={16} />,
      onSelect: () => panelActions.open('settings'),
    },
    ...(topic === 'scales'
      ? [
          {
            id: 'record',
            label: live ? 'Stop recording' : 'Record what you play',
            icon: live ? <Square size={16} /> : <Circle size={16} />,
            onSelect: () =>
              live ? useRecordingStore.getState().stop() : useRecordingStore.getState().arm(),
          },
        ]
      : []),
    {
      id: 'devices',
      label: 'Keyboard & MIDI setup',
      icon: <Piano size={16} />,
      onSelect: () => panelActions.open('devices'),
    },
    {
      id: 'import',
      label: 'Import a song…',
      icon: <Upload size={16} />,
      onSelect: () => panelActions.open('library'),
    },
  ]

  return (
    <>
      <MidiStatus className="bar-wide" />
      <button
        type="button"
        className="bar-icon-button bar-sm"
        aria-label={progressLabel}
        title={progressLabel}
        onClick={() => panelActions.open('session')}
      >
        {topic === 'songs' ? <Hand size={18} aria-hidden /> : <Gauge size={18} aria-hidden />}
      </button>
      <button
        type="button"
        className="bar-icon-button bar-sm"
        aria-label="Settings"
        title="Settings"
        onClick={() => panelActions.open('settings')}
      >
        <SlidersHorizontal size={18} aria-hidden />
      </button>
      <ActionMenu label="More" icon={<MoreVertical size={18} aria-hidden />} actions={actions} />
    </>
  )
}

/**
 * Whether a MIDI keyboard is connected — a readout, not a button, because it is
 * the thing you check without meaning to. The status sits on the icon rather
 * than beside it: it belongs to the thing.
 */
function MidiStatus({ className }: { className?: string }) {
  const midi = useMidi()
  const connected = midi.connectedPorts.length
  const name = connected === 1 ? (midi.connectedPorts[0]?.name ?? 'Keyboard') : null
  const label =
    connected === 0
      ? 'No MIDI keyboard connected'
      : connected === 1
        ? `${name} connected`
        : `${connected} keyboards connected`

  return (
    <span className={cn('midi-status', className)} role="img" aria-label={label} title={label}>
      <AudioWaveform size={17} aria-hidden />
      <span className="midi-status__dot" data-connected={connected > 0} aria-hidden />
    </span>
  )
}
