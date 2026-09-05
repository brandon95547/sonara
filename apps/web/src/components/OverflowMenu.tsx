import * as React from 'react'
import { MoreVertical, Piano, Upload } from 'lucide-react'
import { IconButton } from '@/ui/Button'
import { useDismissable } from '@/lib/hooks'
import { cn } from '@/lib/cn'

/**
 * The app bar's overflow.
 *
 * The bar holds three global utilities comfortably at desktop width and two
 * below 640px; everything past that belongs here rather than in a smaller
 * control. What is in it is global — it acts on the session, not on whatever
 * the current tab happens to be showing.
 */
export function OverflowMenu({
  onKeyboardSetup,
  onImport,
}: {
  onKeyboardSetup: () => void
  onImport: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const wrapper = React.useRef<HTMLDivElement>(null)
  const menuId = React.useId()

  useDismissable(open, () => setOpen(false), [wrapper])

  const run = (action: () => void) => () => {
    setOpen(false)
    action()
  }

  return (
    <div ref={wrapper} className="relative">
      <IconButton
        size="sm"
        variant="text"
        label="More"
        icon={<MoreVertical />}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
      />
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="More"
          className={cn(
            'absolute right-0 top-[calc(100%+6px)] z-40 min-w-[15rem] overflow-hidden',
            'rounded-[var(--radius-lg)] border border-[var(--ds-border)] bg-[var(--ds-surface-overlay)] py-1 shadow-e4',
          )}
        >
          <Item icon={<Piano size={15} />} onClick={run(onKeyboardSetup)}>
            Keyboard &amp; MIDI setup
          </Item>
          <Item icon={<Upload size={15} />} onClick={run(onImport)}>
            Import a song…
          </Item>
        </div>
      )}
    </div>
  )
}

function Item({
  icon,
  children,
  onClick,
}: {
  icon: React.ReactNode
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-ui text-[var(--ds-fg-secondary)] hover:bg-[var(--ds-layer-hover)] hover:text-[var(--ds-fg)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ds-focus-ring)]"
    >
      <span className="shrink-0 text-[var(--ds-fg-muted)]" aria-hidden>
        {icon}
      </span>
      {children}
    </button>
  )
}
