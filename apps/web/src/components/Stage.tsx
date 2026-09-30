import { RotateCcw } from 'lucide-react'
import { accuracy } from '@sonara/shared'
import { cn } from '@/lib/cn'
import { useAudio } from '@/audio/AudioProvider'
import { EngineChip } from '@/audio/EngineChip'
import { GrandStaff } from '@/features/staff/GrandStaff'
import { ScaleScore } from '@/features/staff/ScaleScore'
import { SongScore } from '@/features/staff/SongScore'
import { SongProgress } from '@/features/songs/SongProgress'
import { useLearningStore } from '@/state/learning-store'
import { useCurrentSong, useSongStore } from '@/state/song-store'
import { useViewStore } from '@/state/view-store'

/**
 * The space between the bar and the keys: the music, written out.
 *
 * The staff gets the room here, and nothing else competes for it. What does
 * appear is transient and says one thing each — the engine asking for a key
 * press before it can make a sound, where a run has got to, how it ended — and
 * each gets out of the way again.
 */
export function Stage() {
  const topic = useLearningStore((state) => state.topic)
  const hasExercise = useLearningStore((state) => state.exercise !== null)
  const song = useCurrentSong()
  const showStaff = useViewStore((state) => state.showStaff)
  const staffView = useSongStore((state) => state.staffView)
  const scoreOpen = topic === 'songs' && song !== null
  const sheet = scoreOpen && staffView === 'sheet'

  return (
    <main className="stage" aria-label="Staff">
      {topic === 'songs' && <SongProgress />}

      <div className="stage__notices">
        <EngineNotice />
        {topic === 'scales' && <RunStatus />}
      </div>

      {showStaff && (
        <div className={cn('staff-panel', sheet && 'staff-panel--sheet')}>
          {/* Whatever has notes to read gets them written out: a song its
              score, a scale the scale. Only a topic with nothing written —
              free play — keeps the picture of the moment. */}
          {scoreOpen ? (
            <SongScore />
          ) : topic === 'scales' && hasExercise ? (
            <ScaleScore />
          ) : (
            <GrandStaff />
          )}
        </div>
      )}

      {topic === 'scales' && <RunComplete />}
    </main>
  )
}

/**
 * The engine's status, while it has something to say.
 *
 * "Press a key to start audio" is the one thing that explains silence on a
 * fresh page, so it has to be on screen. "Sampled" is the normal state and
 * says nothing — it stays in Settings, where someone looking for it will look.
 */
function EngineNotice() {
  const { status } = useAudio()
  const steady =
    status.unlocked && !status.loadingSamples && !status.fallbackReason && status.kind === 'sampled'
  if (!status.instrumentId || steady) return null
  // On the bar's navy, like the stage's other notices. The chip's own tints are
  // made for the app's dark surfaces, and its text on the bright stage measures
  // under 2:1.
  return (
    <span className="stage-chip">
      <EngineChip />
    </span>
  )
}

/** Where a run has got to, while it runs. The full picture is in the Progress panel. */
function RunStatus() {
  const session = useLearningStore((state) => state.session)
  const total = useLearningStore((state) => state.exercise?.steps.length ?? 0)
  if (session.status !== 'running') return null
  return (
    <span className="stage-pill" role="status" data-tabular>
      {session.completedSteps} / {total}
      {session.mistakes > 0 && (
        <span className="stage-pill__muted">
          {' · '}
          {session.mistakes} {session.mistakes === 1 ? 'mistake' : 'mistakes'}
        </span>
      )}
    </span>
  )
}

/**
 * How the run went, the moment it ends.
 *
 * It used to be a line in a card under the keyboard, which is to say nowhere a
 * player with their eyes on the music would see it. It sits on the music now,
 * with the one thing anyone wants next: to go again.
 */
function RunComplete() {
  const session = useLearningStore((state) => state.session)
  const steps = useLearningStore((state) => state.exercise?.steps.length ?? 0)
  const start = useLearningStore((state) => state.start)
  if (session.status !== 'complete') return null
  const percent = Math.round(accuracy(session) * 100)

  return (
    <div className="run-complete" role="status">
      <div className="flex flex-col">
        <span className="run-complete__title">Complete</span>
        <span className="run-complete__detail" data-tabular>
          {steps} notes · {percent}% accuracy ·{' '}
          {session.mistakes === 0
            ? 'clean'
            : `${session.mistakes} ${session.mistakes === 1 ? 'mistake' : 'mistakes'}`}
        </span>
      </div>
      <button type="button" className="bar-start" onClick={start}>
        <RotateCcw size={18} aria-hidden />
        <span className="bar-start__label">Again</span>
      </button>
    </div>
  )
}
