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
  const current = useSongStore((state) => state.currentFingers)

  // Grouped by hand, left first — the order they sit in on the keyboard.
  const hands = (['left', 'right'] as const).flatMap((hand) => {
    const fingers = current.filter((entry) => entry.hand === hand).map((entry) => entry.finger)
    return fingers.length > 0 ? [{ hand, fingers }] : []
  })

  // "Finger 3 · Middle" for one note, because there is room to name it. For a
  // chord, the digits alone — and where both hands are in it, say which is
  // which, or "5 3 1 · 1" is a puzzle rather than a reading.
  //
  // Nothing playing is the ordinary case, not an edge one: it is what the card
  // shows before Start, and on any step whose fingering could not be worked
  // out. Reaching into an empty list for it threw.
  const summary =
    hands.length === 0
      ? null
      : current.length === 1
        ? `Finger ${current[0]!.finger} · ${FINGER_NAMES[current[0]!.finger]}`
        : hands.length > 1
          ? hands
              .map((side) => `${side.hand === 'left' ? 'Left' : 'Right'} ${side.fingers.join(' ')}`)
              .join(' · ')
          : `Fingers ${hands[0]!.fingers.join(' ')}`
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
        {/* One diagram per hand the step actually uses, left first, so a chord
            split across both reads the way the keyboard does. */}
        {(hands.length > 0 ? hands : [{ hand: 'right' as const, fingers: [] }]).map((side) => (
          <div key={side.hand} className="h-24 w-20 shrink-0">
            <HandDiagram hand={side.hand} fingers={side.fingers} />
          </div>
        ))}
        <div className="flex min-w-0 flex-col gap-1">
          {song.hasFingering ? (
            current.length > 0 ? (
              <>
                <span className="text-ui text-[var(--ds-fg)]">{summary}</span>
                <span className="text-body-sm text-[var(--ds-fg-secondary)]">
                  {hands.length > 1
                    ? 'Both hands together.'
                    : hands[0]!.hand === 'right'
                      ? 'Right hand.'
                      : 'Left hand.'}
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
          Worked out, not read — from the shapes the method books print and a published model of
          what a hand can reach. A fingered score always overrides it.
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
