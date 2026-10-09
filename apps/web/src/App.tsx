import * as React from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import type { Instrument } from '@sonara/shared'
import { api, ApiClientError } from '@/lib/api'
import { AudioProvider, useAudio } from '@/audio/AudioProvider'
import { MidiProvider } from '@/midi/MidiProvider'
import { TopBar } from '@/components/TopBar'
import { Stage } from '@/components/Stage'
import { SettingsDrawer } from '@/components/SettingsDrawer'
import { OptionsDrawer } from '@/components/OptionsDrawer'
import { SessionDrawer } from '@/components/SessionDrawer'
import { KeyboardDock } from '@/features/keyboard/KeyboardDock'
import { DeviceSettingsDrawer } from '@/features/devices/DeviceSettingsDrawer'
import { RecordingOverlay, RecordingReview } from '@/features/recording/RecordControls'
import { SongLibrary } from '@/features/songs/SongLibrary'
import { SongEngine } from '@/features/songs/SongControls'
import { KeyboardRangeSync, ScaleEngine } from '@/features/learning/ScaleControls'
import { ScaleTheoryDialog } from '@/features/learning/ScaleTheoryDialog'
import { KeyTheoryDrawer } from '@/features/theory/KeyTheoryDrawer'
import { FundamentalsDrawer } from '@/features/theory/FundamentalsDrawer'
import { Button } from '@/ui/Button'
import { useLearningStore } from '@/state/learning-store'
import { usePanelStore } from '@/state/panel-store'
import { usePageStore, usePageSync } from '@/state/page-store'
import { Dashboard } from '@/features/areas/Dashboard'
import { preloadSoundEffects } from '@/audio/sound-effects'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A 4xx means this build asked for something wrong; retrying changes
      // nothing except the size of the log. One retry for the transient case,
      // not two: each attempt can burn the full request timeout, and three
      // attempts is half a minute of a spinner before anyone is told anything.
      retry: (failureCount, error) =>
        failureCount < 1 && (!(error instanceof ApiClientError) || error.isTransient),
      refetchOnWindowFocus: false,
    },
  },
})

const LAST_INSTRUMENT_KEY = 'sonara:instrument'

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AudioProvider>
        <MidiProvider>
          <Shell />
        </MidiProvider>
      </AudioProvider>
    </QueryClientProvider>
  )
}

function Shell() {
  const audio = useAudio()
  const panel = usePanelStore((state) => state.panel)
  const closePanel = usePanelStore((state) => state.close)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const topic = useLearningStore((state) => state.topic)
  const page = usePageStore((state) => state.page)
  usePageSync()

  // Every sound effect decoded before it is needed, so none waits on a fetch
  // at the moment it is supposed to land.
  React.useEffect(() => {
    void preloadSoundEffects()
  }, [])

  const catalogue = useQuery({
    queryKey: ['instruments'],
    queryFn: ({ signal }) => api.listInstruments(signal),
    staleTime: Infinity,
  })

  const instruments = catalogue.data?.items ?? []

  const select = React.useCallback(
    (instrument: Instrument) => {
      setSelectedId(instrument.id)
      audio.loadInstrument(instrument)
      try {
        globalThis.localStorage?.setItem(LAST_INSTRUMENT_KEY, instrument.id)
      } catch {
        // Private browsing, or storage disabled. Remembering the last piano is
        // a convenience, and losing it is not worth an error path.
      }
    },
    [audio],
  )

  // Pick a piano as soon as the catalogue arrives: the one the player used
  // last, or the server's default. Choosing nothing would leave a keyboard on
  // screen that makes no sound, which reads as a bug rather than as a prompt.
  React.useEffect(() => {
    if (selectedId || instruments.length === 0) return
    let remembered: string | null = null
    try {
      remembered = globalThis.localStorage?.getItem(LAST_INSTRUMENT_KEY) ?? null
    } catch {
      remembered = null
    }
    const instrument =
      instruments.find((item) => item.id === remembered) ??
      instruments.find((item) => item.id === catalogue.data?.defaultInstrumentId) ??
      instruments[0]
    if (instrument) select(instrument)
  }, [instruments, selectedId, catalogue.data?.defaultInstrumentId, select])

  // The FIRST failure is enough to stop saying "loading". The retry carries on
  // quietly behind it — but a player should not have to wait out the whole
  // retry budget to learn that something is wrong.
  const catalogueFailed = catalogue.isError || catalogue.failureCount > 0

  /*
   * Three bands, top to bottom, filling the screen and never scrolling it: the
   * bar with every setting, the stage with the music, the keys along the
   * bottom. Everything else is a panel over them — opened from the bar, and
   * gone when it is not. The stage and the keys are the workspace, and the
   * area's options slide in over its left edge rather than taking width from it.
   *
   * The dashboard takes the workspace's place: it is where you choose what to
   * play, not where you play it.
   */
  return (
    <div className="app-shell">
      <TopBar />

      {page === 'dashboard' ? (
        <Dashboard />
      ) : (
        <div className="workspace">
          <OptionsDrawer />
          {catalogue.isError ? (
            <main className="stage stage--message">
              <CatalogueError error={catalogue.error} onRetry={() => void catalogue.refetch()} />
            </main>
          ) : (
            <>
              <Stage />
              <KeyboardDock />
            </>
          )}
        </div>
      )}

      {/* The engines run for their topic whatever the bar is showing: a song
          must keep playing, and a metronome keep time, while a menu is shut.
          Leaving for the dashboard is leaving the area, and stops them. */}
      <KeyboardRangeSync />
      {page === 'area' && topic !== 'songs' && <ScaleEngine />}
      {page === 'area' && topic === 'songs' && <SongEngine />}

      <SettingsDrawer
        instruments={instruments}
        selectedId={selectedId}
        onSelectInstrument={select}
        catalogueFailed={catalogueFailed}
      />
      <SessionDrawer />
      {/* The theory of whatever is on the keys: a scale has its own panel, and
          everything else that is in a key shares one. */}
      {topic === 'scales' || topic === 'songs' ? (
        <ScaleTheoryDialog open={panel === 'theory'} onClose={closePanel} />
      ) : (
        <KeyTheoryDrawer open={panel === 'theory'} onClose={closePanel} topic={topic} />
      )}
      <FundamentalsDrawer open={panel === 'fundamentals'} onClose={closePanel} />
      <DeviceSettingsDrawer open={panel === 'devices'} onClose={closePanel} />
      <SongLibrary open={panel === 'library'} onClose={closePanel} />
      <RecordingOverlay />
      <RecordingReview />
    </div>
  )
}

/** What is actually making the sound right now. */
function CatalogueError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const message =
    error instanceof ApiClientError ? error.message : 'The piano catalog could not be loaded.'

  return (
    <div className="flex flex-col items-start gap-3 rounded-[var(--radius-xl)] border border-[var(--ds-danger-border)] bg-[var(--ds-danger-subtle)] p-5">
      <div className="flex items-center gap-2 text-[var(--ds-danger-text)]">
        <AlertTriangle size={18} aria-hidden />
        <h2 className="text-h4">Could not load the pianos</h2>
      </div>
      <p className="text-body-sm text-[var(--ds-fg-secondary)]">{message}</p>
      <p className="text-caption text-[var(--ds-fg-muted)]">
        Check that the Sonara API is running — <code className="font-mono">npm run dev</code> starts
        both halves.
      </p>
      <Button size="sm" variant="outlined" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}
