import * as React from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import type { Instrument } from '@sonara/shared'
import { api, ApiClientError } from '@/lib/api'
import { AudioProvider, useAudio } from '@/audio/AudioProvider'
import { MidiProvider } from '@/midi/MidiProvider'
import { AppBar } from '@/components/AppBar'
import { KeyboardStage } from '@/features/keyboard/KeyboardStage'
import { InstrumentPicker } from '@/features/instruments/InstrumentPicker'
import { DeviceBar } from '@/features/devices/DeviceBar'
import { DeviceSettingsDrawer } from '@/features/devices/DeviceSettingsDrawer'
import { Section } from '@/ui/Surface'
import { Chip } from '@/ui/Display'
import { Button } from '@/ui/Button'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A 4xx means this build asked for something wrong; retrying changes
      // nothing except the size of the log.
      retry: (failureCount, error) =>
        failureCount < 2 && (!(error instanceof ApiClientError) || error.isTransient),
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
  const [selectedId, setSelectedId] = React.useState<string | null>(null)

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

  const selected = instruments.find((instrument) => instrument.id === selectedId) ?? null

  return (
    <div className="app-ambient relative min-h-dvh">
      <AppBar />

      <main className="relative z-10 mx-auto flex max-w-[var(--ds-layout-container)] flex-col gap-6 px-[var(--ds-layout-gutter)] py-6 sm:px-[var(--ds-layout-gutter-lg)] sm:py-8">
        <DeviceBar onConfigure={() => setSettingsOpen(true)} />

        {catalogue.isError ? (
          <CatalogueError error={catalogue.error} onRetry={() => void catalogue.refetch()} />
        ) : (
          <>
            <KeyboardStage
              instrumentName={selected?.name ?? 'Loading…'}
              statusSlot={<EngineChip />}
            />

            <Section
              title="Choose a piano"
              description="Each one loads on demand and is cached for next time."
            >
              <InstrumentPicker
                instruments={instruments}
                selectedId={selectedId}
                onSelect={select}
                status={audio.status}
              />
            </Section>
          </>
        )}
      </main>

      <DeviceSettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
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
