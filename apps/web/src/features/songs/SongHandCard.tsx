import { Info } from 'lucide-react'
import { keyName } from '@sonara/shared'
import { Card } from '@/ui/Surface'
import { Chip } from '@/ui/Display'
import { HandDiagram } from '@/features/learning/HandDiagram'
import { useCurrentSong, useSongStore } from '@/state/song-store'

const FINGER_NAMES = ['', 'Thumb', 'Index', 'Middle', 'Ring', 'Little'] as const

/**
 * The hand, and what the file could tell us about it.
 *
 * Fingering is the one thing a piece can carry that nothing else can reproduce.
 * MusicXML has a place for it; MIDI has none, so a MIDI import never has it and
 * no amount of parsing will change that.
 *
 * Where the file says nothing, Sonara works out what it can — but a suggested
 * finger and one an editor wrote have to be tellable apart, or the suggestion
 * borrows an authority it does not have. So the card always names which it is
 * showing, and the two are never drawn the same way.
 */
export function SongHandCard() {
  const song = useCurrentSong()
  const mode = useSongStore((state) => state.mode)
  const finger = useSongStore((state) => state.currentFinger)
  const hand = useSongStore((state) => state.currentHand)
  if (!song) return null

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-label text-[var(--ds-fg)]">Hand position</h3>
        {song.key && (
          <Chip tone={song.key.declared ? 'neutral' : 'warning'}>
            {keyName(song.key)}
            {song.key.declared ? '' : ' · estimated'}
          </Chip>
        )}
        {/* The same words the Scales tab uses, because it is the same claim:
            Standard means somebody published it, Suggested means we worked it
            out. One vocabulary for both, so the distinction carries. */}
        {song.hasFingering && (
          <Chip tone={song.fingeringSource === 'score' ? 'neutral' : 'warning'}>
            {song.fingeringSource === 'score' ? 'Fingered score' : 'Suggested'}
          </Chip>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="h-24 w-20 shrink-0">
          <HandDiagram hand={hand} finger={finger ?? null} />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          {song.hasFingering ? (
            finger ? (
              <>
                <span className="text-ui text-[var(--ds-fg)]">
                  Finger {finger} · {FINGER_NAMES[finger]}
                </span>
                <span className="text-body-sm text-[var(--ds-fg-secondary)]">
                  {hand === 'right' ? 'Right hand' : 'Left hand'}, from the score.
                </span>
              </>
            ) : (
              <span className="text-body-sm text-[var(--ds-fg-secondary)]">
                {mode === 'learn'
                  ? 'Press Start, and the finger for each note appears here.'
                  : 'Switch to Learn to follow the fingering note by note.'}
              </span>
            )
          ) : (
            <>
              <span className="text-ui text-[var(--ds-fg)]">No fingering in this file</span>
              <span className="text-body-sm text-[var(--ds-fg-secondary)]">
                {song.source === 'midi'
                  ? 'MIDI has nowhere to record which finger plays a note — the format simply has no field for it.'
                  : 'This score was written without fingering marked.'}{' '}
                Import a fingered MusicXML file and the numbers appear here.
              </span>
            </>
          )}
        </div>
      </div>

      {song.fingeringSource === 'derived' && (
        <p className="flex items-start gap-2 text-caption text-[var(--ds-fg-muted)]">
          <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
          Worked out, not read. Single notes only — chords are left blank rather than guessed, and a
          fingered score always overrides this.
        </p>
      )}

      {!song.hasFingering && (
        <p className="flex items-start gap-2 text-caption text-[var(--ds-fg-muted)]">
          <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
          Nothing could be worked out here either — a guessed finger drawn as though the score asked
          for it is worse than none.
        </p>
      )}
    </Card>
  )
}
