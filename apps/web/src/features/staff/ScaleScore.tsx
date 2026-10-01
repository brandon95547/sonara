import * as React from 'react'
import {
  normalisePitchClass,
  parsePitch,
  stepBeats,
  writtenFromQuarters,
  type Exercise,
  type SongNote,
  type SongStep,
  type Spelling,
  type WrittenNote,
} from '@sonara/shared'
import { useLearningStore } from '@/state/learning-store'
import { measureScore, type ScoreSource } from './score'
import { FlowView } from './FlowView'
import type { Role } from './score-parts'

/**
 * The scale, written out, with your place in it.
 *
 * A scale used to get the picture of the moment — `GrandStaff`, which draws
 * whatever is sounding and nothing else — on the reasoning that there is no
 * score to follow. There is: the exercise is an exact list of notes in order,
 * in a key, each with a finger, which is exactly what a page of a scale book
 * prints. A staff that stays empty until you press something teaches you
 * nothing about what the scale looks like written down, and reading it is half
 * of knowing it.
 *
 * So it is engraved the way a song is — the same measuring, the same view, the
 * same marks — and the three reading states follow the same position the keys
 * do: what is behind you stays visible but quiet, the note you are on is the
 * accent, and the next few carry the lighter wash. Notes you hold light up on
 * the staff as they do on the keys.
 *
 * Written as the exercise says each step is long: crotchets, one a beat, unless
 * it states otherwise — a scale in semiquavers is four to a beat under one
 * beam, a chord held through a bar of three is a dotted minim. The tempo
 * control counts beats, so that is what 72 BPM on this page means. And the bars
 * are not decoration: an accidental holds until the bar line, so with none at
 * all one printed sharp would cover that line or space for the whole scale, and
 * a scale that comes back down would pass it again unmarked.
 */

/** A beat. The length is arbitrary; only the proportions are drawn. */
const BEAT_MS = 500
/** The bar an exercise is counted in when it states no metre of its own. */
const UNSTATED_BEATS = 4
/** How many steps ahead keep a marking, matching the keyboard in Learn. */
const LOOKAHEAD = 6
/** The notes whose fingering the staff prints: none of them. See below. */
const NO_FINGERING: ReadonlySet<SongNote> = new Set()

/** How the exercise writes this note — the spelling it chose for its key. */
function spellingOf(exercise: Exercise, note: number): Spelling | undefined {
  const name = exercise.pitchNames[normalisePitchClass(note)]
  return (name ? parsePitch(name) : null) ?? undefined
}

/**
 * How a length in beats is written, and the tuplet it is in if it is one.
 *
 * A third of a beat is a triplet quaver: written as a quaver, three to the
 * beat. Anything a plain or dotted value can write is written as that; anything
 * else is left to be matched, which is what the score does with a length it was
 * not told.
 */
function writtenAs(beats: number, tupletId: number): WrittenNote | undefined {
  if (Math.abs(beats * 3 - 1) < 1e-6)
    return { value: 'eighth', dots: 0, tuplet: { id: tupletId, actual: 3, normal: 2 } }
  const plain = writtenFromQuarters(beats)
  return plain ? { value: plain.value, dots: plain.dots } : undefined
}

/**
 * The parts a beat is counted in, so that positions are whole numbers.
 *
 * Three thirds of a beat added up in floating point come to a hair under one,
 * and a hair under the bar line is the wrong bar: the triplet that should open
 * bar three was the last note of bar two, alone under no beam. Ninety-six
 * divides by everything a beat is cut into here — twos, threes, fours, eights.
 */
const TICKS = 96

/** The exercise as the score measures music: each step as long as it says, each note handed and fingered. */
export function scaleSteps(exercise: Exercise): SongStep[] {
  let ticks = 0
  return exercise.steps.map((step) => {
    const length = stepBeats(step)
    const startMs = (ticks / TICKS) * BEAT_MS
    // One number for every note of one beat's triplet: the bracket they share.
    const tupletId = Math.floor(ticks / TICKS) + 1
    ticks += Math.round(length * TICKS)
    return {
      startMs,
      notes: step.notes.map((note, i): SongNote => ({
        note,
        velocity: 80,
        startMs,
        durationMs: (step.holds?.[i] ?? length) * BEAT_MS,
        written: writtenAs(step.holds?.[i] ?? length, tupletId),
        // Each note's own hand, so the staff it lands on is the hand's and not
        // a guess from middle C — a left-hand scale that climbs past it still
        // reads in the bass, with ledger lines, the way it is printed.
        hand: step.fingers[i]?.hand ?? 'right',
        role: 'keyboard',
        finger: step.fingers[i]?.finger,
        spelling: spellingOf(exercise, note),
      })),
    }
  })
}

export const ScaleScore = React.memo(function ScaleScore() {
  const exercise = useLearningStore((state) => state.exercise)
  const mode = useLearningStore((state) => state.mode)
  const stepIndex = useLearningStore((state) => state.session.stepIndex)
  const demoStepIndex = useLearningStore((state) => state.demoStepIndex)
  const running = useLearningStore((state) => state.session.status === 'running')

  /*
   * The key the scale is written in. Null where no signature fits — a chromatic
   * or whole-tone scale — and then every accidental is printed, which is what
   * an editor does with those.
   */
  const fifths = exercise?.keyFifths ?? 0
  const meter = exercise?.meter
  const beatsPerBar = meter?.beats ?? UNSTATED_BEATS

  const measured = React.useMemo(() => {
    if (!exercise) return []
    const source: ScoreSource = {
      bpm: 60000 / BEAT_MS,
      measureMs: BEAT_MS * beatsPerBar,
      // Every length here is stated, so short notes can be joined by the beat.
      beams: true,
      key: { fifths },
      // A crotchet at the least gap any note gets: even steps, packed as tight
      // as the ink allows, the way a scale book sets a run.
      barWidth: 160,
    }
    // Fingering is carried on every note but printed on none: a scale is one
    // line of single notes, and the numbers belong on the keys (Key labels ▸
    // Fingers) where the finger actually lands. On the staff they were a row of
    // digits under a row of notes, doubling the ink for what the eye has to read.
    return measureScore(source, scaleSteps(exercise), NO_FINGERING)
  }, [exercise, fifths, beatsPerBar])

  /**
   * Which step is "here" — the same one the keyboard marks.
   *
   * A demonstration's playback head stands in for the player while it runs.
   * Explore follows nobody, so without one the whole scale is simply written
   * out, with no playhead claiming a place in it.
   */
  const here = demoStepIndex ?? (mode === 'explore' ? -1 : stepIndex)

  /**
   * Where somebody is actually known to be, which is not the same question.
   *
   * `here` is where the page is turned to: a scale waiting for Start shows its
   * first note as the one to play, and nobody is on it. The playback head is
   * somewhere, and so is a run; a player trying the scale out before starting
   * is wherever their hands are, which only the keys can say.
   *
   * It decides which writing of a held pitch lights — see `litNotes`.
   */
  const position = demoStepIndex ?? (running ? stepIndex : -1)

  const roleFor = React.useCallback(
    (index: number): Role => {
      if (here < 0) return 'ahead'
      if (index < here) return 'played'
      if (index === here) return 'target'
      return index - here <= LOOKAHEAD ? 'upcoming' : 'ahead'
    },
    [here],
  )

  if (!exercise) return null

  return (
    <FlowView
      measured={measured}
      here={here}
      fifths={fifths}
      beats={beatsPerBar}
      beatType={meter?.beatType ?? 4}
      roleFor={roleFor}
      // A plain scale has no metre to state; an exercise that divides the beat
      // or holds a chord through a bar has, and prints it. Neither is long
      // enough to need its bars numbered — the bar lines stay, because they
      // are what the accidentals are counted against.
      withTime={meter !== undefined}
      numbered={false}
      // Short enough to watch every note, so a key of the scale lights where
      // it is written — started or not, near your place or not.
      watchAll
      position={position}
      label={`${exercise.title}, ${exercise.subtitle}: ${exercise.steps.map((step) => step.label).join(' ')}`}
    />
  )
})
