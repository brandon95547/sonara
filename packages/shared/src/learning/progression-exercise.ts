import { z } from 'zod'
import type { NoteRange } from '../domain/device.js'
import {
  CADENCE_POSITION_NAMES,
  CADENCE_VOICINGS,
  cadenceFingers,
  ROOTED_CADENCE,
  type CadenceChord,
} from '../music/cadences.js'
import { KEY_MODE_LABELS, KEY_MODES, keyTriads } from '../music/chords.js'
import type { Hand } from '../music/fingering.js'
import { normalisePitchClass } from '../music/pitch.js'
import { keySignatureOf } from '../music/scales.js'
import type { Exercise, ExerciseStep, StepFinger } from './exercise.js'
import { DEFAULT_PLAYABLE_RANGE, HAND_LABELS, SCALE_HANDS } from './scale-exercise.js'

/**
 * Progressions: chords in sequence.
 *
 * What is here is the cadence — I – IV – I – V – I — which is the progression a
 * key is recognised by, and the one a scale book prints under every key.
 */

/**
 * How the cadence is set.
 *
 * - `positions` — both hands (or one) on the chords, in the three positions.
 * - `root-in-bass` — the right hand on the chords, the left on each chord's root.
 * - `root-in-treble` — the left hand on the chords, the right on the roots above.
 */
export const CADENCE_FORMS = ['positions', 'root-in-bass', 'root-in-treble'] as const
export type CadenceForm = (typeof CADENCE_FORMS)[number]

export const CADENCE_FORM_LABELS: Record<CadenceForm, string> = {
  positions: 'Three Positions',
  'root-in-bass': 'Root in the Bass',
  'root-in-treble': 'Root in the Treble',
}

/** The chord before the last: the dominant triad, or the dominant seventh. */
export const CADENCE_DOMINANTS = ['V', 'V7'] as const
export type CadenceDominant = (typeof CADENCE_DOMINANTS)[number]

export const progressionSpecSchema = z.object({
  kind: z.literal('progression'),
  rootPitchClass: z.number().int().min(0).max(11),
  /** Which of the key's names it is written under. See `ScaleSpec.tonic`. */
  tonic: z.string().optional(),
  mode: z.enum(KEY_MODES),
  /** Which hand plays the chords in `positions`. The other forms take both. */
  hand: z.enum(SCALE_HANDS),
  form: z.enum(CADENCE_FORMS),
  /** 0, 1 or 2 for one position of the tonic; `all` for the three in turn. */
  position: z.union([z.literal('all'), z.number().int().min(0).max(2)]),
  dominant: z.enum(CADENCE_DOMINANTS),
})
export type ProgressionSpec = z.infer<typeof progressionSpecSchema>

export const DEFAULT_PROGRESSION_SPEC: ProgressionSpec = {
  kind: 'progression',
  rootPitchClass: 0,
  mode: 'major',
  hand: 'both',
  form: 'positions',
  position: 'all',
  dominant: 'V7',
}

export interface ProgressionExerciseOptions {
  /** The keys the player has. A 61-key instrument when left out. */
  readonly range?: NoteRange
}

/** Where the right hand's tonic goes: the register the key's scale starts in. */
const PREFERRED_TONIC = 58.5
/** How far the three positions reach either side of that tonic, in semitones. */
const REACH = { below: 2, above: 18 }

function placeTonic(pitchClass: number, range: NoteRange): Record<Hand, number> {
  const candidates = [36, 48, 60, 72].map((c) => c + normalisePitchClass(pitchClass))
  const fitting = candidates.filter(
    (note) => note - 12 - REACH.below >= range.low && note + REACH.above <= range.high,
  )
  const pool = fitting.length > 0 ? fitting : candidates
  const right = pool.reduce((best, note) =>
    Math.abs(note - PREFERRED_TONIC) < Math.abs(best - PREFERRED_TONIC) ? note : best,
  )
  return { right, left: right - 12 }
}

/** Lower-case for a minor triad, as the page writes them: i – iv – i – V – i. */
const numeralOf = (chord: CadenceChord, mode: 'major' | 'minor') =>
  mode === 'minor' && (chord === 'I' || chord === 'IV') ? chord.toLowerCase() : chord

export function buildProgressionExercise(
  spec: ProgressionSpec,
  options: ProgressionExerciseOptions = {},
): Exercise {
  const { key, mode, triads } = keyTriads(spec.rootPitchClass, spec.mode, spec.tonic)
  const tonic = key.notes[0]!
  const anchors = placeTonic(tonic.pitchClass, options.range ?? DEFAULT_PLAYABLE_RANGE)
  const offsets = key.notes.map((note) => (note.pitchClass - tonic.pitchClass + 12) % 12)
  const keyName = `${tonic.name} ${KEY_MODE_LABELS[mode]}`

  /** A scale degree counted from a hand's tonic: its key, and its name. */
  const at = (hand: Hand, degree: number) => {
    const index = ((degree % 7) + 7) % 7
    return {
      note: anchors[hand] + Math.floor(degree / 7) * 12 + offsets[index]!,
      name: key.notes[index]!.name,
    }
  }
  /** `C`, `F`, `G`, `G7` — the dominant seventh is the fifth degree's triad with a 7. */
  const symbolOf = (chord: CadenceChord) =>
    chord === 'V7'
      ? `${triads[4]!.symbol}7`
      : triads[chord === 'I' ? 0 : chord === 'IV' ? 3 : 4]!.symbol

  /** One hand's chord: three notes, each with its finger. */
  const shape = (hand: Hand, position: number, chord: CadenceChord) => {
    const fingers = cadenceFingers({
      pitchClass: tonic.pitchClass,
      mode,
      hand,
      position,
      chord,
    })
    return CADENCE_VOICINGS[position]![chord].map((degree, part) => ({
      ...at(hand, degree),
      finger: { finger: fingers[part]!, hand } satisfies StepFinger,
    }))
  }

  const steps: ExerciseStep[] = []
  const push = (
    playing: readonly { note: number; name: string; finger: StepFinger }[],
    chord: CadenceChord,
    cue?: string,
  ) =>
    steps.push({
      id: `${steps.length}`,
      notes: playing.map((entry) => entry.note),
      fingers: playing.map((entry) => entry.finger),
      label: symbolOf(chord),
      noteLabels: playing.map((entry) => entry.name),
      degree: numeralOf(chord, mode),
      cue,
    })

  const positions =
    spec.form !== 'positions' ? [0] : spec.position === 'all' ? [0, 1, 2] : [spec.position]
  // Low hand first, so a step's notes read up the keyboard.
  const hands: readonly Hand[] =
    spec.form !== 'positions' || spec.hand === 'both' ? ['left', 'right'] : [spec.hand]
  let sequence: readonly CadenceChord[]

  if (spec.form === 'positions') {
    sequence = ['I', 'IV', 'I', spec.dominant, 'I']
    for (const position of positions) {
      sequence.forEach((chord, index) =>
        push(
          hands.flatMap((hand) => shape(hand, position, chord)),
          chord,
          // Named as each position begins, by where it puts the tonic chord.
          index === 0 && positions.length > 1 ? CADENCE_POSITION_NAMES[position] : undefined,
        ),
      )
    }
  } else {
    sequence = ROOTED_CADENCE.chords
    const chordHand: Hand = spec.form === 'root-in-bass' ? 'right' : 'left'
    const rootHand: Hand = chordHand === 'right' ? 'left' : 'right'
    sequence.forEach((chord, index) => {
      const root = {
        ...at(rootHand, ROOTED_CADENCE.roots[index]!),
        finger: { finger: ROOTED_CADENCE.rootFingers[rootHand][index]!, hand: rootHand },
      }
      const chordNotes = shape(chordHand, 0, chord)
      push(rootHand === 'left' ? [root, ...chordNotes] : [...chordNotes, root], chord)
    })
    // Two bars of four, as it is printed: four chords, then the seventh and a
    // tonic held for the rest of the bar.
    steps[steps.length - 1] = { ...steps.at(-1)!, beats: 3 }
  }

  const numerals = sequence.map((chord) => numeralOf(chord, mode)).join(' – ')
  const playedBy =
    spec.form === 'positions' ? HAND_LABELS[spec.hand] : CADENCE_FORM_LABELS[spec.form]
  const where =
    spec.form !== 'positions'
      ? []
      : [spec.position === 'all' ? 'Three Positions' : CADENCE_POSITION_NAMES[spec.position]!]

  return {
    id: `progression:${tonic.name}:${mode}:${spec.form}:${positions.join('')}:${hands.join('+')}:${sequence.join('-')}:${anchors.right}`,
    kind: 'progression',
    title: `${keyName} Cadence`,
    subtitle: [playedBy, ...where, numerals].join(' · '),
    steps,
    pitchClasses: key.notes.map((note) => note.pitchClass),
    rootPitchClass: tonic.pitchClass,
    pitchNames: Object.fromEntries(key.notes.map((note) => [note.pitchClass, note.name])),
    keyFifths: keySignatureOf(key),
    defaultBpm: 60,
    notes: steps.flatMap((step) => step.notes),
    facts: [
      { label: 'Key', value: keyName },
      { label: 'Chords', value: sequence.map(symbolOf).join(' – ') },
      { label: 'Numerals', value: numerals },
    ],
    ...(spec.form === 'positions' ? {} : { meter: { beats: 4, beatType: 4 } }),
    fingerings: hands.map((hand) => {
      const mine = steps.map((step) =>
        step.fingers.filter((finger) => finger.hand === hand).map((finger) => finger.finger),
      )
      return {
        hand,
        fingers: mine.flat(),
        source: 'alfred' as const,
        perStep: mine[0]?.length ?? 3,
      }
    }),
  }
}
