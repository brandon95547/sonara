import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'

/* ===========================================================================
   FORM CONTROLS — UI Bible spec.

   The field sits on --ds-field, which is ABOVE every surface in the ramp, the
   overlay included. Material 3's rule and the Bible's: a control you can act
   on is a surface standing on the page, not a hole cut into it. Using the
   inset token here lands a field below the card it sits in, which reads as a
   recess and — on a near-black canvas — as a control that has been switched
   off.
   ======================================================================== */

export type ControlSize = 'sm' | 'md'

const controlSizes: Record<ControlSize, string> = {
  sm: 'h-8 text-body-sm rounded-[var(--radius-md)]',
  md: 'h-9 text-body rounded-[var(--radius-md)]',
}

export function controlShell(disabled?: boolean) {
  return cn(
    'w-full bg-[var(--ds-field)] border border-[var(--ds-border-interactive)]',
    'transition-[border-color,box-shadow,background-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)]',
    // The hover lift is the other half of "this is a control": it answers the
    // pointer. Suppressed when disabled, which is not a control.
    !disabled && 'hover:bg-[var(--ds-field-hover)] hover:border-[var(--ds-border-strong)]',
    // Focus is a border colour change plus a 3px halo. The halo is what makes
    // it visible at a glance; the border change is what makes it precise.
    'focus:outline-none focus-visible:outline-none',
    'focus:border-[var(--ds-accent)] focus:shadow-[0_0_0_3px_var(--ds-accent-subtle)]',
    disabled && 'cursor-not-allowed opacity-50',
  )
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string
  hint?: React.ReactNode
  htmlFor?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-label text-[var(--ds-fg-secondary)]">
        {label}
      </label>
      {children}
      {hint && <p className="text-caption text-[var(--ds-fg-muted)]">{hint}</p>}
    </div>
  )
}

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

/**
 * Native select. Under about fifteen known options with no search need, the
 * native control wins outright: free keyboard support, a free mobile wheel
 * picker, and zero bundle cost. A custom listbox has to re-implement all of it
 * and usually gets type-ahead wrong.
 */
export function Select({
  options,
  size = 'md',
  className,
  ...rest
}: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> & {
  options: readonly SelectOption[]
  size?: ControlSize
}) {
  return (
    <div className="relative">
      <select
        className={cn(
          controlShell(rest.disabled),
          controlSizes[size],
          // 36px of right padding, not 12: the chevron needs 16px plus its own
          // gutter, or a long option label collides with it.
          'cursor-pointer appearance-none pl-3 pr-9 text-[var(--ds-fg)]',
          className,
        )}
        {...rest}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={15}
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ds-fg-muted)]"
      />
    </div>
  )
}

/** A row of mutually exclusive options. Use under about five choices. */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T
  onChange: (value: T) => void
  options: readonly { value: T; label: string }[]
  label: string
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'inline-flex w-full items-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--ds-border-interactive)] bg-[var(--ds-field)] p-0.5',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'h-7 flex-1 rounded-[var(--radius-sm)] px-2 text-label-sm transition-colors duration-[120ms]',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ds-focus-ring)]',
              selected
                ? 'bg-[var(--ds-accent)] text-[var(--ds-accent-fg)]'
                : 'text-[var(--ds-fg-secondary)] hover:bg-[var(--ds-layer-hover)] hover:text-[var(--ds-fg)]',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  id,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  id?: string
}) {
  const generated = React.useId()
  const inputId = id ?? generated
  return (
    // `control-row` gives the row a 44px minimum under a finger. On the row
    // rather than on the switch: growing an 18px control to 44px would wreck
    // the panel's rhythm, and the label is part of the target anyway.
    <div className="control-row flex items-start justify-between gap-4">
      <label htmlFor={inputId} className="flex min-w-0 cursor-pointer flex-col gap-0.5">
        <span className="text-ui text-[var(--ds-fg)]">{label}</span>
        {description && (
          <span className="text-caption text-[var(--ds-fg-muted)]">{description}</span>
        )}
      </label>
      <button
        id={inputId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors duration-[160ms] ease-[cubic-bezier(0.2,0,0,1)]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-focus-ring)]',
          checked
            ? 'bg-[var(--ds-accent)]'
            : 'bg-[var(--ds-field)] border border-[var(--ds-border-strong)]',
        )}
      >
        <span
          className={cn(
            'absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow-e1',
            'transition-[left] duration-[160ms] ease-[cubic-bezier(0.32,0.72,0,1)]',
            checked ? 'left-[21px]' : 'left-[3px]',
          )}
        />
      </button>
    </div>
  )
}

export function Slider({
  value,
  onChange,
  onCommit,
  min,
  max,
  step = 1,
  label,
  formatValue,
  id,
  origin = 'start',
}: {
  value: number
  onChange: (value: number) => void
  /**
   * Fired when the drag ends, not on every frame of it. `onChange` keeps the
   * thumb under the finger; `onCommit` is where a save belongs — a slider wired
   * straight to a mutation sends eighty requests to move twelve semitones.
   */
  onCommit?: (value: number) => void
  min: number
  max: number
  step?: number
  label: string
  formatValue?: (value: number) => string
  id?: string
  /**
   * Where the filled part of the track starts. A bipolar control — transpose,
   * pan, a trim — has a meaningful zero in the middle, and filling it from the
   * left says "half on" when the honest reading is "off".
   */
  origin?: 'start' | 'center'
}) {
  const generated = React.useId()
  const inputId = id ?? generated
  const percent = max === min ? 0 : ((value - min) / (max - min)) * 100
  const anchor = origin === 'center' ? 50 : 0
  const from = Math.min(anchor, percent)
  const to = Math.max(anchor, percent)

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={inputId} className="text-label text-[var(--ds-fg-secondary)]">
          {label}
        </label>
        <span className="text-label-sm text-[var(--ds-fg)]" data-tabular>
          {formatValue ? formatValue(value) : value}
        </span>
      </div>
      <input
        id={inputId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        onPointerUp={() => onCommit?.(value)}
        onKeyUp={() => onCommit?.(value)}
        onBlur={() => onCommit?.(value)}
        className="sonara-slider"
        // The filled portion of the track is painted from these custom
        // properties rather than from a second element, so the thumb stays a
        // real native control with real keyboard and assistive-tech behaviour.
        style={{ '--slider-from': `${from}%`, '--slider-to': `${to}%` } as React.CSSProperties}
      />
    </div>
  )
}
