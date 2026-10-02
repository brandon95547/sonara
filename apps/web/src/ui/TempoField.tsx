import * as React from 'react'
import { ChevronDown, ChevronUp, Music2 } from 'lucide-react'
import { cn } from '@/lib/cn'

/** How long a held arrow waits before it starts repeating, and how fast it then goes. */
const HOLD_DELAY_MS = 400
const HOLD_EVERY_MS = 90

/**
 * The tempo, set where it is shown: a number to type over and two arrows.
 *
 * It was an icon that opened a panel with a stepper and a slider in it — two
 * presses to nudge a setting that is nudged all the time. Here the number is
 * always on the bar, an arrow moves it a step, holding an arrow runs it, and a
 * jump from 60 to 120 is typing 120.
 *
 * The Bible's number input, with its three rules kept: the value is clamped
 * when the field is left rather than on every keystroke (typing 120 passes
 * through 1 and 12); an arrow at its bound is disabled, not removed; and it is
 * a text field with a numeric keypad rather than `type="number"`, so the scroll
 * wheel cannot change a tempo nobody touched.
 */
export function TempoField({
  value,
  min,
  max,
  step = 4,
  onChange,
  label = 'Tempo',
  detail,
  panel = false,
  className,
}: {
  /** Beats a minute. */
  value: number
  min: number
  max: number
  /** What an arrow button moves it by. The arrow keys move it by one. */
  step?: number
  onChange: (bpm: number) => void
  label?: string
  /** Added to the tooltip — what the number is a tempo of. */
  detail?: string
  /** On a panel's surface rather than the bar's. */
  panel?: boolean
  className?: string
}) {
  // What has been typed and not yet entered. Null when the field shows the tempo.
  const [draft, setDraft] = React.useState<string | null>(null)
  const clamp = (bpm: number) => Math.min(max, Math.max(min, Math.round(bpm)))

  // The repeat reads the tempo as it is now, not as it was when the press began
  // — and as it has just been set, without waiting on a render to be told.
  const current = React.useRef(value)
  current.current = value
  const hold = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const release = React.useCallback(() => {
    if (hold.current !== null) clearTimeout(hold.current)
    hold.current = null
  }, [])
  React.useEffect(() => release, [release])

  /** Moves the tempo, from what is typed if something is. False once it is at its bound. */
  const move = (by: number, typed?: string | null): boolean => {
    const from = typed ? clamp(Number.parseInt(typed, 10)) : current.current
    const next = clamp(from + by)
    setDraft(null)
    if (next !== current.current) {
      current.current = next
      onChange(next)
    }
    return next !== from
  }
  const press = (by: number) => {
    release()
    // At the bound the arrow goes disabled under the pointer and never hears
    // the release, so the repeat ends itself rather than waiting to be told.
    const again = () => {
      hold.current = move(by) ? setTimeout(again, HOLD_EVERY_MS) : null
    }
    if (move(by)) hold.current = setTimeout(again, HOLD_DELAY_MS)
  }

  const enter = () => {
    if (draft === null) return
    const typed = Number.parseInt(draft, 10)
    setDraft(null)
    if (Number.isFinite(typed) && typed !== value) onChange(clamp(typed))
  }

  const name = `${label}: ${value} BPM${detail ? `, ${detail}` : ''}`
  const arrow = (by: number, title: string, Icon: typeof ChevronUp, atBound: boolean) => (
    <button
      type="button"
      className="tempo-field__step"
      // The field takes the arrow keys, so the arrows are not Tab stops of
      // their own — the way a native spin button's are not.
      tabIndex={-1}
      aria-label={title}
      title={title}
      disabled={atBound}
      onPointerDown={(event) => {
        if (event.button === 0) press(by)
      }}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      // A pointer has already moved it, on the way down. This is a click that
      // came from somewhere else: a screen reader, a switch.
      onClick={(event) => {
        if (event.detail === 0) move(by)
      }}
    >
      <Icon size={14} aria-hidden />
    </button>
  )

  return (
    <div
      className={cn('tempo-field', panel && 'tempo-field--panel', className)}
      role="group"
      aria-label={label}
      title={name}
    >
      <span className="tempo-field__icon" aria-hidden>
        <Music2 size={16} />
      </span>
      <input
        className="tempo-field__value"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        role="spinbutton"
        aria-label={`${label}, beats per minute`}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        value={draft ?? String(value)}
        onFocus={(event) => event.target.select()}
        onChange={(event) => setDraft(event.target.value.replace(/\D/g, '').slice(0, 3))}
        onBlur={enter}
        onKeyDown={(event) => {
          if (event.key === 'Enter') enter()
          else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault()
            move(event.key === 'ArrowUp' ? 1 : -1, draft)
          } else if (event.key === 'Escape' && draft !== null) {
            // Escape gives up what was typed. It stops here, so that it does not
            // also close whatever panel the field happens to be next to.
            event.stopPropagation()
            setDraft(null)
          }
        }}
      />
      <span className="tempo-field__steps">
        {arrow(step, 'Faster', ChevronUp, value >= max)}
        {arrow(-step, 'Slower', ChevronDown, value <= min)}
      </span>
    </div>
  )
}
