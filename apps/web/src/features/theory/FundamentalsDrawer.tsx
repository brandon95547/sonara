import { ArrowRight } from 'lucide-react'
import { DEFAULT_SCALE_SPEC } from '@sonara/shared'
import { Drawer } from '@/ui/Drawer'
import { Button } from '@/ui/Button'
import { useLearningStore, type LearningTopic } from '@/state/learning-store'
import { pageActions } from '@/state/page-store'
import { panelActions } from '@/state/panel-store'

/**
 * The fundamentals, in the order they build on each other.
 *
 * Every fact in here is somewhere else in the app already — on a key, in a
 * theory panel, in the name of a chord. What was missing was the order: which
 * to learn first, and what each one is needed for. That order is Part 1 of the
 * Alfred book (Palmer, Manus, Lethco, *The Complete Book of Scales, Chords,
 * Arpeggios & Cadences*, pp. 4–15), eleven short lessons each standing on the
 * one before, and it is followed here lesson for lesson.
 *
 * Each lesson ends at the keyboard. "Try it" sets the app to the thing the
 * lesson was about and gets out of the way, because none of this is learned by
 * reading it.
 */

interface Lesson {
  readonly title: string
  /** Where it is in the book, for anyone following along. */
  readonly page: number
  readonly points: readonly string[]
  readonly action: string
  readonly topic: LearningTopic
  /** Sets the area to what the lesson is about. */
  readonly setUp: () => void
}

const store = () => useLearningStore.getState()

/** A plain scale: nothing left over from whatever the Scales area was last doing. */
const plainScale = (rootPitchClass: number, scaleTypeId: string) =>
  store().updateSpec({
    ...DEFAULT_SCALE_SPEC,
    rootPitchClass,
    scaleTypeId,
    tonic: undefined,
    motion: undefined,
    texture: undefined,
    apart: undefined,
    cadence: undefined,
    notesPerBeat: undefined,
    octaves: 1,
    direction: 'up-down',
  })

const LESSONS: readonly Lesson[] = [
  {
    title: 'Half steps, whole steps and the tetrachord',
    page: 4,
    points: [
      'A half step is the distance from any key to the very next one, black or white. A whole step is two half steps, with one key between.',
      'A tetrachord is four notes in alphabetical order: whole step, whole step, half step. C D E F is one; so is G A B C.',
    ],
    action: 'Play the C major scale, in its two groups',
    topic: 'scales',
    setUp: () => {
      plainScale(0, 'major')
      store().setShowStructure(true)
    },
  },
  {
    title: 'Building a major scale',
    page: 5,
    points: [
      'A major scale is two tetrachords joined by a whole step. It begins and ends on the note it is named for, the key-note.',
      'The second tetrachord of C is the first tetrachord of G, and G’s second is D’s first. Each new scale needs one more sharp — which is how the keys come to be arranged in a circle of fifths.',
    ],
    action: 'Play G major, and find C’s upper group in it',
    topic: 'scales',
    setUp: () => {
      plainScale(7, 'major')
      store().setShowStructure(true)
    },
  },
  {
    title: 'Triads and their inversions',
    page: 6,
    points: [
      'A triad is a three-note chord: a root, the 3rd above it and the 5th above it. One can be built on any note of any scale.',
      'Move the root to the top and it is the 1st inversion; move the bottom note up again and it is the 2nd. Root on the bottom, root position; root on top, 1st inversion; root in the middle, 2nd.',
    ],
    action: 'Play the C major triad in every position',
    topic: 'chords',
    setUp: () =>
      store().updateChordSpec({
        rootPitchClass: 0,
        mode: 'major',
        tonic: undefined,
        chord: 'triad',
        style: 'solid',
        hand: 'right',
      }),
  },
  {
    title: 'The primary triads, and the cadence',
    page: 8,
    points: [
      'The three most important triads in a key are those on its 1st, 4th and 5th notes: I, IV and V. In C major they are C, F and G.',
      'In root position the hand leaps between them. Played in the nearest positions instead, a note stays put each time — and I, IV, I, V, I played that way is a cadence.',
    ],
    action: 'Play the cadence of C major',
    topic: 'progressions',
    setUp: () =>
      store().updateProgressionSpec({
        rootPitchClass: 0,
        mode: 'major',
        tonic: undefined,
        form: 'positions',
        position: 0,
        dominant: 'V',
        hand: 'right',
      }),
  },
  {
    title: 'The V7 chord',
    page: 9,
    points: [
      'Add the note a 7th above its root to the V triad and it is V7 — in C major, G7. Many pieces use it where the plain V could go.',
      'For a smooth progression its 5th is left out, and its 3rd and 7th are moved down an octave. The primary chords are then I, IV and V7.',
    ],
    action: 'Play the cadence again, with V7',
    topic: 'progressions',
    setUp: () =>
      store().updateProgressionSpec({
        rootPitchClass: 0,
        mode: 'major',
        tonic: undefined,
        form: 'positions',
        position: 0,
        dominant: 'V7',
        hand: 'right',
      }),
  },
  {
    title: 'The names of the scale degrees',
    page: 10,
    points: [
      'Every note of a scale has a name. The key-note is the tonic; a 5th above it is the dominant, and a 5th below it the subdominant — "sub" because it is under the tonic, not because it is under the dominant.',
      'The mediant is midway between tonic and dominant, the submediant midway between tonic and subdominant. The supertonic is the note above the tonic, and the leading tone the half step below it.',
    ],
    action: 'Play the chord on every degree of C major',
    topic: 'chords',
    setUp: () =>
      store().updateChordSpec({
        rootPitchClass: 0,
        mode: 'major',
        tonic: undefined,
        chord: 'key-triads',
        style: 'solid',
        hand: 'right',
      }),
  },
  {
    title: 'Arpeggios',
    page: 11,
    points: [
      'An arpeggio is a chord with its notes played one after another, as on a harp. It can be made from any chord and run over as many octaves as there are.',
      'Four kinds are studied: major and minor triads, in three positions, and the dominant and diminished sevenths, in four.',
    ],
    action: 'Play the C major arpeggio',
    topic: 'arpeggios',
    setUp: () =>
      store().updateArpeggioSpec({
        rootPitchClass: 0,
        mode: 'major',
        tonic: undefined,
        chord: 'triad',
        position: 0,
        hand: 'right',
        direction: 'up-down',
      }),
  },
  {
    title: 'Building a minor scale',
    page: 12,
    points: [
      'Every major key has a relative minor with the same key signature. It begins on the 6th note of the major scale: C major’s is A minor.',
      'There are three kinds. The natural minor uses only those notes. The harmonic raises the 7th a half step, both ways, and is the most used. The melodic raises the 6th and 7th going up, and comes down as the natural.',
    ],
    action: 'Play A harmonic minor',
    topic: 'scales',
    setUp: () => plainScale(9, 'harmonic-minor'),
  },
  {
    title: 'Major and minor 3rds, and the perfect 5th',
    page: 13,
    points: [
      'A major 3rd is four half steps and a minor 3rd is three. A perfect 5th is seven.',
      'A major triad is a root, a major 3rd and a perfect 5th; a minor triad is a root, a minor 3rd and a perfect 5th. Lower the 3rd of a major triad a half step and it is minor.',
    ],
    action: 'Play the triad chain on C',
    topic: 'exercises',
    setUp: () =>
      store().updateRoutineSpec({
        rootPitchClass: 0,
        mode: 'major',
        tonic: undefined,
        routine: 'triad-chain',
        hand: 'both',
      }),
  },
  {
    title: 'The primary triads in a minor key',
    page: 14,
    points: [
      'A minor key’s primary triads come from its harmonic minor scale, so the 7th is raised. In A minor they are A minor, D minor and E major.',
      'In every minor key i and iv are minor triads and V is a major one. The cadence is played in the same close positions as in a major key.',
    ],
    action: 'Play the cadence of A minor',
    topic: 'progressions',
    setUp: () =>
      store().updateProgressionSpec({
        rootPitchClass: 9,
        mode: 'minor',
        tonic: undefined,
        form: 'positions',
        position: 0,
        dominant: 'V',
        hand: 'right',
      }),
  },
  {
    title: 'The diminished seventh chord',
    page: 15,
    points: [
      'Lower every note of a dominant seventh but its root by a half step and it is a diminished seventh. The letter names stay the same, so a lowered B♭ is B double-flat, not A.',
      'It is also what comes of stacking minor 3rds — three half steps from each note to the next — on any root.',
    ],
    action: 'Play the diminished seventh of A minor',
    topic: 'chords',
    setUp: () =>
      store().updateChordSpec({
        rootPitchClass: 9,
        mode: 'minor',
        tonic: undefined,
        chord: 'seventh',
        style: 'solid',
        hand: 'right',
      }),
  },
]

function open(lesson: Lesson) {
  lesson.setUp()
  // With the answers on the keys: this is being learned, not tested.
  store().setMode('learn')
  panelActions.close()
  pageActions.openArea(lesson.topic)
}

export function FundamentalsDrawer({
  open: isOpen,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  return (
    <Drawer
      open={isOpen}
      onClose={onClose}
      title="Fundamentals"
      description="Eleven short lessons, each built on the last."
    >
      <ol className="flex flex-col gap-6">
        {LESSONS.map((lesson, index) => (
          <li key={lesson.title} className="flex gap-3">
            <span
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--ds-surface-inset)] text-label-sm text-[var(--ds-fg-secondary)]"
              data-tabular
              aria-hidden
            >
              {index + 1}
            </span>
            <div className="flex min-w-0 flex-col gap-2.5">
              <h3 className="text-label text-[var(--ds-accent-text)]">{lesson.title}</h3>
              {lesson.points.map((point) => (
                <p key={point} className="text-body-sm text-[var(--ds-fg-secondary)]">
                  {point}
                </p>
              ))}
              <Button
                size="sm"
                variant="outlined"
                className="w-fit"
                endIcon={<ArrowRight />}
                onClick={() => open(lesson)}
              >
                {lesson.action}
              </Button>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-caption text-[var(--ds-fg-muted)]">
        In the order of Part 1 of{' '}
        <em>The Complete Book of Scales, Chords, Arpeggios &amp; Cadences</em> (Palmer, Manus,
        Lethco), pages 4 to 15.
      </p>
    </Drawer>
  )
}
