import {
  ChartNoAxesColumnIncreasing,
  Settings,
  Layers,
  Music,
  Route,
  Waves,
  type LucideIcon,
} from 'lucide-react'
import {
  AVAILABLE_TOPICS,
  LEARNING_TOPIC_LABELS,
  LEARNING_TOPICS,
  type LearningTopic,
} from '@/state/learning-store'

/**
 * The areas of the app, as the dashboard and the menu both show them.
 *
 * One table so the two cannot disagree about what an area is called, what it
 * looks like, or whether it is open yet.
 */
export interface Area {
  readonly topic: LearningTopic
  readonly label: string
  readonly icon: LucideIcon
  readonly description: string
  readonly available: boolean
}

const DETAILS: Record<LearningTopic, { icon: LucideIcon; description: string }> = {
  songs: {
    icon: Music,
    description: 'Bring in a MIDI or MusicXML file and learn it a hand at a time.',
  },
  scales: {
    icon: ChartNoAxesColumnIncreasing,
    description: 'Every key and mode, fingered, written out, and run with you.',
  },
  chords: {
    icon: Layers,
    description: 'Triads, four-note chords and sevenths in every position, solid and broken.',
  },
  arpeggios: {
    icon: Waves,
    description: 'Each key’s chords run up the keyboard, from every position.',
  },
  progressions: {
    icon: Route,
    // The area, not any one of its types: Cadences says the rest in its menu.
    description: 'Chords in sequence. First, the cadence of every key: I – IV – I – V – I.',
  },
  exercises: {
    icon: Settings,
    description: 'Blocked, expanding and accelerating scales, the Grand Form, and more.',
  },
}

/** Open areas first, in the order the topics are listed; then what is coming. */
export const AREAS: readonly Area[] = LEARNING_TOPICS.map((topic) => ({
  topic,
  label: LEARNING_TOPIC_LABELS[topic],
  ...DETAILS[topic],
  available: AVAILABLE_TOPICS.includes(topic),
})).sort((a, b) => Number(b.available) - Number(a.available))

export const COMING_NEXT = 'Coming next — the engine behind it is already here.'
