import {
  AudioWaveform,
  BookOpen,
  Circle,
  Gauge,
  Hand,
  LayoutGrid,
  Lock,
  MoreVertical,
  Piano,
  Settings,
  Square,
  Upload,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import logoUrl from '@/assets/sonara-logo.svg'
import { ActionMenu, type MenuAction } from '@/ui/Menu'
import { useMidi } from '@/midi/MidiProvider'
import { useLearningStore } from '@/state/learning-store'
import { panelActions } from '@/state/panel-store'
import { pageActions, usePageStore } from '@/state/page-store'
import { useRecordingStore } from '@/state/recording-store'
import { AREAS, COMING_NEXT } from '@/features/areas/areas'
import { OptionsButton } from '@/components/OptionsDrawer'
import { LastTakeButton, RecordButton } from '@/features/recording/RecordControls'
import {
  DemoButton,
  MetronomeToggle,
  ModeTabs,
  StartButton,
  TempoControl,
} from '@/features/learning/ScaleControls'
import {
  SongMetronomeToggle,
  SongModeTabs,
  SongTempoControl,
  SongTransport,
} from '@/features/songs/SongControls'
import { showMySongs } from '@/features/songs/SongPicker'

/**
 * How you are practising, in one row across the top.
 *
 * On the left, the name and one button: the options of the area that is open,
 * which slide in over the workspace. What is being practised used to be spread
 * along the bar as an icon a setting; it is all behind that button now, in
 * words.
 *
 * On the right, how: the mode as three tabs, the tempo as a number with its
 * arrows, the metronome, then the buttons that act — Hear, Record, Start. Past
 * a divider, the utilities that do not change what is being practised — the
 * MIDI readout, the Progress and Settings panels, and the menu, which is also
 * how you move between the dashboard and the areas.
 *
 * The row does not wrap and does not scroll. It folds, and the widths it folds
 * at are written next to the classes that do it, in the stylesheet. Every
 * control is still reachable at 320px; none of them is ever cut in half.
 */
export function TopBar() {
  const topic = useLearningStore((state) => state.topic)
  const page = usePageStore((state) => state.page)
  const area = page === 'area' ? topic : null

  return (
    <header className="top-bar">
      <div className="top-bar__row">
        <Brand keep={area === null} />
        {area && <OptionsButton />}

        <span className="top-bar__spacer" />

        {area && area !== 'songs' && (
          <>
            <ModeTabs />
            <span className="top-bar__divider bar-sm" aria-hidden />
            <TempoControl className="bar-xs" />
            <MetronomeToggle className="bar-mid" />
            <span className="top-bar__divider bar-sm" aria-hidden />
            <DemoButton />
            <span className="bar-mid top-bar__cluster">
              <RecordButton />
              <LastTakeButton />
            </span>
            <StartButton />
          </>
        )}

        {area === 'songs' && (
          <>
            <SongModeTabs />
            <span className="top-bar__divider bar-sm" aria-hidden />
            <SongTempoControl className="bar-xs" />
            <SongMetronomeToggle className="bar-mid" />
            <span className="top-bar__divider bar-sm" aria-hidden />
            <SongTransport />
          </>
        )}

        <span className="top-bar__divider bar-mid" aria-hidden />
        <Utilities area={area} />
      </div>
    </header>
  )
}

/**
 * The name, which gives way as the bar narrows: the word first, then the mark.
 * The tab already says where you are, and the controls cannot. The dashboard
 * has no controls to make room for, so there it stays whole.
 */
function Brand({ keep }: { keep: boolean }) {
  return (
    <div className={cn('top-bar__brand', !keep && 'bar-mid')}>
      <img className="top-bar__logo" src={logoUrl} alt="" title="Sonara" />
      <span className={cn('top-bar__name', !keep && 'bar-full')}>Sonara</span>
    </div>
  )
}

function Utilities({ area }: { area: string | null }) {
  const recording = useRecordingStore((state) => state.status)
  const live = recording === 'recording' || recording === 'counting'
  const progressLabel = area === 'songs' ? 'Hand position' : 'Progress'
  const ProgressIcon = area === 'songs' ? Hand : Gauge

  /*
   * What the bar has folded away at this width, and only that. At full width
   * Progress, Settings and Record are on the bar already, and a menu repeating
   * them is a second place to look for the same thing. `menu-only-*` shows an
   * item exactly where its `bar-*` twin is hidden.
   */
  const folded: MenuAction[] = [
    ...(area && area !== 'songs'
      ? [
          {
            id: 'record',
            label: live ? 'Stop recording' : 'Record what you play',
            icon: live ? <Square size={16} /> : <Circle size={16} />,
            onSelect: () =>
              live ? useRecordingStore.getState().stop() : useRecordingStore.getState().arm(),
            className: 'menu-only-mid',
          },
        ]
      : []),
    ...(area
      ? [
          {
            id: 'progress',
            label: progressLabel,
            icon: <ProgressIcon size={16} />,
            onSelect: () => panelActions.open('session'),
            className: 'menu-only-sm',
          },
        ]
      : []),
    {
      id: 'settings',
      label: 'Settings',
      icon: <Settings size={16} />,
      onSelect: () => panelActions.open('settings'),
      className: 'menu-only-sm',
    },
  ].map((action, index) => (index === 0 ? { ...action, separated: true } : action))

  const actions: MenuAction[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <LayoutGrid size={16} />,
      checked: area === null,
      onSelect: pageActions.openDashboard,
    },
    ...AREAS.map((entry, index): MenuAction => ({
      id: entry.topic,
      label: entry.label,
      icon: <entry.icon size={16} />,
      checked: area === entry.topic,
      disabled: !entry.available,
      title: entry.available ? undefined : COMING_NEXT,
      trail: entry.available ? undefined : <Lock size={13} />,
      separated: index === 0,
      onSelect: () => pageActions.openArea(entry.topic),
    })),
    ...folded,
    {
      id: 'fundamentals',
      label: 'Fundamentals',
      icon: <BookOpen size={16} />,
      onSelect: () => panelActions.open('fundamentals'),
      separated: true,
    },
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
      // Importing is done in the song chooser, which Songs opens on: so this
      // goes there, turned to the player's own songs.
      onSelect: () => {
        showMySongs()
        pageActions.openArea('songs')
      },
    },
  ]

  return (
    <>
      <MidiStatus className="bar-full" />
      {area && (
        <button
          type="button"
          className="bar-icon-button bar-sm"
          aria-label={progressLabel}
          title={progressLabel}
          onClick={() => panelActions.open('session')}
        >
          <ProgressIcon size={18} aria-hidden />
        </button>
      )}
      <button
        type="button"
        className="bar-icon-button bar-sm"
        aria-label="Settings"
        title="Settings"
        onClick={() => panelActions.open('settings')}
      >
        <Settings size={18} aria-hidden />
      </button>
      <ActionMenu label="Menu" icon={<MoreVertical size={18} aria-hidden />} actions={actions} />
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
