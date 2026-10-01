import { z } from 'zod'
import type { NoteRange } from '../domain/device.js'
import {
  CHORD_KINDS,
  chordLadder,
  chordPositionName,
  KEY_MODE_LABELS,
  KEY_MODES,
  keyChord,
  type KeyChord,
} from '../music/chords.js'
import { scaleFingering, type Hand } from '../music/fingering.js'
import { fingeringSystem, type FingeringSystemId } from '../music/fingering-system.js'
import { normalisePitchClass } from '../music/pitch.js'
import { keySignatureOf } from '../music/scales.js'
import type { Exercise, ExerciseFingering, ExerciseStep, StepFinger } from './exercise.js'
import {
  DEFAULT_PLAYABLE_RANGE,
  HAND_LABELS,
  movementCue,
  SCALE_DIRECTION_LABELS,
  SCALE_DIRECTIONS,
  SCALE_HANDS,
  type ScaleHands,
} from './scale-exercise.js'

/**
 * Chords and arpeggios, as exercises.
 *
 * The other half of a key's page in a scale book. The scale builder turns a
 * scale into steps; these turn a key's chord into them — held, broken, or run
 * up the keyboard — and everything downstream sees the same `Exercise`.
 */

export const CHORD_STYLES = ['solid', 'broken'] as const
export type ChordStyle = (typeof CHORD_STYLES)[number]

export const CHORD_KIND_LABELS = {
  triad: 'Triads',
  'four-note': 'Four-Note Chords',
  seventh: 'Seventh Chord',
} as const

export const CHORD_STYLE_LABELS: Record<ChordStyle, string> = { solid: 'Solid', broken: 'Broken' }

const keyFields = {
  rootPitchClass: z.number().int().min(0).max(11),
  /** Which of the key's names it is written under. See `ScaleSpec.tonic`. */
  tonic: z.string().optional(),
  mode: z.enum(KEY_MODES),
  hand: z.enum(SCALE_HANDS),
}

export const chordSpecSchema = z.object({
  kind: z.literal('chord'),
  ...keyFields,
  chord: z.enum(CHORD_KINDS),
  style: z.enum(CHORD_STYLES),
})
export type ChordSpec = z.infer<typeof chordSpecSchema>

export const DEFAULT_CHORD_SPEC: ChordSpec = {
  kind: 'chord',
  rootPitchClass: 0,
  mode: 'major',
  hand: 'right',
  chord: 'triad',
  style: 'solid',
}

export const ARPEGGIO_CHORDS = ['triad', 'seventh'] as const
export type ArpeggioChord = (typeof ARPEGGIO_CHORDS)[number]

export const arpeggioSpecSchema = z.object({
  kind: z.literal('arpeggio'),
  ...keyFields,
  chord: z.enum(ARPEGGIO_CHORDS),
  /** 0 is root position; each one after starts on the next chord note up. */
  position: z.number().int().min(0).max(3),
  direction: z.enum(SCALE_DIRECTIONS),
})
export type ArpeggioSpec = z.infer<typeof arpeggioSpecSchema>

export const DEFAULT_ARPEGGIO_SPEC: ArpeggioSpec = {
  kind: 'arpeggio',
  rootPitchClass: 0,
  mode: 'major',
  hand: 'right',
  chord: 'triad',
  position: 0,
  direction: 'up-down',
}

export interface ChordExerciseOptions {
  readonly fingering?: FingeringSystemId
  /** The keys the player has. A 61-key instrument when left out. */
  readonly range?: NoteRange
}

/** The octaves an arpeggio runs. Two, as the page prints them. */
const ARPEGGIO_OCTAVES = 2

/**
 * Where the right hand's chord root goes: the F3–E4 register the scales start
 * in, so a key's chords sit where its scale does. The left hand is an octave
 * below.
 */
const PREFERRED_ROOT = 58.5

function placeRoot(rootPitchClass: number, span: number, range: NoteRange): Record<Hand, number> {
  const candidates = [36, 48, 60, 72].map((c) => c + normalisePitchClass(rootPitchClass))
  const fitting = candidates.filter((note) => note - 12 >= range.low && note + span <= range.high)
  const pool = fitting.length > 0 ? fitting : candidates
  const right = pool.reduce((best, note) =>
    Math.abs(note - PREFERRED_ROOT) < Math.abs(best - PREFERRED_ROOT) ? note : best,
  )
  return { right, left: right - 12 }
}

/** Low hand first, so a step's notes read up the keyboard. */
const handsOf = (hands: ScaleHands): readonly Hand[] =>
  hands === 'both' ? ['left', 'right'] : [hands]

const keyName = (chord: KeyChord) => `${chord.key.root.name} ${KEY_MODE_LABELS[chord.mode]}`

/** What every exercise on a key's chord has in common. */
function chordBasics(chord: KeyChord) {
  return {
    pitchClasses: chord.tones.map((tone) => tone.pitchClass),
    rootPitchClass: chord.tones[0]!.pitchClass,
    pitchNames: Object.fromEntries(chord.tones.map((tone) => [tone.pitchClass, tone.name])),
    keyFifths: keySignatureOf(chord.key),
    defaultBpm: 72,
  }
}

/** A hand with nothing printed for it: spread across the chord, thumb to little finger. */
function spread(size: number, hand: Hand): number[] {
  const fingers = size === 3 ? [1, 3, 5] : [1, 2, 3, 5]
  return hand === 'right' ? fingers : [...fingers].reverse()
}

/**
 * A key's chord in each of its positions, solid or broken.
 *
 * Four positions, as the page prints them: the three of a triad and the root
 * position again an octave up, or the four of a seventh chord. Solid is four
 * steps, each a whole chord. Broken walks each position up a note at a time
 * and then walks them all back down.
 */
export function buildChordExercise(spec: ChordSpec, options: ChordExerciseOptions = {}): Exercise {
  const chord = keyChord(spec.rootPitchClass, spec.mode, spec.chord, spec.tonic)
  const system = fingeringSystem(options.fingering)
  const toneCount = chord.tones.length
  // A triad under the hand is three notes; the four-note form adds its octave.
  const size = spec.chord === 'triad' ? 3 : 4
  const positions = [0, 1, 2, 3]
  const roots = placeRoot(
    chord.tones[0]!.pitchClass,
    // The last position's top note: the root position an octave up, or the
    // seventh's third inversion.
    24,
    options.range ?? DEFAULT_PLAYABLE_RANGE,
  )

  const voices = handsOf(spec.hand).map((hand) => {
    const ladder = chordLadder(chord.tones, roots[hand])
    let source: ExerciseFingering['source'] = 'standard'
    const shapes = positions.map((position) => {
      const supplied = system.chord({ kind: spec.chord, mode: spec.mode, position, hand })
      if (!supplied) source = 'derived'
      const fingers = supplied ?? spread(size, hand)
      return Array.from({ length: size }, (_, index) => ({
        ...ladder(position + index),
        finger: fingers[index]!,
      }))
    })
    return { hand, shapes, source }
  })

  const nameOf = (tone: number) => chord.tones[tone]!.name
  const steps: ExerciseStep[] = []

  if (spec.style === 'solid') {
    for (const position of positions) {
      const playing = voices.flatMap(({ hand, shapes }) =>
        shapes[position]!.map((entry) => ({ ...entry, hand })),
      )
      steps.push({
        id: `${steps.length}`,
        notes: playing.map((entry) => entry.note),
        fingers: playing.map(({ finger, hand }) => ({ finger, hand })),
        label: voices[0]!.shapes[position]!.map((entry) => nameOf(entry.tone)).join(' '),
        noteLabels: playing.map((entry) => nameOf(entry.tone)),
        cue: chordPositionName(toneCount, position),
      })
    }
  } else {
    // Up through the positions, each from its lowest note; then back down
    // through them, each from its highest. The top note is played twice, once
    // to end the way up and once to begin the way down, as it is printed.
    const order = [
      ...positions.map((position) => ({ position, down: false })),
      ...[...positions].reverse().map((position) => ({ position, down: true })),
    ]
    for (const { position, down } of order) {
      const indices = Array.from({ length: size }, (_, index) => (down ? size - 1 - index : index))
      indices.forEach((index, at) => {
        const playing = voices.map(({ hand, shapes }) => ({ ...shapes[position]![index]!, hand }))
        steps.push({
          id: `${steps.length}`,
          notes: playing.map((entry) => entry.note),
          fingers: playing.map(({ finger, hand }) => ({ finger, hand })),
          label: nameOf(playing[0]!.tone),
          // Named as each position begins, so the player knows which shape
          // the hand is about to take.
          cue: at === 0 ? chordPositionName(toneCount, position) : undefined,
        })
      })
    }
  }

  const seventh = spec.chord === 'seventh'
  const title = seventh
    ? `${chord.qualityName} of ${keyName(chord)}`
    : `${keyName(chord)} ${spec.chord === 'triad' ? 'Triads' : 'Four-Note Chords'}`

  return {
    id: `chord:${chord.key.root.name}:${spec.mode}:${spec.chord}:${spec.style}:${spec.hand}:${roots.right}`,
    kind: 'chord',
    title,
    subtitle: `${HAND_LABELS[spec.hand]} · ${CHORD_STYLE_LABELS[spec.style]}`,
    steps,
    ...chordBasics(chord),
    notes: steps.flatMap((step) => step.notes),
    facts: [
      {
        label: 'Chord',
        value: `${chord.symbol} — ${chord.tones.map((tone) => tone.name).join(' ')}`,
      },
      { label: 'Key', value: keyName(chord) },
      {
        label: 'Positions',
        value: positions
          .map((position) => chordPositionName(toneCount, position).toLowerCase())
          .join(', '),
      },
    ],
    fingerings: voices.map(({ hand, shapes, source }) => ({
      hand,
      fingers: shapes.flatMap((shape) => shape.map((entry) => entry.finger)),
      source,
      perStep: size,
    })),
  }
}

/**
 * A key's chord run up two octaves and back, from one of its positions.
 *
 * One note at a time, the hands an octave apart — the scale's shape with the
 * steps taken out, which is why the thumb has so much further to travel.
 */
export function buildArpeggioExercise(
  spec: ArpeggioSpec,
  options: ChordExerciseOptions = {},
): Exercise {
  const chord = keyChord(spec.rootPitchClass, spec.mode, spec.chord, spec.tonic)
  const system = fingeringSystem(options.fingering)
  const toneCount = chord.tones.length
  // A triad has three positions; asked for a fourth, it is the root position.
  const position = spec.position % toneCount
  const count = toneCount * ARPEGGIO_OCTAVES + 1
  const roots = placeRoot(
    chord.tones[0]!.pitchClass,
    // The highest note: two octaves above the highest starting note.
    12 * ARPEGGIO_OCTAVES + 11,
    options.range ?? DEFAULT_PLAYABLE_RANGE,
  )

  const voices = handsOf(spec.hand).map((hand) => {
    const ladder = chordLadder(chord.tones, roots[hand])
    const ascending = Array.from({ length: count }, (_, index) => ladder(position + index))
    const supplied = system.arpeggio({
      tonic: chord.key.root.name,
      mode: spec.mode,
      kind: spec.chord,
      position,
      hand,
      octaves: ARPEGGIO_OCTAVES,
    })
    // Nothing printed — a key the system has no page for. Worked out from the
    // notes instead, and labelled as a suggestion.
    const fingers =
      supplied ??
      scaleFingering({
        rootName: chord.key.root.name,
        scaleTypeId: 'arpeggio',
        hand,
        octaves: ARPEGGIO_OCTAVES,
        notes: ascending.map((entry) => entry.note),
        system: options.fingering,
      }).fingers

    const up = ascending.map((entry, index) => ({
      ...entry,
      finger: fingers[index]!,
      ascending: true,
    }))
    const down = [...up].reverse().map((entry) => ({ ...entry, ascending: false }))
    const source: ExerciseFingering['source'] = supplied ? 'standard' : 'derived'

    return {
      hand,
      source,
      fingers,
      sequence:
        spec.direction === 'up'
          ? up
          : spec.direction === 'down'
            ? down
            : // The turn is not played twice.
              [...up, ...down.slice(1)],
    }
  })

  const DEGREES = ['1', '3', '5', '7']
  const steps: ExerciseStep[] = voices[0]!.sequence.map((entry, index) => {
    const fingers: StepFinger[] = voices.map(({ hand, sequence }) => {
      const at = sequence[index]!
      const cue = movementCue(sequence[index - 1]?.finger, at.finger, hand, at.ascending)
      return { finger: at.finger, hand, ...(cue ? { cue } : {}) }
    })
    const cues = fingers.flatMap((finger) =>
      finger.cue
        ? [
            voices.length > 1
              ? `${HAND_LABELS[finger.hand].split(' ')[0]}: ${finger.cue}`
              : finger.cue,
          ]
        : [],
    )
    return {
      id: `${index}`,
      notes: voices.map(({ sequence }) => sequence[index]!.note),
      fingers,
      label: chord.tones[entry.tone]!.name,
      degree: DEGREES[entry.tone],
      cue: cues.length > 0 ? cues.join(' · ') : undefined,
    }
  })

  const seventh = spec.chord === 'seventh'
  const positionName = chordPositionName(toneCount, position)

  return {
    id: `arpeggio:${chord.key.root.name}:${spec.mode}:${spec.chord}:${position}:${spec.hand}:${spec.direction}:${roots.right}`,
    kind: 'arpeggio',
    title: seventh
      ? `${chord.qualityName} Arpeggio of ${keyName(chord)}`
      : `${keyName(chord)} Arpeggio`,
    subtitle: `${HAND_LABELS[spec.hand]} · ${positionName} · ${SCALE_DIRECTION_LABELS[spec.direction]}`,
    steps,
    ...chordBasics(chord),
    notes: steps.flatMap((step) => step.notes),
    facts: [
      {
        label: 'Chord',
        value: `${chord.symbol} — ${chord.tones.map((tone) => tone.name).join(' ')}`,
      },
      { label: 'Key', value: keyName(chord) },
      { label: 'Position', value: positionName },
    ],
    fingerings: voices.map(({ hand, fingers, source }) => ({ hand, fingers, source })),
  }
}
