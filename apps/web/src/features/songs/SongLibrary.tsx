import * as React from 'react'
import { FileMusic, Trash2, Upload } from 'lucide-react'
import type { Song } from '@sonara/shared'
import { importMidi } from './import-midi'
import { importMusicXml } from './import-musicxml'
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
      description="MIDI, MusicXML or a PDF score. Everything stays on this device."
      footer={<ImportButton onFiles={onFiles} />}
    >
      <div className="flex flex-col gap-3">
        {error && 'failure' in error && <ImportError result={error} />}

        {library.length === 0 ? (
          <p className="text-body-sm text-[var(--ds-fg-muted)]">
            Nothing imported yet. MIDI keeps a performance exactly as it was played; MusicXML comes
            from notation programs and knows which hand plays what. A full arrangement works too —
            its drums play on a kit and its other parts play behind you, so only the piano lands on
            the keys.
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
                  {song.source === 'midi' ? 'MIDI' : 'MusicXML'} · {song.measureCount} bars ·{' '}
                  {Math.round(song.bpm)} BPM
                  {song.handsInferred ? ' · hands guessed from pitch' : ''}
                  {(song.parts?.length ?? 0) > 1 && <>{` · ${song.parts.join(', ')}`}</>}
                </span>
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
        'There are no notes inside a PDF, only ink. Reading one takes optical music recognition, and the results always need checking by eye. MuseScore is free and can import a PDF and export MusicXML — bring that back here and everything works, fingering included.',
    },
    mxl: {
      title: 'Compressed MusicXML is not readable yet',
      detail:
        'An .mxl file is a zipped MusicXML score, and MuseScore saves this way by default. Open it and export as uncompressed .musicxml for now.',
    },
    unknown: {
      title: 'Not a file we could read',
      detail: 'Sonara reads MIDI (.mid) and MusicXML (.musicxml). This is neither.',
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
        accept=".mid,.midi,.xml,.musicxml,.mxl,.pdf,audio/midi,application/pdf,application/vnd.recordare.musicxml+xml"
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

/** Why a file could not become a song, when it could not. */
export type ImportFailure = 'pdf' | 'mxl' | 'unknown'

export type ImportResult = { song: Song } | { failure: ImportFailure; name: string }

/**
 * Reads a file as whichever format it actually is.
 *
 * Sniffed rather than trusted by extension: a `.mid` that is really XML and a
 * `.xml` that is really a MIDI file both happen when files come out of other
 * programs, and the first bytes settle it where a filename cannot.
 */
export async function readSong(file: File): Promise<ImportResult> {
  const name = file.name.replace(/\.[^.]+$/, '')
  const buffer = new Uint8Array(await file.arrayBuffer())
  const starts = (...bytes: number[]) => bytes.every((byte, index) => buffer[index] === byte)

  // "MThd" — the only thing a Standard MIDI File can begin with.
  if (starts(0x4d, 0x54, 0x68, 0x64)) {
    const song = importMidi(buffer, name)
    return song ? { song } : { failure: 'unknown', name: file.name }
  }

  // "%PDF"
  if (starts(0x25, 0x50, 0x44, 0x46)) return { failure: 'pdf', name: file.name }

  // "PK" — a zip, which for our purposes means compressed MusicXML.
  if (starts(0x50, 0x4b)) return { failure: 'mxl', name: file.name }

  const text = new TextDecoder().decode(buffer)
  if (/<score-partwise/.test(text)) {
    const song = importMusicXml(text, name)
    return song ? { song } : { failure: 'unknown', name: file.name }
  }

  return { failure: 'unknown', name: file.name }
}

export { FileMusic }
