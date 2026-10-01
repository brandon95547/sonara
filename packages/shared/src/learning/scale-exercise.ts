import { z } from 'zod'
import { normalisePitchClass } from '../music/pitch.js'
import {
  findScaleType,
  keySignatureOf,
  scaleFormula,
  scaleOffsets,
  SCALE_TYPES,
  spellScale,
  spellScaleFrom,
  type ScaleType,
  type SpelledScale,
} from '../music/scales.js'
import { scaleFingering, type Hand } from '../music/fingering.js'
import { tetrachords } from '../music/theory.js'
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

/**
 * Which hand plays. `both` is the two together, an octave apart — the form
 * scale books print first and call "similar motion in octaves".
 */
export const SCALE_HANDS = ['right', 'left', 'both'] as const
export type ScaleHands = (typeof SCALE_HANDS)[number]

export const HAND_LABELS: Record<ScaleHands, string> = {
  right: 'Right Hand',
  left: 'Left Hand',
  both: 'Both Hands',
}

/** Which hand a cue belongs to, once there are two it could be. */
const HAND_CUE_PREFIX: Record<Hand, string> = { right: 'Right', left: 'Left' }

export const scaleSpecSchema = z.object({
  kind: z.literal('scale'),
  rootPitchClass: z.number().int().min(0).max(11),
  scaleTypeId: z.string().min(1),
  hand: z.enum(SCALE_HANDS),
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
 * The right hand starts somewhere from F3 to E4, which is the register the
 * scale books print: C major from middle C, G major from the G below it, E
 * major from the E above. Low enough that a two-octave scale stays inside a
 * 61-key view. The whole scale is checked against the top of that view, so a
 * wide exercise drops an octave rather than running off the end of a keyboard
 * the player can see.
 *
 * It used to aim at A3 and take the lower of two equally near octaves, which
 * put E and E♭ an octave under the page — close enough to play, and wrong for
 * anyone playing along with the book.
 *
 * The left hand plays the same scale an octave below the right. That is where
 * the scale books put it — "similar motion in octaves", right hand from A3 and
 * left from A2 — and where it will sit once the hands are put together. It used
 * to share the right hand's keys, which taught the left hand a position it
 * then has to leave.
 *
 * The one exception is a scale so wide the view has no octave to spare below
 * it: four octaves on 61 keys fit in one place, and a left hand on its own gets
 * it. Both hands together cannot share keys, so they stay an octave apart and
 * that one runs off the bottom of a 61 — it needs the bigger keyboard anyway.
 */
const PREFERRED_START = 58.5 // midway through F3-E4, so no two octaves tie
const COMFORTABLE_BOTTOM = 36 // C2, the bottom of the default 61-key view
const COMFORTABLE_TOP = 96 // C7, the top of it

/**
 * The two minor keys the Brown Scale Book starts an octave above the rule.
 *
 * F and F♯ major begin low, on F3 and F♯3; F and F♯ minor begin on F4 and F♯4.
 * No range covers both, so the page is simply followed.
 */
const MINOR_START: Readonly<Record<number, number>> = { 5: 65, 6: 66 }

function placeHands(
  pitchClass: number,
  type: ScaleType,
  span: number,
  hands: ScaleHands,
): Record<Hand, number> {
  const root = normalisePitchClass(pitchClass)
  // One candidate per octave from C1 to C5.
  const candidates = [24, 36, 48, 60, 72].map((c) => c + root)
  const fits = candidates.filter((note) => note + span <= COMFORTABLE_TOP)
  const pool = fits.length > 0 ? fits : candidates
  const preferred = (type.family === 'minor' ? MINOR_START[root] : undefined) ?? PREFERRED_START
  const right = pool.reduce((best, note) =>
    Math.abs(note - preferred) < Math.abs(best - preferred) ? note : best,
  )

  const below = right - 12
  return { right, left: hands === 'both' || below >= COMFORTABLE_BOTTOM ? below : right }
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
  const starts = placeHands(spec.rootPitchClass, type, span, spec.hand)
  // Low hand first, so a step's notes read up the keyboard.
  const hands: readonly Hand[] = spec.hand === 'both' ? ['left', 'right'] : [spec.hand]

  // A scale whose way down is not its way up. Only the melodic minor has one,
  // and reversing the ascending notes for it plays the raised sixth and seventh
  // coming down — two wrong notes on every turn.
  const descendingType = type.descendingTypeId
    ? (findScaleType(type.descendingTypeId) ?? type)
    : type
  const differsDescending = descendingType !== type
  // The same notes may still be *named* differently on the way down: the
  // chromatic scale falls in flats. Spelled from the same root, so the scale
  // keeps one name whichever way it is going.
  const descendingScale = differsDescending
    ? spellScale(spec.rootPitchClass, descendingType)
    : type.descendingDegrees
      ? (spellScaleFrom(scale.root, type, type.descendingDegrees) ?? scale)
      : scale
  const descendingOffsets = differsDescending ? scaleOffsets(descendingType) : offsets

  /** Root to octave, in pitch order, for whichever form is asked for. */
  const climb = (start: number, formOffsets: readonly number[]) => {
    const notes: { note: number; degreeIndex: number }[] = []
    for (let octave = 0; octave < spec.octaves; octave++) {
      for (let i = 0; i < formOffsets.length; i++) {
        notes.push({ note: start + octave * 12 + formOffsets[i]!, degreeIndex: i })
      }
    }
    notes.push({ note: start + span, degreeIndex: 0 })
    return notes
  }

  /**
   * One hand's way through the exercise: its own keys, each with its finger.
   *
   * Per hand because that is all that differs between them. Both hands play
   * the same degrees in the same order, an octave apart, and each is fingered
   * as itself — the left hand is not the right hand's numbers moved down.
   */
  const voice = (hand: Hand) => {
    const start = starts[hand]
    const ascending = climb(start, offsets)

    const fingering = scaleFingering({
      rootName: scale.root.name,
      scaleTypeId: type.id,
      hand,
      octaves: spec.octaves,
      notes: ascending.map((entry) => entry.note),
    })

    // Descending is the ascending shape read backwards, fingers included — which
    // is how it is taught, and why one stored pattern per scale is enough.
    //
    // Unless the way down is a different scale. A melodic minor descends as a
    // natural minor, and in F♯ and C♯ the two forms are fingered differently: the
    // source moves the right hand's 4th finger onto the raised sixth going up and
    // puts it back going down, saying so on the page. Mirroring the ascending
    // fingering would carry the ascending hand into the descent and contradict
    // that, so the descending form is fingered as itself.
    const descendingClimb = climb(start, descendingOffsets)
    const descendingFingering = differsDescending
      ? scaleFingering({
          rootName: descendingScale.root.name,
          scaleTypeId: descendingType.id,
          hand,
          octaves: spec.octaves,
          notes: descendingClimb.map((entry) => entry.note),
        })
      : fingering
    const descendingFingers = [...descendingFingering.fingers].reverse()

    const up = ascending.map((entry, i) => ({
      ...entry,
      finger: fingering.fingers[i]!,
      ascending: true,
    }))
    const down = [...descendingClimb].reverse().map((entry, i) => ({
      ...entry,
      finger: descendingFingers[i]!,
      ascending: false,
    }))

    return {
      hand,
      fingering,
      sequence:
        spec.direction === 'up'
          ? up
          : spec.direction === 'down'
            ? down
            : // The turn is not played twice.
              [...up, ...down.slice(1)],
    }
  }

  const voices = hands.map(voice)

  const steps: ExerciseStep[] = voices[0]!.sequence.map((entry, index) => {
    // Which form this note belongs to decides how it is spelled: the sixth of
    // A melodic minor is F♯ on the way up and F on the way down, and calling
    // both of them F♯ would name a note the player is not being asked for.
    const form = entry.ascending ? scale : descendingScale
    const formType = entry.ascending ? type : descendingType
    const pitch = form.notes[entry.degreeIndex]!

    const fingers = voices.map(({ hand, sequence }) => {
      const at = sequence[index]!
      const cue = movementCue(sequence[index - 1]?.finger, at.finger, hand, at.ascending)
      return { finger: at.finger, hand, ...(cue ? { cue } : {}) }
    })
    // The hands do not cross on the same note, so with two of them playing a
    // bare "Thumb under" does not say whose.
    const cues = fingers.flatMap((finger) =>
      finger.cue
        ? [voices.length > 1 ? `${HAND_CUE_PREFIX[finger.hand]}: ${finger.cue}` : finger.cue]
        : [],
    )

    return {
      id: `${index}`,
      notes: voices.map(({ sequence }) => sequence[index]!.note),
      fingers,
      label: pitch.name,
      degree: formType.degrees[entry.degreeIndex],
      cue: cues.length > 0 ? cues.join(' · ') : undefined,
    }
  })

  /** Every note this exercise can name, across the forms it actually plays. */
  const playsDescending = spec.direction !== 'up'
  const sounding =
    differsDescending && playsDescending ? [...scale.notes, ...descendingScale.notes] : scale.notes

  // Only the split is needed here — it decides whether the keyboard can show
  // the two groups at all. Everything else about how a scale is built, the
  // theory dialog derives for itself, so one place explains a scale, not two.
  const halves = tetrachords(type)

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
    notes: steps.flatMap((step) => step.notes),
    pitchDegrees: Object.fromEntries(
      scale.notes.map((note, index) => [note.pitchClass, type.degrees[index] ?? String(index + 1)]),
    ),
    ...(halves
      ? {
          tetrachordGroups: {
            lower: scale.notes.slice(0, 4).map((note) => note.pitchClass),
            // The upper group's fourth note is the octave — the tonic again,
            // which is why the two groups join into one scale rather than
            // sitting next to each other.
            upper: [...scale.notes.slice(4, 7), scale.notes[0]!].map((note) => note.pitchClass),
          },
        }
      : {}),
    facts: [
      { label: 'Notes', value: scale.notes.map((note) => note.name).join(' ') },
      ...(descendingScale !== scale
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
    keyFifths: keySignatureOf(scale),
    fingerings: voices.map(({ hand, fingering }) => ({
      hand,
      fingers: fingering.fingers,
      source: fingering.source,
    })),
    defaultBpm: 72,
  }
}
