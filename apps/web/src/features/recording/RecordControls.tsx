import { Circle, Download, Square, Trash2 } from 'lucide-react'
import { performanceLength, writeMidiFile, writeMusicXml } from '@sonara/shared'
import { Button, IconButton } from '@/ui/Button'
import { Drawer } from '@/ui/Drawer'
import { Divider } from '@/ui/Display'
import { useLearningStore } from '@/state/learning-store'
import { useRecordingStore } from '@/state/recording-store'

/**
 * Record, and then decide what the take was for.
 *
 * The count-in exists because the alternative is worse than it sounds: a
 * recording that begins on the click means the first note is either missed or
 * rushed, and a player watching for the moment to start is not playing.
 */
export function RecordButton() {
  const status = useRecordingStore((state) => state.status)
  const arm = useRecordingStore((state) => state.arm)
  const stop = useRecordingStore((state) => state.stop)

  const live = status === 'recording' || status === 'counting'

  return (
    <IconButton
      size="md"
      variant={live ? 'filled' : 'outlined'}
      className={live ? 'is-recording' : undefined}
      label={
        status === 'recording'
          ? 'Stop recording'
          : status === 'counting'
            ? 'Cancel the count-in'
            : 'Record what you play'
      }
      icon={live ? <Square /> : <Circle />}
      onClick={() => (live ? stop() : arm())}
    />
  )
}

/** The count-in, and the fact that it is running, over everything else. */
export function RecordingOverlay() {
  const status = useRecordingStore((state) => state.status)
  const count = useRecordingStore((state) => state.count)
  const elapsedMs = useRecordingStore((state) => state.elapsedMs)

  if (status === 'counting') {
    return (
      <div className="record-scrim" role="status" aria-live="assertive">
        <div className="record-countdown">
          <span className="record-countdown__number" key={count}>
            {count}
          </span>
          <span className="record-countdown__caption">Recording starts — play when it does</span>
        </div>
      </div>
    )
  }

  if (status !== 'recording') return null

  return (
    <div className="record-banner" role="status" aria-live="polite">
      <span className="record-banner__dot" aria-hidden />
      Recording {formatLength(elapsedMs)}
    </div>
  )
}

function formatLength(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** What to do with the take, once there is one. */
export function RecordingReview() {
  const status = useRecordingStore((state) => state.status)
  const take = useRecordingStore((state) => state.take)
  const discard = useRecordingStore((state) => state.discard)
  const bpm = useLearningStore((state) => state.targetBpm)
  const title = useLearningStore((state) => state.exercise?.title ?? 'Sonara recording')

  const open = status === 'review' && take.length > 0

  return (
    <Drawer
      open={open}
      onClose={discard}
      title="Recording finished"
      description={`${take.length} ${take.length === 1 ? 'note' : 'notes'} · ${formatLength(performanceLength(take))}`}
      footer={
        <Button variant="outlined" size="sm" startIcon={<Trash2 />} onClick={discard}>
          Discard
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <ExportOption
          title="MusicXML"
          extension=".musicxml"
          detail="Notation. Opens in MuseScore, Sibelius, Finale and Dorico as a grand staff you can edit and print."
          caveat="Timing is rounded onto a 4/4 sixteenth-note grid to be written down at all — read it as a tidy copy of the take, not the take."
          onExport={() =>
            downloadText(
              writeMusicXml(take, { bpm, title }),
              `${slug(title)}.musicxml`,
              'application/vnd.recordare.musicxml+xml',
            )
          }
        />
        <Divider />
        <ExportOption
          title="MIDI"
          extension=".mid"
          detail="The performance itself. Every DAW, sequencer and notation program reads it, and it is the format to pick if you intend to keep playing with the take."
          caveat="Keeps your exact timing and how hard each key was struck — nothing is rounded."
          onExport={() =>
            downloadBytes(writeMidiFile(take, { bpm }), `${slug(title)}.mid`, 'audio/midi')
          }
        />
      </div>
    </Drawer>
  )
}

function ExportOption({
  title,
  extension,
  detail,
  caveat,
  onExport,
}: {
  title: string
  extension: string
  detail: string
  caveat: string
  onExport: () => void
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <h3 className="text-ui text-[var(--ds-fg)]">{title}</h3>
        <span className="text-label-sm text-[var(--ds-fg-muted)]" data-tabular>
          {extension}
        </span>
      </div>
      <p className="text-body-sm text-[var(--ds-fg-secondary)]">{detail}</p>
      <p className="text-caption text-[var(--ds-fg-muted)]">{caveat}</p>
      <Button
        size="sm"
        variant="outlined"
        startIcon={<Download />}
        onClick={onExport}
        className="w-fit"
      >
        Export {title}
      </Button>
    </section>
  )
}

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'recording'

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  // Revoked on the next frame rather than immediately: some browsers have not
  // started reading the blob by the time the click handler returns.
  requestAnimationFrame(() => URL.revokeObjectURL(url))
}

const downloadText = (text: string, filename: string, type: string) =>
  download(new Blob([text], { type }), filename)

const downloadBytes = (bytes: Uint8Array, filename: string, type: string) =>
  download(new Blob([bytes as BlobPart], { type }), filename)
