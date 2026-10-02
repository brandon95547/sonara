import * as React from 'react'
import { cn } from '@/lib/cn'

export interface BarTab<T extends string> {
  readonly value: T
  readonly label: string
  /** What the tab is on a bar too narrow for its word. */
  readonly icon: React.ReactNode
  /** Said on hover: what choosing it does. */
  readonly description?: string
}

/**
 * One choice from two or three, all of them on show — the bar's mode.
 *
 * It was a menu behind an icon, which hid both what the choices were and which
 * one was on. Side by side, the one that is on is the one that is filled, and
 * changing it is one press instead of two.
 *
 * A radio group rather than a tab list: it sets a value, and there is no panel
 * each one owns. So one Tab stop for the group and the arrow keys inside it.
 *
 * Every tab has both its word and its icon. The stylesheet shows the word where
 * there is room and the icon where there is not; the word stays in the tree
 * either way, so the name a screen reader says does not depend on the width.
 */
export function BarTabs<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  /** What is being chosen — "Mode". The group's accessible name. */
  label: string
  value: T
  options: readonly BarTab<T>[]
  onChange: (value: T) => void
  className?: string
}) {
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0
    if (step === 0) return
    event.preventDefault()
    const group = event.currentTarget
    const index = options.findIndex((option) => option.value === value)
    const next = options[(index + step + options.length) % options.length]
    if (!next) return
    onChange(next.value)
    // The chosen tab is re-rendered as the Tab stop; move focus onto it.
    requestAnimationFrame(() =>
      group.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)?.focus(),
    )
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('bar-tabs', className)}
      onKeyDown={onKeyDown}
    >
      {options.map((option) => {
        const checked = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            data-value={option.value}
            tabIndex={checked ? 0 : -1}
            className="bar-tabs__tab"
            title={option.description ? `${option.label}: ${option.description}` : option.label}
            onClick={() => onChange(option.value)}
          >
            <span className="bar-tabs__icon" aria-hidden>
              {option.icon}
            </span>
            <span className="bar-tabs__label">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
