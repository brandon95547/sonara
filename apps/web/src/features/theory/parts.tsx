import * as React from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

/**
 * The few shapes every theory panel is made of, so that "Understand this
 * scale" and "Understand this cadence" read as pages of one book.
 */

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="text-label text-[var(--ds-accent-text)]">{title}</h3>
      {children}
    </section>
  )
}

/** A paragraph of explanation, in the weight the panels use for prose. */
export function Prose({ children, quiet }: { children: React.ReactNode; quiet?: boolean }) {
  return (
    <p
      className={`text-body-sm ${quiet ? 'text-[var(--ds-fg-muted)]' : 'text-[var(--ds-fg-secondary)]'}`}
    >
      {children}
    </p>
  )
}

/** The inset panel facts are laid out in: note names, chords, formulas. */
export function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[var(--radius-md)] bg-[var(--ds-surface-inset)] px-3 py-2.5">
      {children}
    </div>
  )
}

/** One line of a panel: cells separated by a bar, or by the step that joins them. */
export function Row({
  cells,
  tone,
  join,
}: {
  cells: string[]
  tone: 'fg' | 'muted'
  join?: string
}) {
  return (
    <div
      className={`flex flex-wrap items-baseline gap-x-2 text-ui ${
        tone === 'fg' ? 'text-[var(--ds-fg)]' : 'text-[var(--ds-fg-muted)]'
      }`}
      data-tabular
    >
      {cells.map((cell, index) => (
        <React.Fragment key={index}>
          {index > 0 && (
            <span className="text-[var(--ds-fg-muted)]">{join ? `| ${join} |` : '|'}</span>
          )}
          <span>{cell}</span>
        </React.Fragment>
      ))}
    </div>
  )
}

/** A term and what it is: `Root position` — `C E G`. */
export function Facts({
  rows,
  wide,
}: {
  rows: readonly { term: string; value: React.ReactNode; note?: string }[]
  /** A wider first column, for terms that are a few words long. */
  wide?: boolean
}) {
  return (
    <dl className="flex flex-col gap-1">
      {rows.map((row) => (
        <div key={row.term} className="flex gap-3 text-body-sm">
          <dt
            className={`${wide ? 'w-[8.5rem]' : 'w-[5.5rem]'} shrink-0 text-[var(--ds-fg-muted)]`}
          >
            {row.term}
          </dt>
          <dd className="min-w-0 text-[var(--ds-fg-secondary)]" data-tabular>
            <span className="text-[var(--ds-fg)]">{row.value}</span>
            {row.note && <span className="text-[var(--ds-fg-muted)]"> · {row.note}</span>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function Disclosure({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-fit items-center gap-1 text-label-sm text-[var(--ds-fg-secondary)] hover:text-[var(--ds-fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-focus-ring)]"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {label}
      </button>
      {open && children}
    </div>
  )
}
