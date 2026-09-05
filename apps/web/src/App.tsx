import * as React from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import type { Instrument } from '@sonara/shared'
import { api, ApiClientError } from '@/lib/api'
import { AudioProvider, useAudio } from '@/audio/AudioProvider'
import { MidiProvider } from '@/midi/MidiProvider'
import { AppBar } from '@/components/AppBar'
import { KeyboardStage } from '@/features/keyboard/KeyboardStage'
import { DeviceSettingsDrawer } from '@/features/devices/DeviceSettingsDrawer'
import { RecordingOverlay, RecordingReview } from '@/features/recording/RecordControls'
import { SongControlRow } from '@/features/songs/SongControlRow'
import { SongLibrary } from '@/features/songs/SongLibrary'
import { OverflowMenu } from '@/components/OverflowMenu'
import { LearningBar } from '@/features/learning/LearningBar'
import { ScaleConfigRow } from '@/features/learning/ScaleConfigRow'
import { LearningDashboard } from '@/features/learning/LearningDashboard'
import { Card } from '@/ui/Surface'
import { Chip } from '@/ui/Display'
import { Button } from '@/ui/Button'
import { LEARNING_TOPIC_LABELS, useLearningStore } from '@/state/learning-store'

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
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [libraryOpen, setLibraryOpen] = React.useState(false)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const topic = useLearningStore((state) => state.topic)

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

  return (
    <div className="app-ambient relative min-h-dvh">
      <AppBar
        instruments={instruments}
        selectedId={selectedId}
        onSelectInstrument={select}
        // The FIRST failure is enough to stop saying "loading". The retry
        // carries on quietly behind it — but a player watching the app bar
        // should not have to wait out the whole retry budget to learn that
        // something is wrong.
        catalogueFailed={catalogue.isError || catalogue.failureCount > 0}
        statusSlot={<EngineChip />}
        overflow={
          <OverflowMenu
            onKeyboardSetup={() => setSettingsOpen(true)}
            onImport={() => setLibraryOpen(true)}
          />
        }
      />

      <main className="relative z-10 mx-auto flex max-w-[var(--ds-layout-container)] flex-col gap-4 px-[var(--ds-layout-gutter)] py-5 sm:px-[var(--ds-layout-gutter-lg)] sm:py-6">
        {catalogue.isError ? (
          <CatalogueError error={catalogue.error} onRetry={() => void catalogue.refetch()} />
        ) : (
          <>
            {/* Above the keyboard, and in this order: what you are working on,
                then how it is set up, then the instrument itself. Each row
                changes what the row below it does.

                One setup row per topic, never two: a scale and a song are not
                practised in the same moment. There is no Free Play tab because
                every tab is free play — the keyboard is always live, and
                nothing here has ever required a run to be started first. */}
            <LearningBar />
            {topic === 'scales' && <ScaleConfigRow />}
            {topic === 'songs' && <SongControlRow onBrowse={() => setLibraryOpen(true)} />}

            <KeyboardStage />

            {topic === 'scales' ? <LearningDashboard /> : topic === 'songs' ? null : <ComingNext />}
          </>
        )}
      </main>

      <DeviceSettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <SongLibrary open={libraryOpen} onClose={() => setLibraryOpen(false)} />
      <RecordingOverlay />
      <RecordingReview />
    </div>
  )
}

/**
 * Topics whose builder has not been written yet.
 *
 * Says what is actually missing rather than "coming soon". The engine, the
 * keyboard highlighting and this dashboard are all generic over
 * `Exercise` — a chord topic is a builder that returns steps of three notes
 * instead of one, and nothing else.
 */
function ComingNext() {
  const topic = useLearningStore((state) => state.topic)
  return (
    <Card className="flex flex-col items-start gap-2">
      <div className="flex items-center gap-2">
        <h2 className="text-h4 text-[var(--ds-fg)]">{LEARNING_TOPIC_LABELS[topic]}</h2>
        <Chip tone="info">Next</Chip>
      </div>
      <p className="max-w-prose text-body-sm leading-relaxed text-[var(--ds-fg-secondary)]">
        The Explore, Learn and Practice engine behind Scales is not scale-specific — it walks a list
        of steps, where a step is a set of notes. {LEARNING_TOPIC_LABELS[topic]} needs a builder
        that produces those steps, and nothing else: the keyboard highlighting, the fingering
        badges, the scoring and this dashboard all work on them already.
      </p>
    </Card>
  )
}

/** What is actually making the sound right now. */
function EngineChip() {
  const { status } = useAudio()
  if (!status.instrumentId) return null

  // Browsers refuse to start audio before a gesture, so a freshly loaded page
  // is silent until the first click — including the click on a piano key,
  // which both unlocks the audio and plays the note. Saying so costs one chip
  // and is the difference between "ready when you are" and "this is broken".
  if (!status.unlocked) return <Chip tone="info">Press a key to start audio</Chip>

  if (status.loadingSamples) {
    return (
      <Chip tone="info">
        Loading{status.progress > 0 ? ` ${Math.round(status.progress * 100)}%` : ''}
      </Chip>
    )
  }
  if (status.fallbackReason) return <Chip tone="warning">Built-in voice</Chip>
  return (
    <Chip tone={status.kind === 'sampled' ? 'success' : 'neutral'}>
      {status.kind === 'sampled' ? 'Sampled' : 'Built-in voice'}
    </Chip>
  )
}

function CatalogueError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const message =
    error instanceof ApiClientError ? error.message : 'The piano catalogue could not be loaded.'

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
