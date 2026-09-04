import { Lock } from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  AVAILABLE_TOPICS,
  LEARNING_TOPIC_LABELS,
  LEARNING_TOPICS,
  useLearningStore,
  type LearningTopic,
} from '@/state/learning-store'

/**
 * What you are working on. Sits directly above the keyboard because it changes
 * what the keyboard is doing, not what page you are on — this is an instrument
 * with modes, not a website with sections.
 *
 * Topics without a builder yet are shown and disabled rather than hidden. The
 * shape of the thing is the promise; pretending they do not exist, or faking a
 * screen behind them, are both worse than saying "not yet".
 */
export function LearningBar() {
  const topic = useLearningStore((state) => state.topic)
  const setTopic = useLearningStore((state) => state.setTopic)

  return (
    <div
      role="tablist"
      aria-label="Learning topic"
      className="flex gap-1 overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--ds-border-subtle)] bg-[var(--ds-surface)] p-1 scrollbar-none"
    >
      {LEARNING_TOPICS.map((option) => (
        <TopicTab
          key={option}
          topic={option}
          selected={option === topic}
          available={AVAILABLE_TOPICS.includes(option)}
          onSelect={() => setTopic(option)}
        />
      ))}
    </div>
  )
}

function TopicTab({
  topic,
  selected,
  available,
  onSelect,
}: {
  topic: LearningTopic
  selected: boolean
  available: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      disabled={!available}
      title={available ? undefined : 'Coming next — the engine behind it is already here.'}
      onClick={onSelect}
      className={cn(
        'touch-target relative h-9 flex-1 shrink-0 rounded-[var(--radius-md)] px-3.5 text-label whitespace-nowrap',
        'transition-colors duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-focus-ring)]',
        selected && 'bg-[var(--ds-accent)] text-[var(--ds-accent-fg)] shadow-e1',
        !selected &&
          available &&
          'text-[var(--ds-fg-secondary)] hover:bg-[var(--ds-layer-hover)] hover:text-[var(--ds-fg)]',
        !available && 'cursor-not-allowed text-[var(--ds-fg-disabled)]',
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        {LEARNING_TOPIC_LABELS[topic]}
        {!available && <Lock size={11} aria-hidden />}
      </span>
    </button>
  )
}
