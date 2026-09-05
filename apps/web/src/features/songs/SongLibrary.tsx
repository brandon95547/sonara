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
  const [error, setError] = React.useState<string | null>(null)

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setError(null)
    for (const file of files) {
      const song = await readSong(file)
      if (song) add(song)
      else setError(`${file.name} is not a MIDI or MusicXML file we could read.`)
    }
    if (files.length) onClose()
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="My songs"
      description="Imported pieces. They stay on this device."
      footer={<ImportButton onFiles={onFiles} />}
    >
      <div className="flex flex-col gap-3">
        {error && <p className="text-body-sm text-[var(--ds-danger-text)]">{error}</p>}

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
        accept=".mid,.midi,.xml,.musicxml,audio/midi,application/vnd.recordare.musicxml+xml"
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

/** Reads a file as whichever format it actually is. */
export async function readSong(file: File): Promise<Song | null> {
  const name = file.name.replace(/\.[^.]+$/, '')
  const buffer = new Uint8Array(await file.arrayBuffer())

  // "MThd" is the only thing a Standard MIDI File can begin with.
  const isMidi =
    buffer[0] === 0x4d && buffer[1] === 0x54 && buffer[2] === 0x68 && buffer[3] === 0x64
  if (isMidi) return importMidi(buffer, name)

  const text = new TextDecoder().decode(buffer)
  if (/<score-partwise/.test(text)) return importMusicXml(text, name)

  // A .mxl is zipped MusicXML: recognisable, and worth saying so rather than
  // failing as "unreadable file".
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) return null
  return null
}

export { FileMusic }
