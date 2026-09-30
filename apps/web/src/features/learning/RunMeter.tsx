import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

/** Past this many steps the segments are thinner than the gaps between them. */
const MAX_SEGMENTS = 40

/**
 * How far through a run you are, drawn the way a game draws it.
 *
 * It was "7 / 15" in a pill — accurate, and something to read rather than to
 * see. A bar fills, which the eye takes in from the edge of the view while the
 * hands are busy; each note is a segment of it, so a short scale visibly
 * counts up note by note; and each step lands with a flash at the leading
 * edge, so getting one right feels like it.
 *
 * A wrong note flashes the bar red and adds to the tally after it. The
 * keyboard already shows which key was wrong; this is the score keeping count.
 */
export function RunMeter({
  done,
  total,
  mistakes = 0,
  label,
  className,
}: {
  done: number
  total: number
  mistakes?: number
  /** What the progress is through — "the scale", "the song". */
  label: string
  className?: string
}) {
  const fraction = total > 0 ? Math.min(1, done / total) : 0
  const segments = total > 0 && total <= MAX_SEGMENTS ? total : 0
  const mistakeText = `${mistakes} ${mistakes === 1 ? 'mistake' : 'mistakes'}`

  return (
    <div className={cn('run-meter', className)} data-tabular>
      <div
        className="run-meter__track"
        role="progressbar"
        aria-label={`Progress through ${label}`}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={`${done} of ${total}`}
        style={{ '--fill': `${fraction * 100}%` } as React.CSSProperties}
      >
        <span className="run-meter__fill" />
        {segments > 0 && (
          <span
            className="run-meter__segments"
            style={{ '--segments': segments } as React.CSSProperties}
          />
        )}
        {/* Keyed on the count, so each one remounts and plays its animation
            once: a flash at the front for a step, a red wash for a miss. */}
        {done > 0 && <span key={`step-${done}`} className="run-meter__spark" />}
        {mistakes > 0 && <span key={`miss-${mistakes}`} className="run-meter__hit" />}
      </div>
      <span className="run-meter__count">
        {done}/{total}
      </span>
      {mistakes > 0 && (
        <span className="run-meter__misses" title={mistakeText} aria-label={mistakeText}>
          <X size={12} strokeWidth={3} aria-hidden />
          {mistakes}
        </span>
      )}
    </div>
  )
}
