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
import {
  fingeringSystem,
  SCALE_FORMS,
  type FingerPair,
  type FingeringSystemId,
  type ScaleForm,
} from '../music/fingering-system.js'
import type { NoteRange } from '../domain/device.js'
import { tetrachords } from '../music/theory.js'
import type { Exercise, ExerciseFingering, ExerciseMeter, ExerciseStep } from './exercise.js'

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

/**
 * How two hands are set against each other. Only means anything with both
 * hands playing; these are the lines a scale book prints under each key.
 *
 * - `similar` — the same notes an octave apart, moving together.
 * - `contrary` — from one shared note, the right hand up and the left hand
 *   down, and back to meet.
 * - `third` — moving together, the right hand a third above the left.
 * - `sixth` — moving together, the right hand a sixth above the left.
 */
export const SCALE_MOTIONS = SCALE_FORMS
export type ScaleMotion = ScaleForm

export const SCALE_MOTION_LABELS: Record<ScaleMotion, string> = {
  similar: 'Similar Motion',
  contrary: 'Contrary Motion',
  third: 'A Third Apart',
  sixth: 'A Sixth Apart',
}

/**
 * The motions a scale can be played in.
 *
 * Thirds and sixths are intervals of a seven-note scale: two steps along a
 * pentatonic is not a third. And contrary motion needs a scale that is the
 * same going down as going up — a melodic minor in contrary motion has one
 * hand on the raised sixth and seventh while the other is on the lowered ones.
 */
export function scaleMotionsFor(type: ScaleType): ScaleMotion[] {
  return SCALE_MOTIONS.filter((motion) =>
    motion === 'similar'
      ? true
      : motion === 'contrary'
        ? type.descendingTypeId === undefined
        : type.steps.length === 7,
  )
}

/**
 * What each hand plays: one note at a time, or two.
 *
 * - `double-thirds` — each note with the third above it, in the same hand.
 * - `staccato-octaves`, `legato-octaves` — each note with its octave. The two
 *   are the same notes; they are apart because they are fingered differently,
 *   and because a demonstration of one should not sound like the other.
 */
export const SCALE_TEXTURES = [
  'single',
  'double-thirds',
  'staccato-octaves',
  'legato-octaves',
] as const
export type ScaleTexture = (typeof SCALE_TEXTURES)[number]

export const SCALE_TEXTURE_LABELS: Record<ScaleTexture, string> = {
  single: 'Single Notes',
  'double-thirds': 'Double Thirds',
  'staccato-octaves': 'Staccato Octaves',
  'legato-octaves': 'Legato Octaves',
}

/**
 * The textures a scale can be played in.
 *
 * Any scale can be played in octaves. Double thirds are offered where there is
 * a fingering to teach them by, and that is the major scales: a hand holding
 * two notes has three ways to do it and has to change between them in exactly
 * the right places, which is not something to guess at.
 */
export function scaleTexturesFor(type: ScaleType): ScaleTexture[] {
  return SCALE_TEXTURES.filter((texture) => texture !== 'double-thirds' || type.id === 'major')
}

/**
 * How many notes go to a beat: crotchets, quavers, triplets, semiquavers.
 *
 * The same scale at the same tempo, two, three and four times as fast — which
 * is how a scale is actually worked up. The click stays where it is and the
 * notes divide it.
 */
export const NOTES_PER_BEAT = [1, 2, 3, 4] as const
export type NotesPerBeat = (typeof NOTES_PER_BEAT)[number]

export const NOTES_PER_BEAT_LABELS: Record<NotesPerBeat, string> = {
  1: 'Quarter Notes',
  2: 'Eighth Notes',
  3: 'Triplets',
  4: 'Sixteenth Notes',
}

/** Subdivided scales are written in common time, as scale books write them. */
const COMMON_TIME: ExerciseMeter = { beats: 4, beatType: 4 }

/**
 * A run of steps in even notes, `perBeat` to the beat, closing on a long one.
 *
 * The last note is where a scale stops, and it is written to say so: landing
 * on a beat, it is held to the end of its bar — a minim after a two-octave
 * scale in quavers, exactly as the page ends it. Landing between beats it is
 * held to the next one where a plain note can write that. A scale in triplets
 * that ends mid-beat has no such note, and ends on a triplet.
 */
export function inEvenNotes(
  steps: readonly ExerciseStep[],
  perBeat: number,
  meter: ExerciseMeter = COMMON_TIME,
): ExerciseStep[] {
  if (perBeat <= 1 || steps.length === 0) return [...steps]
  const length = 1 / perBeat
  const last = steps.length - 1
  // Counted in notes, so a triplet's thirds never have to add up to a whole.
  const into = last % perBeat
  const closing =
    into === 0
      ? meter.beats - (Math.floor(last / perBeat) % meter.beats)
      : perBeat === 3
        ? length
        : (perBeat - into) * length
  return steps.map((step, index) => ({ ...step, beats: index === last ? closing : length }))
}

/**
 * Whether a scale has a cadence to close with: I – IV – V – I, the chords of
 * a key, which a major or a minor scale has and a mode or a blues scale does
 * not in the same sense.
 */
export function scaleHasCadence(type: ScaleType): boolean {
  return type.family === 'major' || type.family === 'minor'
}

/** The cadence's four chords, as the page labels them. */
const CADENCE_NUMERALS = ['I', 'IV', 'V', 'I'] as const

/** The direction, as contrary motion reads it: the hands part, or meet. */
const CONTRARY_DIRECTION_LABELS: Record<ScaleDirection, string> = {
  up: 'Apart',
  down: 'Together',
  'up-down': 'Apart and Back',
}

/** Which hand a cue belongs to, once there are two it could be. */
const HAND_CUE_PREFIX: Record<Hand, string> = { right: 'Right', left: 'Left' }

export const scaleSpecSchema = z.object({
  kind: z.literal('scale'),
  rootPitchClass: z.number().int().min(0).max(11),
  /**
   * Which of the key's names it is written under — `E♭` rather than `D♯`.
   *
   * Left out, the scale takes its usual name. Named, because two keys on the
   * same piano keys are still two keys: different signatures, different
   * spellings, and in a method book, different pages.
   */
  tonic: z.string().optional(),
  scaleTypeId: z.string().min(1),
  hand: z.enum(SCALE_HANDS),
  /** How the two hands move against each other. Similar motion when left out. */
  motion: z.enum(SCALE_MOTIONS).optional(),
  /** What each hand plays. Single notes when left out. */
  texture: z.enum(SCALE_TEXTURES).optional(),
  /**
   * Close with I – IV – V – I, as a scale book ends each scale. Only where
   * the scale comes back down to finish on its tonic.
   */
  cadence: z.boolean().optional(),
  /** How many notes to a beat. One when left out. */
  notesPerBeat: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
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

/**
 * The keys an exercise may use, unless it is told about a bigger keyboard: a
 * 61-key instrument, C2 to C7, which is also the default view.
 */
export const DEFAULT_PLAYABLE_RANGE: NoteRange = { low: 36, high: 96 }

/**
 * The two minor keys the Brown Scale Book starts an octave above the rule.
 *
 * F and F♯ major begin low, on F3 and F♯3; F and F♯ minor begin on F4 and F♯4.
 * No range covers both, so the page is simply followed.
 */
const MINOR_START: Readonly<Record<number, number>> = { 5: 65, 6: 66 }

/**
 * Where the book starts the other lines of a key's page.
 *
 * Thirds: the left hand's tonic is somewhere from G2 to F♯3, the right hand a
 * third above it. Sixths: the right hand's tonic an octave higher, G3 to F♯4,
 * the left hand a sixth below — the very notes the right hand had in the
 * thirds. Contrary motion: the note both hands share is somewhere from A3 to
 * G♯4, except in G major, which the page starts on the G below middle C.
 */
const THIRD_START = 48.5 // midway through G2-F♯3
const SIXTH_START = 60.5 // midway through G3-F♯4
const CONTRARY_START = 62.5 // midway through A3-G♯4
const CONTRARY_MAJOR_START: Readonly<Record<number, number>> = { 7: 55 }

/** One hand's place in the exercise. */
interface VoicePlan {
  readonly hand: Hand
  /** Where this hand's lowest tonic would be: the note its degrees count from. */
  readonly anchor: number
  /** The degree it starts on, 0 at the tonic. */
  readonly startDegree: number
  /** Plays the run from the top down first: the left hand in contrary motion. */
  readonly inverted: boolean
}

/** The candidate nearest to where the book would put it, among those that fit. */
function nearest(
  candidates: readonly number[],
  preferred: number,
  fits: (note: number) => boolean,
): number {
  const fitting = candidates.filter(fits)
  const pool = fitting.length > 0 ? fitting : candidates
  return pool.reduce((best, note) =>
    Math.abs(note - preferred) < Math.abs(best - preferred) ? note : best,
  )
}

function placeHands(
  pitchClass: number,
  type: ScaleType,
  span: number,
  hands: ScaleHands,
  motion: ScaleMotion,
  texture: ScaleTexture,
  range: NoteRange,
): VoicePlan[] {
  const root = normalisePitchClass(pitchClass)
  // The scale's third degree, as semitones above the tonic.
  const third = scaleOffsets(type)[2] ?? 4
  const plain = { startDegree: 0, inverted: false }

  if (motion === 'third') {
    const candidates = [12, 24, 36, 48, 60, 72].map((c) => c + root)
    const left = nearest(
      candidates,
      THIRD_START,
      (note) => note >= range.low && note + third + span <= range.high,
    )
    return [
      { hand: 'left', anchor: left, ...plain },
      { hand: 'right', anchor: left, startDegree: 2, inverted: false },
    ]
  }

  if (motion === 'sixth') {
    const candidates = [24, 36, 48, 60, 72, 84].map((c) => c + root)
    const right = nearest(
      candidates,
      SIXTH_START,
      (note) => note - 12 + third >= range.low && note + span <= range.high,
    )
    return [
      { hand: 'left', anchor: right - 12, startDegree: 2, inverted: false },
      { hand: 'right', anchor: right, ...plain },
    ]
  }

  if (motion === 'contrary') {
    const candidates = [24, 36, 48, 60, 72, 84].map((c) => c + root)
    const preferred =
      (type.family === 'major' ? CONTRARY_MAJOR_START[root] : undefined) ?? CONTRARY_START
    const unison = nearest(
      candidates,
      preferred,
      (note) => note - span >= range.low && note + span <= range.high,
    )
    return [
      { hand: 'left', anchor: unison - span, startDegree: 0, inverted: true },
      { hand: 'right', anchor: unison, ...plain },
    ]
  }

  // One candidate per octave from C1 to C5.
  const candidates = [24, 36, 48, 60, 72].map((c) => c + root)
  const preferred = (type.family === 'minor' ? MINOR_START[root] : undefined) ?? PREFERRED_START
  const inOctaves = texture === 'staccato-octaves' || texture === 'legato-octaves'
  // How far above its lowest note a hand reaches: its octave, or its third.
  const reach = inOctaves ? 12 : texture === 'double-thirds' ? third : 0
  // In octaves the left hand needs an octave of its own beneath the right
  // hand's, so it sits two below: the book's example runs E2-E3 under E4-E5.
  const drop = inOctaves ? 24 : 12
  const right = nearest(
    candidates,
    preferred,
    (note) => note + span + reach <= range.high && (hands !== 'both' || note - drop >= range.low),
  )
  const below = right - drop
  const left =
    hands === 'both' || below >= range.low
      ? below
      : // A left hand alone, with no room for that: as low as there is room for.
        right - 12 >= range.low
        ? right - 12
        : right

  // Low hand first, so a step's notes read up the keyboard.
  return (hands === 'both' ? (['left', 'right'] as const) : [hands]).map((hand) => ({
    hand,
    anchor: hand === 'left' ? left : right,
    ...plain,
  }))
}

/** `Thumb under` / `Cross over`, placed on the note where the hand actually moves. */
export function movementCue(
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

export interface ScaleExerciseOptions {
  /**
   * Which fingering system puts the numbers on the notes. Not part of the
   * spec: the spec says what is played, and this only says how it is fingered.
   */
  readonly fingering?: FingeringSystemId
  /**
   * The keys the player has. A 61-key instrument when left out.
   *
   * It decides the octave and nothing else. The book starts A major in contrary
   * motion on the A below middle C and takes the left hand two octaves down
   * from there, to a note a 61-key keyboard does not have; with only those
   * keys the exercise moves up an octave rather than off the end.
   */
  readonly range?: NoteRange
}

export function buildScaleExercise(spec: ScaleSpec, options: ScaleExerciseOptions = {}): Exercise {
  const type = findScaleType(spec.scaleTypeId) ?? SCALE_TYPES[0]!
  const scale: SpelledScale = spellScale(spec.rootPitchClass, type, spec.tonic)
  const offsets = scaleOffsets(type)
  const span = 12 * spec.octaves
  const texture: ScaleTexture =
    spec.texture && scaleTexturesFor(type).includes(spec.texture) ? spec.texture : 'single'
  // A motion is a way for two hands to play single notes, and one the scale
  // can take. Hands holding thirds or octaves move together.
  const motion: ScaleMotion =
    spec.hand === 'both' &&
    texture === 'single' &&
    spec.motion &&
    scaleMotionsFor(type).includes(spec.motion)
      ? spec.motion
      : 'similar'
  const range = options.range ?? DEFAULT_PLAYABLE_RANGE
  const system = fingeringSystem(options.fingering)
  const plans = placeHands(spec.rootPitchClass, type, span, spec.hand, motion, texture, range)

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
    ? // From the same tonic, so a scale keeps one name both ways.
      spellScale(spec.rootPitchClass, descendingType, scale.root.name)
    : type.descendingDegrees
      ? (spellScaleFrom(scale.root, type, type.descendingDegrees) ?? scale)
      : scale
  const descendingOffsets = differsDescending ? scaleOffsets(descendingType) : offsets

  /**
   * A run in pitch order, bottom to top, for whichever form is asked for: from
   * the degree it starts on, up the octaves, to that degree again.
   */
  const climb = (plan: VoicePlan, formOffsets: readonly number[]) => {
    const size = formOffsets.length
    return Array.from({ length: size * spec.octaves + 1 }, (_, index) => {
      const position = plan.startDegree + index
      return {
        note: plan.anchor + Math.floor(position / size) * 12 + formOffsets[position % size]!,
        degreeIndex: position % size,
      }
    })
  }

  /**
   * One hand's way through the exercise: its own keys, each with its finger.
   *
   * Per hand because that is all that differs between them. In similar motion
   * both hands play the same degrees in the same order, an octave apart, and
   * each is fingered as itself — the left hand is not the right hand's numbers
   * moved down. The other motions only change where a hand starts and which
   * way it sets off.
   */
  const voice = (plan: VoicePlan) => {
    const { hand } = plan
    const ascending = climb(plan, offsets)
    const descendingClimb = climb(plan, descendingOffsets)

    /** What one hand plays at one moment: a note, or two, each with its finger. */
    type Part = { note: number; degreeIndex: number; finger: number }
    let up: Part[][]
    /** The way down, in pitch order — bottom note first, like the way up. */
    let down: Part[][]
    let summary: { fingers: readonly number[]; source: ExerciseFingering['source'] }

    if (texture === 'double-thirds') {
      // Each note with the third above it: the same run, started two degrees up.
      const upper = (formOffsets: readonly number[]) =>
        climb({ ...plan, startDegree: plan.startDegree + 2 }, formOffsets)
      const supplied = system.doubleThirds({
        tonic: scale.root.name,
        scaleTypeId: type.id,
        hand,
        octaves: spec.octaves,
      })
      // Nothing printed: the three holds in turn, as a suggestion.
      const holds: readonly FingerPair[] =
        hand === 'right'
          ? [
              [1, 3],
              [2, 4],
              [3, 5],
            ]
          : [
              [5, 3],
              [4, 2],
              [3, 1],
            ]
      const pairs = supplied?.pairs ?? ascending.map((_, index) => holds[index % 3]!)
      const thirds = (
        lower: typeof ascending,
        higher: typeof ascending,
        fingers: readonly FingerPair[],
      ) =>
        lower.map((entry, index) => [
          { ...entry, finger: fingers[index]![0] },
          { ...higher[index]!, finger: fingers[index]![1] },
        ])
      up = thirds(ascending, upper(offsets), pairs)
      // A page that comes home on different fingers from the ones it left on
      // says so in `closing`.
      down = thirds(descendingClimb, upper(descendingOffsets), supplied?.closing ?? pairs)
      summary = { fingers: pairs.flat(), source: supplied ? 'standard' : 'derived' }
    } else if (texture !== 'single') {
      const articulation = texture === 'staccato-octaves' ? 'staccato' : 'legato'
      const octave = (run: typeof ascending) => {
        const pairs =
          system.octaves({ hand, articulation, notes: run.map((entry) => entry.note) }) ??
          run.map((): FingerPair => (hand === 'right' ? [1, 5] : [5, 1]))
        return run.map((entry, index) => [
          { ...entry, finger: pairs[index]![0] },
          { ...entry, note: entry.note + 12, finger: pairs[index]![1] },
        ])
      }
      up = octave(ascending)
      down = octave(descendingClimb)
      summary = {
        fingers: up.flatMap((parts) => parts.map((part) => part.finger)),
        source: 'standard',
      }
    } else {
      const fingering = scaleFingering({
        rootName: scale.root.name,
        scaleTypeId: type.id,
        hand,
        octaves: spec.octaves,
        notes: ascending.map((entry) => entry.note),
        system: options.fingering,
        form: motion,
        startDegree: plan.startDegree,
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
      const descendingFingering = differsDescending
        ? scaleFingering({
            rootName: descendingScale.root.name,
            scaleTypeId: descendingType.id,
            hand,
            octaves: spec.octaves,
            notes: descendingClimb.map((entry) => entry.note),
            system: options.fingering,
            form: motion,
            startDegree: plan.startDegree,
          })
        : fingering

      // A hand that sets off downwards — the left, in contrary motion — opens at
      // the top of its run, so the way down is its opening. For every other hand
      // the way down is the way back, and a page that comes home on different
      // fingers from the ones it left on says so in `closing`.
      const descendingFingers = plan.inverted
        ? descendingFingering.fingers
        : (descendingFingering.closing ?? descendingFingering.fingers)

      up = ascending.map((entry, i) => [{ ...entry, finger: fingering.fingers[i]! }])
      down = descendingClimb.map((entry, i) => [{ ...entry, finger: descendingFingers[i]! }])
      summary = fingering
    }

    const rising = up.map((parts) => ({ parts, ascending: true }))
    const falling = [...down].reverse().map((parts) => ({ parts, ascending: false }))

    // "Up" is the right hand's up. A hand in contrary motion goes the other way.
    const [first, second] = plan.inverted ? [falling, rising] : [rising, falling]

    return {
      hand,
      plan,
      fingering: summary,
      perStep: up[0]?.length ?? 1,
      sequence:
        spec.direction === 'up'
          ? first
          : spec.direction === 'down'
            ? second
            : // The turn is not played twice.
              [...first, ...second.slice(1)],
    }
  }

  const voices = plans.map(voice)

  const steps: ExerciseStep[] = voices[0]!.sequence.map((_, index) => {
    const playing = voices.flatMap(({ hand, sequence }) => {
      const at = sequence[index]!
      // Which form this note belongs to decides how it is spelled: the sixth of
      // A melodic minor is F♯ on the way up and F on the way down, and calling
      // both of them F♯ would name a note the player is not being asked for.
      const form = at.ascending ? scale : descendingScale
      const formType = at.ascending ? type : descendingType
      // A crossing is one finger passing another. A hand moving two notes at
      // a time shifts whole, and has no such moment to name.
      const cue =
        at.parts.length === 1
          ? movementCue(
              sequence[index - 1]?.parts[0]?.finger,
              at.parts[0]!.finger,
              hand,
              at.ascending,
            )
          : undefined
      return at.parts.map((part) => ({
        note: part.note,
        name: form.notes[part.degreeIndex]!.name,
        degree: formType.degrees[part.degreeIndex],
        finger: { finger: part.finger, hand, ...(cue ? { cue } : {}) },
      }))
    })
    const fingers = playing.map((voice) => voice.finger)
    // The hands do not cross on the same note, so with two of them playing a
    // bare "Thumb under" does not say whose.
    const cues = fingers.flatMap((finger) =>
      finger.cue
        ? [voices.length > 1 ? `${HAND_CUE_PREFIX[finger.hand]}: ${finger.cue}` : finger.cue]
        : [],
    )
    // In octaves the hands play one note between them and it has one name. A
    // third apart, or moving against each other, they play two.
    const names = [...new Set(playing.map((voice) => voice.name))]
    const degrees = [...new Set(playing.flatMap((voice) => (voice.degree ? [voice.degree] : [])))]

    return {
      id: `${index}`,
      notes: playing.map((voice) => voice.note),
      fingers,
      label: names.join(' + '),
      ...(names.length > 1 ? { noteLabels: playing.map((voice) => voice.name) } : {}),
      degree: degrees.length > 0 ? degrees.join(' + ') : undefined,
      cue: cues.length > 0 ? cues.join(' · ') : undefined,
    }
  })

  const perBeat: NotesPerBeat = spec.notesPerBeat ?? 1
  if (perBeat > 1) steps.splice(0, steps.length, ...inEvenNotes(steps, perBeat))

  /*
   * The cadence: I – IV – V – I, which is how a scale book ends a scale.
   *
   * After the scale has come back down to its tonic, and only then — there is
   * nothing to close at the top of a scale. The chords are the key's, so a
   * minor scale takes them from its harmonic form whichever form was played:
   * the dominant of A minor is E major, with the raised seventh in it.
   */
  const cadenceNames = new Map<number, string>()
  if (
    spec.cadence &&
    scaleHasCadence(type) &&
    texture === 'single' &&
    motion === 'similar' &&
    spec.direction !== 'up'
  ) {
    const mode = type.family === 'major' ? 'major' : 'minor'
    const keyType = findScaleType(mode === 'major' ? 'major' : 'harmonic-minor') ?? type
    const key = spellScale(spec.rootPitchClass, keyType, scale.root.name)
    const degree = scaleOffsets(keyType)
    /** Degrees of the key, 0 at the tonic; 7 is the tonic an octave up. */
    const at = (anchor: number, index: number) => ({
      note: anchor + (index >= 7 ? 12 : 0) + degree[index % 7]!,
      name: key.notes[index % 7]!.name,
    })
    // The tonic with its third at the bottom, the subdominant in root
    // position, the dominant with its fifth at the bottom, the tonic again.
    const chords: Record<Hand, readonly (readonly number[])[]> = {
      right: [
        [2, 4, 7],
        [3, 5, 7],
        [1, 4, 6],
        [2, 4, 7],
      ],
      // One bass note under each: the root of the chord.
      left: [[0], [3], [4], [0]],
    }

    CADENCE_NUMERALS.forEach((numeral, chord) => {
      const playing = voices.flatMap(({ hand, plan }) => {
        const fingers =
          system.cadence({ tonic: scale.root.name, mode, hand })?.[chord] ??
          (hand === 'right' ? [1, 3, 5] : [5])
        return chords[hand][chord]!.map((index, part) => ({
          ...at(plan.anchor, index),
          finger: { finger: fingers[part]!, hand },
        }))
      })
      for (const { note, name } of playing) cadenceNames.set(normalisePitchClass(note), name)
      // Named by the chord the right hand holds; a left hand alone is its bass note.
      const named = playing.some((voice) => voice.finger.hand === 'right')
        ? playing.filter((voice) => voice.finger.hand === 'right')
        : playing
      steps.push({
        id: `${steps.length}`,
        notes: playing.map((voice) => voice.note),
        fingers: playing.map((voice) => voice.finger),
        label: named.map((voice) => voice.name).join(' '),
        noteLabels: playing.map((voice) => voice.name),
        cue: numeral,
      })
    })
  }
  const closes = cadenceNames.size > 0

  /** Every note this exercise can name, across the forms it actually plays. */
  // In contrary motion one hand is always coming down.
  const playsDescending = spec.direction !== 'up' || motion === 'contrary'
  const sounding =
    differsDescending && playsDescending ? [...scale.notes, ...descendingScale.notes] : scale.notes

  // Only the split is needed here — it decides whether the keyboard can show
  // the two groups at all. Everything else about how a scale is built, the
  // theory dialog derives for itself, so one place explains a scale, not two.
  const halves = tetrachords(type)

  const directionLabel = (
    motion === 'contrary' ? CONTRARY_DIRECTION_LABELS : SCALE_DIRECTION_LABELS
  )[spec.direction]
  const handsLabel = motion === 'similar' ? HAND_LABELS[spec.hand] : SCALE_MOTION_LABELS[motion]
  const subtitle = [
    handsLabel,
    ...(texture === 'single' ? [] : [SCALE_TEXTURE_LABELS[texture]]),
    `${spec.octaves} ${spec.octaves === 1 ? 'octave' : 'octaves'}`,
    directionLabel,
    ...(perBeat > 1 ? [NOTES_PER_BEAT_LABELS[perBeat]] : []),
    ...(closes ? ['Cadence'] : []),
  ].join(' · ')
  // Where each hand begins is part of what the exercise is: the same scale an
  // octave away is a different thing to find on the keys.
  const placed = voices.map(({ sequence }) => sequence[0]!.parts[0]!.note).join('-')

  return {
    id: `scale:${scale.root.name}:${type.id}:${spec.hand}:${motion}:${texture}:${spec.octaves}:${spec.direction}:${perBeat}:${closes ? 'cadence' : 'plain'}:${placed}`,
    kind: 'scale',
    title: `${scale.root.name} ${type.name}`,
    subtitle,
    steps,
    // Both forms light up when both get played, or the descending sixth and
    // seventh would be notes the keyboard says are not in the scale.
    pitchClasses: [...new Set(sounding.map((note) => note.pitchClass))],
    rootPitchClass: scale.root.pitchClass,
    // The cadence's notes are named too, so the staff can spell the raised
    // seventh of a natural minor's dominant — but they are not added to the
    // scale's own pitch classes, because they are not in it.
    pitchNames: Object.fromEntries([
      ...cadenceNames,
      ...sounding.map((note): [number, string] => [note.pitchClass, note.name]),
    ]),
    ...(texture === 'staccato-octaves' ? { staccato: true } : {}),
    ...(perBeat > 1 ? { meter: COMMON_TIME } : {}),
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
    fingerings: voices.map(({ hand, fingering, perStep }) => ({
      hand,
      fingers: fingering.fingers,
      source: fingering.source,
      ...(perStep > 1 ? { perStep } : {}),
    })),
    defaultBpm: 72,
  }
}
