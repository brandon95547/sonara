import { Music4 } from 'lucide-react'

/**
 * The app bar reads the layout tokens rather than carrying its own gutter, so
 * the brand lines up with the first column of the content beneath it. A bar
 * with its own numbers agrees with the page by coincidence and stops agreeing
 * the moment either one moves.
 */
export function AppBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--ds-border-subtle)] bg-[var(--ds-canvas)]/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[var(--ds-layout-container)] items-center gap-3 px-[var(--ds-layout-gutter)] sm:px-[var(--ds-layout-gutter-lg)]">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[var(--ds-accent)] text-[var(--ds-accent-fg)]"
          aria-hidden
        >
          <Music4 size={17} />
        </span>
        <div className="flex min-w-0 items-baseline gap-2.5">
          <span className="text-h3 text-[var(--ds-fg)]">Sonara</span>
          {/* Hidden below sm rather than shrunk: a tagline that wraps to two
              lines in a 56px bar is worse than a tagline that waits. */}
          <span className="hidden truncate text-label text-[var(--ds-fg-muted)] sm:inline">
            Next Level Piano Mastery
          </span>
        </div>
      </div>
    </header>
  )
}
