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
import {
  degreeNames,
  fourthFingerDegrees,
  ordinal,
  relativeKey,
  tetrachords,
} from '../music/theory.js'
import type { Exercise, ExerciseFact, ExerciseStep } from './exercise.js'

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

/** `A`, or `B and F♯` — the book writes two anchors that way and so do we. */
function listOut(parts: readonly string[]): string {
  return parts.length <= 1
    ? (parts[0] ?? '')
    : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}

export function buildScaleExercise(spec: ScaleSpec): Exercise {
  const type = findScaleType(spec.scaleTypeId) ?? SCALE_TYPES[0]!
  const scale: SpelledScale = spellScale(spec.rootPitchClass, type)
  const offsets = scaleOffsets(type)
  const span = 12 * spec.octaves
  const start = chooseStartNote(spec.rootPitchClass, span)

  // A scale whose way down is not its way up. Only the melodic minor has one,
  // and reversing the ascending notes for it plays the raised sixth and seventh
  // coming down — two wrong notes on every turn.
  const descendingType = type.descendingTypeId
    ? (findScaleType(type.descendingTypeId) ?? type)
    : type
  const differsDescending = descendingType !== type
  const descendingScale = differsDescending
    ? spellScale(spec.rootPitchClass, descendingType)
    : scale
  const descendingOffsets = differsDescending ? scaleOffsets(descendingType) : offsets

  /** Root to octave, in pitch order, for whichever form is asked for. */
  const climb = (formOffsets: readonly number[]) => {
    const notes: { note: number; degreeIndex: number }[] = []
    for (let octave = 0; octave < spec.octaves; octave++) {
      for (let i = 0; i < formOffsets.length; i++) {
        notes.push({ note: start + octave * 12 + formOffsets[i]!, degreeIndex: i })
      }
    }
    notes.push({ note: start + span, degreeIndex: 0 })
    return notes
  }

  const ascending = climb(offsets)

  const fingering = scaleFingering({
    rootName: scale.root.name,
    scaleTypeId: type.id,
    hand: spec.hand,
    octaves: spec.octaves,
    notes: ascending.map((entry) => entry.note),
  })

  // Descending is the same shape read backwards, fingers included — which is
  // exactly how it is taught, and why only one pattern has to be stored. When
  // the scale has a separate descending form, the shape read backwards is that
  // form's; the fingering still mirrors, because the book prints one fingering
  // for a minor scale and uses it for all three of its forms.
  const descending = [...climb(descendingOffsets)].reverse()
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
    // Which form this note belongs to decides how it is spelled: the sixth of
    // A melodic minor is F♯ on the way up and F on the way down, and calling
    // both of them F♯ would name a note the player is not being asked for.
    const form = entry.ascending ? scale : descendingScale
    const formType = entry.ascending ? type : descendingType
    const pitch = form.notes[entry.degreeIndex]!
    return {
      id: `${index}`,
      notes: [entry.note],
      fingers: [{ finger: entry.finger, hand: spec.hand }],
      label: pitch.name,
      degree: formType.degrees[entry.degreeIndex],
      cue: movementCue(sequence[index - 1]?.finger, entry.finger, spec.hand, entry.ascending),
    }
  })

  /**
   * How this scale is built — derived, never tabulated.
   *
   * The 4th finger line is the one that earns its place: it is eight digits
   * replaced by one fact, and it is the axis the source organises every scale
   * around. It only appears for a fingering we can stand behind; a derived
   * suggestion has no anchor to teach, and saying otherwise would dress a guess
   * up as a rule.
   */
  const anchorDegrees = fourthFingerDegrees(fingering.fingers, spec.hand)
  const names = degreeNames(type)
  const relative = relativeKey(spec.rootPitchClass, type)
  const halves = tetrachords(type)

  const theory: ExerciseFact[] = []

  if (fingering.source === 'standard' && anchorDegrees.length > 0) {
    const notes = anchorDegrees.map((degree) => scale.notes[degree]!.name)
    const ordinals = anchorDegrees.map((degree) => ordinal(degree + 1))
    const named = anchorDegrees.length === 1 ? names[anchorDegrees[0]!] : undefined
    theory.push({
      label: '4th finger',
      value:
        `${listOut(notes)} — ${listOut(ordinals)} ` +
        `${anchorDegrees.length === 1 ? 'degree' : 'degrees'}` +
        `${named ? ` (the ${named.toLowerCase()})` : ''}`,
    })
  }

  if (halves) {
    theory.push({
      label: 'Built from',
      value:
        `${halves.lower} · ${halves.join} · ${halves.upper} — one four-note shape, ` +
        `a ${halves.join === 'W' ? 'whole' : 'half'} step, then the same shape again`,
    })
  }

  if (relative) {
    // Named for what it is rather than described as "the same notes": that is
    // true of the natural minor and false of the harmonic and melodic ones,
    // which raise a degree on the way past. The key signature is shared by all
    // three, and the degree says where to start counting.
    theory.push({
      label: relative.typeName === 'Major' ? 'Relative major' : 'Relative minor',
      value: `${relative.name} ${relative.typeName} — same key signature, from this scale's ${ordinal(relative.fromDegree)} degree`,
    })
  }

  /** Every note this exercise can name, across the forms it actually plays. */
  const playsDescending = spec.direction !== 'up'
  const sounding =
    differsDescending && playsDescending ? [...scale.notes, ...descendingScale.notes] : scale.notes

  const directionLabel = SCALE_DIRECTION_LABELS[spec.direction]
  const octaveLabel = `${spec.octaves} ${spec.octaves === 1 ? 'octave' : 'octaves'}`

  return {
    id: `scale:${scale.root.name}:${type.id}:${spec.hand}:${spec.octaves}:${spec.direction}`,
    kind: 'scale',
    title: `${scale.root.name} ${type.name}`,
    subtitle: `${HAND_LABELS[spec.hand]} · ${octaveLabel} · ${directionLabel}`,
    steps,
    // Both forms light up when both get played, or the descending sixth and
    // seventh would be notes the keyboard says are not in the scale.
    pitchClasses: [...new Set(sounding.map((note) => note.pitchClass))],
    rootPitchClass: scale.root.pitchClass,
    pitchNames: Object.fromEntries(sounding.map((note) => [note.pitchClass, note.name])),
    notes: steps.map((step) => step.notes[0]!),
    facts: [
      { label: 'Notes', value: scale.notes.map((note) => note.name).join(' ') },
      ...(differsDescending
        ? [
            {
              label: 'Coming down',
              // From the top note downwards, which is the order it is played
              // in. Reversing the root-first list would start on the seventh.
              value: [descendingScale.notes[0]!, ...descendingScale.notes.slice(1).reverse()]
                .map((note) => note.name)
                .join(' '),
            },
          ]
        : []),
      { label: 'Formula', value: scaleFormula(type) },
      { label: 'Degrees', value: type.degrees.join(' ') },
    ],
    ...(theory.length > 0 ? { theory } : {}),
    fingering: { hand: spec.hand, fingers: fingering.fingers, source: fingering.source },
    defaultBpm: 72,
  }
}
