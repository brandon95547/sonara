import * as React from 'react'
import { create } from 'zustand'
import { Loader2, Search, Trash2, Upload } from 'lucide-react'
import type { Song } from '@sonara/shared'
import { cn } from '@/lib/cn'
import { Button, IconButton } from '@/ui/Button'
import { controlShell } from '@/ui/Controls'
import { Dialog } from '@/ui/Dialog'
import { useSongStore } from '@/state/song-store'
import {
  SONG_CATALOG,
  SONG_STYLES,
  catalogSongId,
  loadCatalogSong,
  type CatalogSong,
  type SongStyle,
} from './catalog'
import { readSong, type ImportFailure, type ImportResult } from './read-song'

/**
 * Choosing a song: the ones that come with Sonara, by style, and the player's
 * own, with the way to import more.
 *
 * A dialog, and the first thing the Songs area shows, because the area has
 * nothing to put on the staff until one is chosen. It is the only place a song
 * is chosen from: the built-in pieces and the imported ones are one list to
 * the person looking for something to play, and two places to look would be a
 * fact about where the files are kept.
 *
 * The import is deliberately format-sniffing rather than extension-trusting.
 * A `.mid` that is really XML, or a `.xml` that is really a MIDI file, are both
 * things that happen when files come out of other programs, and the first four
 * bytes settle it in a way a filename never can.
 */

/** What the list is showing: everything, one style, or the player's own. */
type Shelf = 'all' | SongStyle | 'mine'

// Outside the component, so the menu's Import can turn to the player's own
// songs before the chooser is on screen.
const useShelfStore = create<{ shelf: Shelf }>(() => ({ shelf: 'all' }))

/** Turns the chooser to the player's own songs, where importing happens. */
export const showMySongs = () => useShelfStore.setState({ shelf: 'mine' })

/** Named for what the file is, not for what it is closest to. */
const SOURCE_LABELS: Record<string, string> = {
  midi: 'MIDI',
  musicxml: 'MusicXML',
  musescore: 'MuseScore',
}

/** Lower case and without accents, so "fur elise" finds "Für Elise". */
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const row = [
  'flex w-full items-center gap-3 rounded-[var(--radius-md)] border p-2.5 text-left',
  'transition-[background-color,border-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)]',
].join(' ')
const rowIdle =
  'border-[var(--ds-border-subtle)] hover:border-[var(--ds-border-strong)] hover:bg-[var(--ds-layer-hover)]'
const rowCurrent = 'border-[var(--ds-accent-border)] bg-[var(--ds-layer-selected)]'
const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-focus-ring)]'

export function SongPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const library = useSongStore((state) => state.library)
  const builtIn = useSongStore((state) => state.builtIn)
  const currentId = useSongStore((state) => state.currentId)
  const { add, open: openSong, openBuiltIn, remove } = useSongStore.getState()
  const shelf = useShelfStore((state) => state.shelf)
  const [query, setQuery] = React.useState('')
  /** The built-in song being fetched, by its catalog id. */
  const [loading, setLoading] = React.useState<string | null>(null)
  const [failed, setFailed] = React.useState<CatalogSong | null>(null)
  const [importError, setImportError] = React.useState<ImportResult | null>(null)
  const request = React.useRef<AbortController | null>(null)

  // Shut, it forgets what was typed and what went wrong: the next time it
  // opens is another errand. The shelf is kept, since that is where they were.
  React.useEffect(() => {
    if (open) return
    request.current?.abort()
    setQuery('')
    setLoading(null)
    setFailed(null)
    setImportError(null)
  }, [open])

  const chooseBuiltIn = async (entry: CatalogSong) => {
    const held = builtIn.find((song) => song.id === catalogSongId(entry))
    if (held) {
      openBuiltIn(held)
      onClose()
      return
    }
    // Choosing another while one is on its way is changing your mind.
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setFailed(null)
    setLoading(entry.id)
    try {
      const song = await loadCatalogSong(entry, controller.signal)
      if (controller.signal.aborted) return
      openBuiltIn(song)
      onClose()
    } catch {
      if (!controller.signal.aborted) setFailed(entry)
    } finally {
      if (request.current === controller) setLoading(null)
    }
  }

  const onFiles = async (list: FileList | null) => {
    // Copied out before the first await. A FileList is a live view of the
    // input, and the input is cleared the moment this returns — so reading it
    // again after an await finds it empty, and the dialog never closes.
    const files = [...(list ?? [])]
    if (files.length === 0) return

    setImportError(null)
    let imported = 0
    for (const file of files) {
      const result = await readSong(file)
      if ('song' in result) {
        add(result.song)
        imported++
      } else {
        setImportError(result)
      }
    }
    // Out of the way once there is something to play. A file we could not read
    // keeps the dialog open, with the reason on screen.
    if (imported > 0) onClose()
  }

  const sought = fold(query.trim())
  const searching = sought.length > 0
  // A search looks everywhere: someone typing a name is not thinking about
  // which shelf it is on.
  const styles =
    searching || shelf === 'all' ? SONG_STYLES : SONG_STYLES.filter((style) => style.id === shelf)
  const sections = styles
    .map((style) => ({
      style,
      songs: SONG_CATALOG.filter(
        (entry) =>
          entry.style === style.id &&
          (!searching ||
            fold(`${entry.title} ${entry.composer} ${entry.edition ?? ''}`).includes(sought)),
      ),
    }))
    .filter((section) => section.songs.length > 0)
  const mine = searching
    ? library.filter((song) => fold(song.title).includes(sought))
    : shelf === 'all' || shelf === 'mine'
      ? library
      : []
  const showMine = searching ? mine.length > 0 : shelf === 'mine' || mine.length > 0
  const nothing = searching && sections.length === 0 && mine.length === 0

  const shelves: readonly { id: Shelf; label: string; count: number }[] = [
    { id: 'all', label: 'All songs', count: SONG_CATALOG.length + library.length },
    ...SONG_STYLES.map((style) => ({
      id: style.id,
      label: style.label,
      count: SONG_CATALOG.filter((entry) => entry.style === style.id).length,
    })),
    { id: 'mine', label: 'My songs', count: library.length },
  ]

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Choose a song"
      description="Pick a piece to learn, or import one of your own."
      size="xl"
      tall
      flush
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <p className="text-caption text-[var(--ds-fg-muted)]">
            MusicXML · MuseScore · MIDI. Imported songs stay on this device.
          </p>
          <ImportButton onFiles={onFiles} />
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* A column of shelves beside the list, and a row of them above it
            where there is no room for a column. */}
        <div className="flex shrink-0 flex-col gap-3 border-b border-[var(--ds-border-subtle)] py-4 md:w-56 md:border-r md:border-b-0">
          <div className="relative px-6 md:pr-4">
            <Search
              size={15}
              className="pointer-events-none absolute top-1/2 left-9 -translate-y-1/2 text-[var(--ds-fg-muted)]"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search songs"
              aria-label="Search songs"
              className={cn(
                controlShell(),
                // Sixteen pixels where a finger types: smaller, and a phone zooms
                // the page in to the field.
                'h-9 rounded-[var(--radius-md)] pr-3 pl-9 text-body text-[var(--ds-fg)] placeholder:text-[var(--ds-fg-muted)] md:text-body-sm',
              )}
            />
          </div>
          <div
            role="group"
            aria-label="Show"
            className="scrollbar-none flex gap-1.5 overflow-x-auto px-6 md:min-h-0 md:flex-1 md:flex-col md:gap-0.5 md:overflow-x-visible md:overflow-y-auto md:pr-4"
          >
            {shelves.map((entry) => {
              const on = !searching && shelf === entry.id
              return (
                <button
                  key={entry.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setQuery('')
                    useShelfStore.setState({ shelf: entry.id })
                  }}
                  className={cn(
                    'flex h-8 shrink-0 items-center justify-between gap-3 rounded-[var(--radius-md)] px-3 text-label whitespace-nowrap coarse:h-11',
                    'transition-[background-color,color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)]',
                    // Inside the button: the row scrolls, and would clip a ring
                    // drawn outside it.
                    'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ds-focus-ring)]',
                    // My songs is the player's, the rest came with the app.
                    entry.id === 'mine' && 'md:mt-2',
                    on
                      ? 'bg-[var(--ds-layer-selected)] text-[var(--ds-fg)]'
                      : 'text-[var(--ds-fg-secondary)] hover:bg-[var(--ds-layer-hover)] hover:text-[var(--ds-fg)]',
                  )}
                >
                  {entry.label}
                  <span className="text-caption text-[var(--ds-fg-muted)]" data-tabular>
                    {entry.count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
          {failed && (
            <Notice
              title={`Could not load ${failed.title}`}
              detail="The score did not arrive. Check the connection and choose it again."
            />
          )}
          {importError && 'failure' in importError && <ImportError result={importError} />}

          {nothing && (
            <p className="text-body-sm text-[var(--ds-fg-muted)]">
              No song matches “{query.trim()}”.
            </p>
          )}

          {showMine && (
            <Shelved title="My songs">
              {mine.length === 0 ? (
                <p className="text-body-sm text-[var(--ds-fg-muted)]">
                  Nothing imported yet. A MusicXML or MuseScore file is the one to bring if you have
                  a choice: those carry the staves, the dynamics, the pedaling and the fingering.
                  MIDI keeps a performance exactly as played, and carries none of those — the format
                  has nowhere to put them.
                </p>
              ) : (
                <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                  {mine.map((song) => (
                    <ImportedRow
                      key={song.id}
                      song={song}
                      current={song.id === currentId}
                      onChoose={() => {
                        openSong(song.id)
                        onClose()
                      }}
                      onRemove={() => remove(song.id)}
                    />
                  ))}
                </ul>
              )}
            </Shelved>
          )}

          {shelf !== 'mine' || searching
            ? sections.map(({ style, songs }) => (
                <Shelved key={style.id} title={style.label}>
                  <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                    {songs.map((entry) => (
                      <li key={entry.id}>
                        <button
                          type="button"
                          aria-busy={loading === entry.id || undefined}
                          aria-current={catalogSongId(entry) === currentId ? 'true' : undefined}
                          onClick={() => void chooseBuiltIn(entry)}
                          className={cn(
                            row,
                            focusRing,
                            catalogSongId(entry) === currentId ? rowCurrent : rowIdle,
                          )}
                        >
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-ui text-[var(--ds-fg)]">
                              {entry.title}
                            </span>
                            <span className="truncate text-caption text-[var(--ds-fg-muted)]">
                              {entry.composer}
                              {entry.edition && ` · ${entry.edition}`}
                            </span>
                          </span>
                          {loading === entry.id ? (
                            <Loader2
                              size={16}
                              className="shrink-0 animate-spin text-[var(--ds-fg-muted)]"
                              aria-label="Loading"
                            />
                          ) : (
                            catalogSongId(entry) === currentId && <OpenMark />
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </Shelved>
              ))
            : null}
        </div>
      </div>
    </Dialog>
  )
}

/** A shelf of the list: its name, a label's distance above what it names. */
function Shelved({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-overline text-[var(--ds-fg-muted)] uppercase">{title}</h3>
      {children}
    </section>
  )
}

/** Says which song is the one already open. */
function OpenMark() {
  return <span className="shrink-0 text-label-sm text-[var(--ds-accent-text)]">Open</span>
}

function ImportedRow({
  song,
  current,
  onChoose,
  onRemove,
}: {
  song: Song
  current: boolean
  onChoose: () => void
  onRemove: () => void
}) {
  return (
    <li className={cn(row, 'coarse:gap-4', current ? rowCurrent : rowIdle)}>
      <button
        type="button"
        aria-current={current ? 'true' : undefined}
        onClick={onChoose}
        className={cn('flex min-w-0 flex-1 flex-col items-start text-left', focusRing)}
      >
        <span className="w-full truncate text-ui text-[var(--ds-fg)]">{song.title}</span>
        <span className="text-caption text-[var(--ds-fg-muted)]">
          {SOURCE_LABELS[song.source] ?? 'Score'} · {song.measureCount}{' '}
          {song.measureCount === 1 ? 'bar' : 'bars'} · {Math.round(song.bpm)} BPM
          {song.handsInferred ? ' · hands guessed from pitch' : ''}
          {(song.parts?.length ?? 0) > 1 && <>{` · ${song.parts.join(', ')}`}</>}
        </span>
        <Provided song={song} />
        {song.partsKnown === false && (
          <span className="mt-1 text-caption text-[var(--ds-warning-text)]">
            Imported before drums were separated, so every part plays on the piano. Import the file
            again to split them.
          </span>
        )}
      </button>
      {current && <OpenMark />}
      <IconButton
        size="sm"
        variant="text"
        label={`Remove ${song.title}`}
        icon={<Trash2 />}
        onClick={onRemove}
      />
    </li>
  )
}

function Notice({ title, detail, name }: { title: string; detail: string; name?: string }) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--ds-warning-border)] bg-[var(--ds-warning-subtle)] p-3"
    >
      <span className="text-ui text-[var(--ds-fg)]">{title}</span>
      <span className="text-body-sm text-[var(--ds-fg-secondary)]">{detail}</span>
      {name && <span className="text-caption text-[var(--ds-fg-muted)]">{name}</span>}
    </div>
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
      detail: 'The format was recognized, but there were no notes in it.',
    },
    unknown: {
      title: 'Not a file we could read',
      detail: 'Sonara reads MusicXML, MuseScore and MIDI files.',
    },
  }[result.failure]

  return <Notice title={body.title} detail={body.detail} name={result.name} />
}

/**
 * What the file carried, and what it did not.
 *
 * Every format loses something different and the player has no way to tell
 * which — "no pedaling in this piece" and "this file did not record pedaling"
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

function ImportButton({ onFiles }: { onFiles: (files: FileList | null) => void }) {
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
      {/* Outlined: what this dialog is for is choosing, and the songs are the
          way to do that. Importing is the other thing you can do here. */}
      <Button
        size="sm"
        variant="outlined"
        startIcon={<Upload />}
        onClick={() => input.current?.click()}
      >
        Import a song
      </Button>
    </>
  )
}
