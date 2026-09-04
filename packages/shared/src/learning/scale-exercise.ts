import { z } from 'zod'
import { normalisePitchClass } from '../music/pitch.js'
import {
  findScaleType,
  scaleFormula,
  scaleOffsets,
  SCALE_TYPES,
  spellScale,
  type SpelledScale,
} from '../music/scales.js'
import { scaleFingering, type Hand } from '../music/fingering.js'
import type { Exercise, ExerciseStep } from './exercise.js'

/**
 * Turns a scale request into a generic exercise.
 *
 * This is the only place that knows a scale is a scale. Everything after it —
 * the session engine, the keyboard highlighting, the dashboard — sees the same
 * `Exercise` it will see for a chord or a progression.
 */

export const SCALE_DIRECTIONS = ['up', 'down', 'up-down'] as const
export type ScaleDirection = (typeof SCALE_DIRECTIONS)[number]

export const SCALE_DIRECTION_LABELS: Record<ScaleDirection, string> = {
  up: 'Up (Ascending)',
  down: 'Down (Descending)',
  'up-down': 'Up then Down',
}

export const HAND_LABELS: Record<Hand, string> = {
  right: 'Right Hand',
  left: 'Left Hand',
}

export const scaleSpecSchema = z.object({
  kind: z.literal('scale'),
  rootPitchClass: z.number().int().min(0).max(11),
  scaleTypeId: z.string().min(1),
  hand: z.enum(['right', 'left']),
  octaves: z.number().int().min(1).max(4),
  direction: z.enum(SCALE_DIRECTIONS),
})
export type ScaleSpec = z.infer<typeof scaleSpecSchema>

export const DEFAULT_SCALE_SPEC: ScaleSpec = {
  kind: 'scale',
  rootPitchClass: 9, // A
  scaleTypeId: 'natural-minor',
  hand: 'right',
  octaves: 2,
  direction: 'up',
}

/**
 * Where to place the root.
 *
 * A3 is the target: low enough that a two-octave scale stays inside a 61-key
 * view, high enough that the left hand is not down at the bottom of the piano.
 * The whole scale is checked against the top of that view, so a wide exercise
 * drops an octave rather than running off the end of a keyboard the player can
 * see.
 */
const PREFERRED_START = 57 // A3
const COMFORTABLE_TOP = 96 // C7, the top of the default 61-key view

function chooseStartNote(pitchClass: number, span: number): number {
  // One candidate per octave from C1 to C5.
  const candidates = [24, 36, 48, 60, 72].map((c) => c + normalisePitchClass(pitchClass))
  const fits = candidates.filter((note) => note + span <= COMFORTABLE_TOP)
  const pool = fits.length > 0 ? fits : candidates
  return pool.reduce((best, note) =>
    Math.abs(note - PREFERRED_START) < Math.abs(best - PREFERRED_START) ? note : best,
  )
}

/** `Thumb under` / `Cross over`, placed on the note where the hand actually moves. */
function movementCue(
  previousFinger: number | undefined,
  finger: number,
  hand: Hand,
  ascending: boolean,
): string | undefined {
  if (previousFinger === undefined) return undefined
  const thumbUnder = hand === 'right' ? ascending : !ascending
  if (thumbUnder) return finger === 1 && previousFinger > 1 ? 'Thumb under' : undefined
  return previousFinger === 1 && finger > 1 ? 'Cross over' : undefined
}

export function buildScaleExercise(spec: ScaleSpec): Exercise {
  const type = findScaleType(spec.scaleTypeId) ?? SCALE_TYPES[0]!
  const scale: SpelledScale = spellScale(spec.rootPitchClass, type)
  const offsets = scaleOffsets(type)
  const span = 12 * spec.octaves
  const start = chooseStartNote(spec.rootPitchClass, span)

  // Ascending note list: every degree in every octave, plus the final root.
  const ascending: { note: number; degreeIndex: number }[] = []
  for (let octave = 0; octave < spec.octaves; octave++) {
    for (let i = 0; i < offsets.length; i++) {
      ascending.push({ note: start + octave * 12 + offsets[i]!, degreeIndex: i })
    }
  }
  ascending.push({ note: start + span, degreeIndex: 0 })

  const fingering = scaleFingering({
    rootName: scale.root.name,
    scaleTypeId: type.id,
    hand: spec.hand,
    octaves: spec.octaves,
    notes: ascending.map((entry) => entry.note),
  })

  // Descending is the same shape read backwards, fingers included — which is
  // exactly how it is taught, and why only one pattern has to be stored.
  const descending = [...ascending].reverse()
  const descendingFingers = [...fingering.fingers].reverse()

  const sequence =
    spec.direction === 'up'
      ? ascending.map((entry, i) => ({ ...entry, finger: fingering.fingers[i]!, ascending: true }))
      : spec.direction === 'down'
        ? descending.map((entry, i) => ({
            ...entry,
            finger: descendingFingers[i]!,
            ascending: false,
          }))
        : [
            ...ascending.map((entry, i) => ({
              ...entry,
              finger: fingering.fingers[i]!,
              ascending: true,
            })),
            // The turn is not played twice.
            ...descending.slice(1).map((entry, i) => ({
              ...entry,
              finger: descendingFingers[i + 1]!,
              ascending: false,
            })),
          ]

  const steps: ExerciseStep[] = sequence.map((entry, index) => {
    const pitch = scale.notes[entry.degreeIndex]!
    return {
      id: `${index}`,
      notes: [entry.note],
      fingers: [{ finger: entry.finger, hand: spec.hand }],
      label: pitch.name,
      degree: type.degrees[entry.degreeIndex],
      cue: movementCue(sequence[index - 1]?.finger, entry.finger, spec.hand, entry.ascending),
    }
  })

  const directionLabel = SCALE_DIRECTION_LABELS[spec.direction]
  const octaveLabel = `${spec.octaves} ${spec.octaves === 1 ? 'octave' : 'octaves'}`

  return {
    id: `scale:${scale.root.name}:${type.id}:${spec.hand}:${spec.octaves}:${spec.direction}`,
    kind: 'scale',
    title: `${scale.root.name} ${type.name}`,
    subtitle: `${HAND_LABELS[spec.hand]} · ${octaveLabel} · ${directionLabel}`,
    steps,
    pitchClasses: scale.notes.map((note) => note.pitchClass),
    rootPitchClass: scale.root.pitchClass,
    pitchNames: Object.fromEntries(scale.notes.map((note) => [note.pitchClass, note.name])),
    notes: steps.map((step) => step.notes[0]!),
    facts: [
      { label: 'Notes', value: scale.notes.map((note) => note.name).join(' ') },
      { label: 'Formula', value: scaleFormula(type) },
      { label: 'Degrees', value: type.degrees.join(' ') },
    ],
    fingering: { hand: spec.hand, fingers: fingering.fingers, source: fingering.source },
    defaultBpm: 72,
  }
}
