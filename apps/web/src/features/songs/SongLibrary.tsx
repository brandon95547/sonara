import * as React from 'react'
import { FileMusic, Trash2, Upload } from 'lucide-react'
import type { Song } from '@sonara/shared'
import { readSong, type ImportFailure, type ImportResult } from './read-song'
import { Button, IconButton } from '@/ui/Button'
import { Drawer } from '@/ui/Drawer'
import { useSongStore } from '@/state/song-store'

/**
 * My songs: what has been imported, and the way to import more.
 *
 * The import is deliberately format-sniffing rather than extension-trusting.
 * A `.mid` that is really XML, or a `.xml` that is really a MIDI file, are both
 * things that happen when files come out of other programs, and the first four
 * bytes settle it in a way a filename never can.
 */
/** Named for what the file is, not for what it is closest to. */
const SOURCE_LABELS: Record<string, string> = {
  midi: 'MIDI',
  musicxml: 'MusicXML',
  musescore: 'MuseScore',
}

export function SongLibrary({ open, onClose }: { open: boolean; onClose: () => void }) {
  const library = useSongStore((state) => state.library)
  const currentId = useSongStore((state) => state.currentId)
  const add = useSongStore((state) => state.add)
  const choose = useSongStore((state) => state.open)
  const remove = useSongStore((state) => state.remove)
  const [error, setError] = React.useState<ImportResult | null>(null)

  const onFiles = async (list: FileList | null) => {
    // Copied out before the first await. A FileList is a live view of the
    // input, and the input is cleared the moment this returns — so reading it
    // again after an await finds it empty, and the drawer never closes.
    const files = [...(list ?? [])]
    if (files.length === 0) return

    setError(null)
    let imported = 0
    for (const file of files) {
      const result = await readSong(file)
      if ('song' in result) {
        add(result.song)
        imported++
      } else {
        setError(result)
      }
    }
    // Out of the way once there is something to play. A file we could not read
    // keeps the drawer open, with the reason on screen.
    if (imported > 0) onClose()
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="My songs"
      description="MusicXML · MuseScore · MIDI. Everything stays on this device."
      footer={<ImportButton onFiles={onFiles} />}
    >
      <div className="flex flex-col gap-3">
        {error && 'failure' in error && <ImportError result={error} />}

        {library.length === 0 ? (
          <p className="text-body-sm text-[var(--ds-fg-muted)]">
            Nothing imported yet. A MusicXML or MuseScore file is the one to bring if you have a
            choice: those carry the staves, the dynamics, the pedalling and the fingering. MIDI
            keeps a performance exactly as played, and carries none of those — the format has
            nowhere to put them.
          </p>
        ) : (
          library.map((song) => (
            <div
              key={song.id}
              className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--ds-border-subtle)] p-2.5"
            >
              <button
                type="button"
                onClick={() => {
                  choose(song.id)
                  onClose()
                }}
                className="flex min-w-0 flex-1 flex-col items-start text-left"
              >
                <span className="truncate text-ui text-[var(--ds-fg)]">
                  {song.title}
                  {song.id === currentId && (
                    <span className="ml-2 text-label-sm text-[var(--ds-accent-text)]">Open</span>
                  )}
                </span>
                <span className="text-caption text-[var(--ds-fg-muted)]">
                  {SOURCE_LABELS[song.source] ?? 'Score'} · {song.measureCount}{' '}
                  {song.measureCount === 1 ? 'bar' : 'bars'} · {Math.round(song.bpm)} BPM
                  {song.handsInferred ? ' · hands guessed from pitch' : ''}
                  {(song.parts?.length ?? 0) > 1 && <>{` · ${song.parts.join(', ')}`}</>}
                </span>
                <Provided song={song} />
                {song.partsKnown === false && (
                  <span className="mt-1 text-caption text-[var(--ds-warning-text)]">
                    Imported before drums were separated, so every part plays on the piano. Import
                    the file again to split them.
                  </span>
                )}
              </button>
              <IconButton
                size="sm"
                variant="text"
                label={`Remove ${song.title}`}
                icon={<Trash2 />}
                onClick={() => remove(song.id)}
              />
            </div>
          ))
        )}
      </div>
    </Drawer>
  )
}

/**
 * What went wrong, and what to do about it.
 *
 * Each failure needs its own sentence. "Unsupported file" tells someone
 * holding a PDF of the piece they want to learn nothing they can act on, and
 * the three cases here have three genuinely different answers.
 */
function ImportError({ result }: { result: Extract<ImportResult, { failure: ImportFailure }> }) {
  const body = {
    pdf: {
      title: 'A PDF is a picture of the music, not the music',
      detail:
        'There are no notes inside a PDF, only ink — reading one needs optical recognition, and the result always needs checking by eye. MuseScore is free and can open a PDF and save it as MuseScore or MusicXML. Bring that back here and everything works.',
    },
    empty: {
      title: 'Nothing playable in this file',
      detail: 'The format was recognised, but there were no notes in it.',
    },
    unknown: {
      title: 'Not a file we could read',
      detail: 'Sonara reads MusicXML, MuseScore and MIDI files.',
    },
  }[result.failure]

  return (
    <div className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--ds-warning-border)] bg-[var(--ds-warning-subtle)] p-3">
      <span className="text-ui text-[var(--ds-fg)]">{body.title}</span>
      <span className="text-body-sm text-[var(--ds-fg-secondary)]">{body.detail}</span>
      <span className="text-caption text-[var(--ds-fg-muted)]">{result.name}</span>
    </div>
  )
}

/**
 * What the file carried, and what it did not.
 *
 * Every format loses something different and the player has no way to tell
 * which — "no pedalling in this piece" and "this file did not record pedalling"
 * look identical once imported. Saying so is the only way to tell them apart,
 * and it is also the argument for bringing a score rather than a MIDI.
 */
function Provided({ song }: { song: Song }) {
  const provides = song.provides
  if (!provides) return null

  const labels: [keyof typeof provides, string][] = [
    ['rhythm', 'Rhythm'],
    ['staves', 'Hands'],
    ['dynamics', 'Dynamics'],
    ['pedal', 'Pedal'],
    ['fingering', 'Fingering'],
  ]
  const missing = labels.filter(([key]) => !provides[key])
  if (missing.length === 0) return null

  return (
    <span className="mt-0.5 text-caption text-[var(--ds-fg-muted)]">
      Not in this file: {missing.map(([, label]) => label.toLowerCase()).join(', ')}
    </span>
  )
}

export function ImportButton({
  onFiles,
  label = 'Import a song',
}: {
  onFiles: (files: FileList | null) => void
  label?: string
}) {
  const input = React.useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".musicxml,.xml,.mxl,.mscz,.mid,.midi,audio/midi,application/vnd.recordare.musicxml+xml"
        multiple
        hidden
        onChange={(event) => {
          onFiles(event.target.files)
          // Cleared so choosing the same file twice in a row still fires.
          event.target.value = ''
        }}
      />
      <Button size="sm" startIcon={<Upload />} onClick={() => input.current?.click()}>
        {label}
      </Button>
    </>
  )
}

export { FileMusic }
