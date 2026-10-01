import { z } from 'zod'
import type { NoteRange } from '../domain/device.js'
import { CADENCE_VOICINGS, cadenceFingers, type CadenceChord } from '../music/cadences.js'
import { KEY_MODE_LABELS, KEY_MODES, keyTriads, type KeyMode } from '../music/chords.js'
import { scaleFingering, type Hand } from '../music/fingering.js'
import type { FingeringSystemId } from '../music/fingering-system.js'
import { accidentalFor, makePitch, normalisePitchClass, type Pitch } from '../music/pitch.js'
import {
  findScaleType,
  keySignatureOf,
  scaleOffsets,
  SCALE_TYPES,
  spellScale,
} from '../music/scales.js'
import { ordinal } from '../music/theory.js'
import type {
  Exercise,
  ExerciseFingering,
  ExerciseMeter,
  ExerciseStep,
  StepFinger,
} from './exercise.js'
import {
  DEFAULT_PLAYABLE_RANGE,
  HAND_LABELS,
  movementCue,
  SCALE_HANDS,
  type ScaleHands,
} from './scale-exercise.js'

/**
 * The practice routines: ways of working a scale and its chords that are not
 * the scale played straight.
 *
 * They are the "Enrichment Options" that close the Alfred book (Palmer, Manus,
 * Lethco, *The Complete Book of Scales, Chords, Arpeggios & Cadences*,
 * pp. 80–86). The book prints each one once, in C, as a pattern to carry into
 * whatever key is being studied — which is a thing a page cannot do and a
 * program can, so every one of them is built here from the key.
 *
 * The notes and the rhythm are the page's. The fingering is the scale's own:
 * where the page fingers a routine, its numbers are the C major scale's
 * fingering carried through the pattern, so in another key the routine takes
 * that key's scale fingering from the system the player has chosen. The few
 * places the page departs from the scale are followed, and say so.
 *
 * A minor key is played in its harmonic form, which is the form its chords
 * come from and the one the book calls the most used.
 */

export const ROUTINES = [
  'blocked',
  'expanding-1',
  'expanding-2',
  'accelerating',
  'grand-form',
  'harmonized-bass',
  'harmonized-treble',
  'triad-chain',
] as const
export type Routine = (typeof ROUTINES)[number]

export const ROUTINE_LABELS: Record<Routine, string> = {
  blocked: 'Blocked Scale',
  'expanding-1': 'Expanding Scale No. 1',
  'expanding-2': 'Expanding Scale No. 2',
  accelerating: 'Accelerating Scale',
  'grand-form': 'The Grand Form',
  'harmonized-bass': 'Harmonized, Chords in the Bass',
  'harmonized-treble': 'Harmonized, Chords in the Treble',
  'triad-chain': 'Triad Chain',
}

/** What each routine is, in a line — for the menu that chooses between them. */
export const ROUTINE_DESCRIPTIONS: Record<Routine, string> = {
  blocked: 'The thumb alone, then the fingers after it together: the scale as hand positions.',
  'expanding-1': 'Up to the 3rd and back, then the 4th, the 5th… until it is the whole scale.',
  'expanding-2': 'From the middle, a note further each way every time.',
  accelerating: 'Quarters, eighths, triplets, sixteenths — one pulse, four speeds.',
  'grand-form': 'Together, apart, together and back: the conservatory routine.',
  'harmonized-bass': 'The scale in the right hand over I, IV, V and V7 in the left.',
  'harmonized-treble': 'The scale in the left hand under I, IV, V and V7 in the right.',
  'triad-chain': 'Major, minor, diminished, augmented on one root — a half step at a time.',
}

const BOTH_ONLY: readonly ScaleHands[] = ['both']

/**
 * The hands a routine can be played with.
 *
 * The scale patterns take either hand or both. The rest are two-handed by
 * construction: one hand's part is the other's accompaniment, or its answer.
 */
export function routineHands(routine: Routine): readonly ScaleHands[] {
  return routine === 'blocked' ||
    routine === 'expanding-1' ||
    routine === 'expanding-2' ||
    routine === 'accelerating'
    ? SCALE_HANDS
    : BOTH_ONLY
}

/** Whether major or minor changes anything. A triad chain is built on a note, not in a key. */
export const routineHasMode = (routine: Routine): boolean => routine !== 'triad-chain'

export const routineSpecSchema = z.object({
  kind: z.literal('exercise'),
  rootPitchClass: z.number().int().min(0).max(11),
  /** Which of the key's names it is written under. See `ScaleSpec.tonic`. */
  tonic: z.string().optional(),
  mode: z.enum(KEY_MODES),
  hand: z.enum(SCALE_HANDS),
  routine: z.enum(ROUTINES),
})
export type RoutineSpec = z.infer<typeof routineSpecSchema>

export const DEFAULT_ROUTINE_SPEC: RoutineSpec = {
  kind: 'exercise',
  rootPitchClass: 0,
  mode: 'major',
  hand: 'right',
  routine: 'blocked',
}

export interface RoutineExerciseOptions {
  readonly fingering?: FingeringSystemId
  /** The keys the player has. A 61-key instrument when left out. */
  readonly range?: NoteRange
}

/** The register the scales start in: the right hand's tonic somewhere from F3 to E4. */
const PREFERRED_RIGHT = 58.5

const mod7 = (degree: number) => ((degree % 7) + 7) % 7

/** One note of one hand: its key, its name, its finger. */
interface Played {
  readonly note: number
  readonly name: string
  readonly finger: number
}

/** One moment of a routine: what each hand plays, and for how long. */
interface Moment {
  readonly left?: readonly Played[]
  readonly right?: readonly Played[]
  readonly beats: number
  /** Named as a section begins: `4th degree`, `Triplets`. */
  readonly cue?: string
  /** The chord the moment belongs to, as a numeral. */
  readonly degree?: string
  /** What to call it, where the notes' own names are not the answer. */
  readonly label?: string
  /** How long each hand's notes are held, where that is longer than the moment. */
  readonly holds?: Partial<Record<Hand, number>>
}

const HAND_WORDS: Record<Hand, string> = { left: 'Left', right: 'Right' }

/** Turns a routine's moments into steps: low hand first, each finger with its hand. */
function stepsFrom(moments: readonly Moment[]): ExerciseStep[] {
  const previous: Partial<Record<Hand, Played>> = {}
  const hands = (['left', 'right'] as const).filter((hand) =>
    moments.some((moment) => moment[hand] !== undefined),
  )

  return moments.map((moment, index) => {
    const playing = hands.flatMap((hand) =>
      (moment[hand] ?? []).map((played) => ({ ...played, hand })),
    )
    const fingers: StepFinger[] = []
    const crossings: string[] = []
    for (const hand of hands) {
      const mine = moment[hand] ?? []
      const last = previous[hand]
      for (const played of mine) {
        // A crossing is one finger passing another: a single line, moving by
        // step. A hand holding a cluster or a chord shifts whole.
        const cue =
          mine.length === 1 && last && Math.abs(played.note - last.note) <= 3
            ? movementCue(last.finger, played.finger, hand, played.note > last.note)
            : undefined
        if (cue) crossings.push(hands.length > 1 ? `${HAND_WORDS[hand]}: ${cue}` : cue)
        fingers.push({ finger: played.finger, hand, ...(cue ? { cue } : {}) })
      }
      if (mine.length === 1) previous[hand] = mine[0]
      else if (mine.length > 1) delete previous[hand]
    }

    // Named for the upper hand's notes, as a step of a two-handed scale is.
    const named = moment.right ?? moment.left ?? []
    const names = [...new Set(named.map((played) => played.name))]
    const distinct = new Set(playing.map((played) => played.name)).size
    const cue = moment.cue ?? (crossings.length > 0 ? crossings.join(' · ') : undefined)
    const holds = moment.holds
      ? playing.map((played) => moment.holds![played.hand] ?? moment.beats)
      : undefined

    return {
      id: `${index}`,
      notes: playing.map((played) => played.note),
      fingers,
      label: moment.label ?? names.join(' '),
      ...(distinct > 1 ? { noteLabels: playing.map((played) => played.name) } : {}),
      ...(moment.degree ? { degree: moment.degree } : {}),
      ...(cue ? { cue } : {}),
      ...(moment.beats !== 1 ? { beats: moment.beats } : {}),
      ...(holds ? { holds } : {}),
    }
  })
}

export function buildRoutineExercise(
  spec: RoutineSpec,
  options: RoutineExerciseOptions = {},
): Exercise {
  const range = options.range ?? DEFAULT_PLAYABLE_RANGE
  if (spec.routine === 'triad-chain') return buildTriadChain(spec, range)

  const mode: KeyMode = spec.mode
  const type = findScaleType(mode === 'major' ? 'major' : 'harmonic-minor') ?? SCALE_TYPES[0]!
  const scale = spellScale(spec.rootPitchClass, type, spec.tonic)
  const offsets = scaleOffsets(type)
  const tonic = scale.notes[0]!
  const keyName = `${tonic.name} ${KEY_MODE_LABELS[mode]}`
  const hands: readonly Hand[] = routineHands(spec.routine).includes(spec.hand)
    ? spec.hand === 'both'
      ? ['left', 'right']
      : [spec.hand]
    : ['left', 'right']

  /** The key at a scale degree counted from a tonic: 7 is that tonic's octave, -1 the note below it. */
  const keyAt = (anchor: number, degree: number) =>
    anchor + Math.floor(degree / 7) * 12 + offsets[mod7(degree)]!
  const nameAt = (degree: number) => scale.notes[mod7(degree)]!.name

  /**
   * Where the right hand's lowest tonic goes: the register the key's scale
   * starts in, or the nearest octave to it the routine fits the keyboard from.
   */
  const place = (fits: (right: number) => boolean, preferred = PREFERRED_RIGHT): number => {
    const candidates = [24, 36, 48, 60, 72, 84].map((c) => c + tonic.pitchClass)
    const fitting = candidates.filter(fits)
    const pool = fitting.length > 0 ? fitting : candidates
    return pool.reduce((best, note) =>
      Math.abs(note - preferred) < Math.abs(best - preferred) ? note : best,
    )
  }

  /** A hand's scale run from `anchor`, fingered by the chosen system. */
  const run = (hand: Hand, anchor: number, octaves: number) => {
    const notes = Array.from({ length: 7 * octaves + 1 }, (_, index) => keyAt(anchor, index))
    const fingering = scaleFingering({
      rootName: tonic.name,
      scaleTypeId: type.id,
      hand,
      octaves,
      notes,
      system: options.fingering,
    })
    /**
     * The note `index` degrees up the run, on the finger the run gives it —
     * the same going down as going up. A routine turns round at the bottom
     * again and again, and a hand that changed fingers for each descent would
     * never be in the position the next ascent starts from.
     */
    const at = (index: number, finger = fingering.fingers[index]!): Played => ({
      note: keyAt(anchor, index),
      name: nameAt(index),
      finger,
    })
    return { hand, anchor, fingering, at }
  }

  const summary = (voice: ReturnType<typeof run>): ExerciseFingering => ({
    hand: voice.hand,
    fingers: voice.fingering.fingers,
    source: voice.fingering.source,
  })

  /** Both hands (or the one) playing the same line an octave apart. */
  const together = (
    voices: readonly ReturnType<typeof run>[],
    line: readonly {
      index: number
      beats: number
      cue?: string
      finger?: (voice: ReturnType<typeof run>) => number | undefined
    }[],
  ): Moment[] =>
    line.map(({ index, beats, cue, finger }) => ({
      ...Object.fromEntries(
        voices.map((voice) => [voice.hand, [voice.at(index, finger?.(voice))]]),
      ),
      beats,
      ...(cue ? { cue } : {}),
    }))

  let moments: Moment[]
  let meter: ExerciseMeter
  let fingerings: ExerciseFingering[]
  let detail: string
  let placed: number
  let subtitleHands = hands.length === 2 ? HAND_LABELS.both : HAND_LABELS[hands[0]!]
  const up = (from: number, to: number) =>
    Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i)
  const down = (from: number, to: number) =>
    Array.from({ length: Math.max(0, from - to + 1) }, (_, i) => from - i)

  switch (spec.routine) {
    case 'blocked': {
      /*
       * p. 81. Two octaves in half notes: each thumb note alone, and the
       * fingers between one thumb and the next struck together. The run's two
       * end notes stand alone as well — the page gives the right hand's top C
       * and the left hand's bottom C a half note each to themselves.
       */
      placed = place((right) => right + 24 <= range.high && right - 12 >= range.low)
      const voices = hands.map((hand) => run(hand, hand === 'right' ? placed : placed - 12, 2))
      /**
       * A run cut into blocks: every thumb note by itself, and the fingers
       * between one thumb and the next together. With `endsAlone` the run's
       * first and last notes are blocks of their own too.
       */
      const blocksOf = (fingers: readonly number[], endsAlone: boolean) => {
        const last = fingers.length - 1
        const alone = (index: number) =>
          fingers[index] === 1 || (endsAlone && (index === 0 || index === last))
        const units: number[][] = []
        fingers.forEach((_, index) => {
          const open = units.at(-1)
          if (open && !alone(index) && !alone(open.at(-1)!)) open.push(index)
          else units.push([index])
        })
        return units
      }
      /*
       * The hands are blocked each by its own thumbs and played block against
       * block, so they need the same number of blocks. In C they have: nine
       * each. In a few keys one hand opens on a finger that leaves it a block
       * ahead — A♭ major's right hand starts 2 3 before its first thumb — and
       * there an end note joins the fingers beside it instead, in whichever
       * hands it takes to bring the two level again.
       */
      const choices: readonly (readonly boolean[])[] = [
        [true, true],
        [false, false],
        [true, false],
        [false, true],
      ]
      const count = (ends: readonly boolean[]) =>
        new Set(voices.map((voice, at) => blocksOf(voice.fingering.fingers, ends[at]!).length)).size
      const ends = choices.find((choice) => count(choice) === 1) ?? choices[0]!
      const blocks = voices.map((voice, at) => {
        const units = blocksOf(voice.fingering.fingers, ends[at]!)
        // Up through every block, and back down through all but the top one.
        return { voice, units: [...units, ...units.slice(0, -1).reverse()] }
      })
      const length = Math.max(...blocks.map(({ units }) => units.length))
      moments = Array.from({ length }, (_, at) => ({
        ...Object.fromEntries(
          blocks.flatMap(({ voice, units }) =>
            units[at] ? [[voice.hand, units[at]!.map((index) => voice.at(index))]] : [],
          ),
        ),
        beats: at === length - 1 ? 4 : 2,
      }))
      meter = { beats: 4, beatType: 4 }
      fingerings = voices.map(summary)
      detail = '2 octaves'
      break
    }

    case 'expanding-1': {
      /*
       * p. 82. From the tonic up to the 3rd degree and back to the 2nd; then
       * to the 4th; and so on to the 7th; then the whole scale, home. One
       * octave, in crotchets, closing on a minim.
       */
      placed = place((right) => right + 12 <= range.high && right - 12 >= range.low)
      const voices = hands.map((hand) => run(hand, hand === 'right' ? placed : placed - 12, 1))
      const line = [2, 3, 4, 5, 6].flatMap((top) =>
        [...up(0, top), ...down(top - 1, 1)].map((index, at) => ({
          index,
          beats: 1,
          ...(at === 0 ? { cue: `${ordinal(top + 1)} degree` } : {}),
        })),
      )
      const full = [...up(0, 7), ...down(6, 0)].map((index, at, all) => ({
        index,
        beats: at === all.length - 1 ? 2 : 1,
        ...(at === 0 ? { cue: 'Full scale' } : {}),
      }))
      moments = together(voices, [...line, ...full])
      meter = { beats: 2, beatType: 4 }
      fingerings = voices.map(summary)
      detail = '1 octave'
      break
    }

    case 'expanding-2': {
      /*
       * p. 82. From a tonic in the middle of two octaves: up a note and back,
       * down a note and back; then two notes each way; and on to the 7th
       * degree above and the 2nd below. "Begin with the finger that starts the
       * second octave" — which is the run's own finger for that note.
       */
      placed = place((right) => right + 24 <= range.high && right - 12 >= range.low)
      const voices = hands.map((hand) => run(hand, hand === 'right' ? placed : placed - 12, 2))
      const centre = 7
      const line = [1, 2, 3, 4, 5, 6].flatMap((reach) =>
        [
          ...up(centre, centre + reach),
          ...down(centre + reach - 1, centre - reach),
          ...up(centre - reach + 1, centre - 1),
        ].map((index, at) => ({
          index,
          beats: 1,
          ...(at === 0 ? { cue: `${ordinal(reach + 1)} degree` } : {}),
        })),
      )
      // The last note is where it stops, and takes the finger that ends an
      // octave: the right hand's 5th in C, as printed, not the thumb it has
      // been passing through on.
      const ending = (voice: ReturnType<typeof run>) =>
        run(voice.hand, voice.anchor, 1).fingering.fingers[7]
      moments = together(voices, [...line, { index: centre, beats: 2, finger: ending }])
      meter = { beats: 2, beatType: 4 }
      fingerings = voices.map(summary)
      detail = 'From the middle'
      break
    }

    case 'accelerating': {
      /*
       * p. 81. Straight through, each line into the next: one octave in
       * crotchets, then two octaves in quavers, in triplets, in semiquavers.
       * The triplets come out a note short of a whole beat, so the page dips
       * to the note under the tonic to fill it.
       */
      placed = place(
        (right) => right + 24 <= range.high && right - 12 + offsets[6]! - 12 >= range.low,
      )
      const anchorOf = (hand: Hand) => (hand === 'right' ? placed : placed - 12)
      const two = hands.map((hand) => run(hand, anchorOf(hand), 2))
      const one = new Map(hands.map((hand) => [hand, run(hand, anchorOf(hand), 1)]))
      /**
       * The tonic and the note under it as they are fingered in mid-scale,
       * where the hand is passing through rather than starting: the page puts
       * the left hand's thumb on the tonic there, not its 5th finger.
       */
      const passing = (voice: ReturnType<typeof run>) => voice.fingering.cycle?.[0]
      const below = (voice: ReturnType<typeof run>) => {
        const cycle = voice.fingering.cycle
        // The right hand's 2nd finger reaches over a thumb for the one note,
        // as printed; a hand whose tonic is not on the thumb just carries on
        // down its scale.
        if (voice.hand === 'right' && cycle?.[0] === 1) return 2
        return cycle?.[6] ?? 2
      }
      const upAndBack = [...up(0, 14), ...down(13, 1)]

      const quarters: Moment[] = [...up(0, 7), ...down(6, 1)].map((index, at) => ({
        ...Object.fromEntries(hands.map((hand) => [hand, [one.get(hand)!.at(index)]])),
        beats: 1,
        ...(at === 0 ? { cue: 'Quarters' } : {}),
      }))
      const eighths = together(
        two,
        upAndBack.map((index, at) => ({
          index,
          beats: 1 / 2,
          ...(at === 0 ? { cue: 'Eighths' } : {}),
        })),
      )
      const triplets = together(two, [
        ...upAndBack.map((index, at) => ({
          index,
          beats: 1 / 3,
          ...(at === 0 ? { cue: 'Triplets' } : {}),
        })),
        { index: 0, beats: 1 / 3, finger: passing },
        { index: -1, beats: 1 / 3, finger: below },
      ])
      const sixteenths = together(two, [
        ...upAndBack.map((index, at) => ({
          index,
          beats: 1 / 4,
          ...(at === 0 ? { cue: 'Sixteenths', finger: passing } : {}),
        })),
        { index: 0, beats: 1 },
      ])
      moments = [...quarters, ...eighths, ...triplets, ...sixteenths]
      meter = { beats: 2, beatType: 4 }
      fingerings = two.map(summary)
      detail = '1 octave, then 2'
      break
    }

    case 'grand-form': {
      /*
       * p. 84. Eight legs and a last note, the hands an octave apart: up
       * together, apart, back together; up together, down together; apart,
       * back together; down together, home.
       *
       * As printed each leg is two octaves, which takes five octaves of
       * keyboard from the tonic — the whole of a 61-key instrument, and only
       * from C. Where the keyboard is not that long from this key's tonic, a
       * leg is one octave: the same routine in three.
       */
      const fitsWith = (octaves: number) => (left: number) =>
        left >= range.low && left + 12 + 24 * octaves <= range.high
      const candidates = [24, 36, 48, 60].map((c) => c + tonic.pitchClass)
      const legOctaves = candidates.some(fitsWith(2)) ? 2 : 1
      // As low as the page starts where two octaves fit; the scale's own
      // register otherwise.
      const left = place(fitsWith(legOctaves), legOctaves === 2 ? 36 : PREFERRED_RIGHT - 12)
      placed = left + 12
      const voices = {
        left: run('left', left, 2 * legOctaves),
        right: run('right', left + 12, 2 * legOctaves),
      }
      const leg = 7 * legOctaves
      /** Where each hand is, in legs from its own bottom note, at the end of each leg. */
      const route: Record<Hand, readonly number[]> = {
        right: [0, 1, 2, 1, 2, 1, 2, 1, 0],
        left: [0, 1, 0, 1, 2, 1, 0, 1, 0],
      }
      const legCues = [
        'Similar motion, up',
        'Contrary motion, apart',
        'Contrary motion, together',
        'Similar motion, up',
        'Similar motion, down',
        'Contrary motion, apart',
        'Contrary motion, together',
        'Similar motion, down',
      ]
      /** An octave is two beats: a quaver, two semiquavers, then four more. */
      const rhythm = [1 / 2, 1 / 4, 1 / 4, 1 / 4, 1 / 4, 1 / 4, 1 / 4]
      const indexAt = (hand: Hand, legIndex: number, note: number) => {
        const from = route[hand][legIndex]! * leg
        const to = route[hand][legIndex + 1]! * leg
        return from + Math.sign(to - from) * note
      }
      moments = legCues.flatMap((cue, legIndex) =>
        Array.from({ length: leg }, (_, note) => ({
          left: [voices.left.at(indexAt('left', legIndex, note))],
          right: [voices.right.at(indexAt('right', legIndex, note))],
          beats: rhythm[note % 7]!,
          ...(note === 0 ? { cue } : {}),
        })),
      )
      moments.push({ left: [voices.left.at(0)], right: [voices.right.at(0)], beats: 4 })
      meter = { beats: 4, beatType: 4 }
      fingerings = [summary(voices.left), summary(voices.right)]
      detail = `${legOctaves} ${legOctaves === 1 ? 'octave' : 'octaves'} a leg`
      break
    }

    case 'harmonized-bass':
    case 'harmonized-treble': {
      /*
       * p. 80. The scale up two octaves and back in bars of three — three
       * crotchets, then a note held for the bar — with one chord under (or
       * over) each bar, held through it.
       */
      const inBass = spec.routine === 'harmonized-bass'
      // Chords in the bass: the left hand's chord sits an octave under the
      // tune. Chords in the treble: the tune runs up to the chord from two
      // octaves below it.
      const chordAnchor = inBass
        ? place(
            (left) => left - 1 + offsets[6]! - 12 >= range.low && left + 36 <= range.high,
            PREFERRED_RIGHT - 12,
          )
        : place((right) => right - 24 >= range.low && right + 9 <= range.high)
      const chordHand: Hand = inBass ? 'left' : 'right'
      const tuneHand: Hand = inBass ? 'right' : 'left'
      const tune = run(tuneHand, inBass ? chordAnchor + 12 : chordAnchor - 24, 2)
      placed = chordAnchor
      const { triads } = keyTriads(spec.rootPitchClass, mode, spec.tonic)
      const symbolOf = (chord: CadenceChord) =>
        chord === 'V7'
          ? `${triads[4]!.symbol}7`
          : triads[chord === 'I' ? 0 : chord === 'IV' ? 3 : 4]!.symbol
      const numeralOf = (chord: CadenceChord) =>
        mode === 'minor' && (chord === 'I' || chord === 'IV') ? chord.toLowerCase() : chord
      const chordNotes = (chord: CadenceChord): Played[] => {
        const fingers = cadenceFingers({
          pitchClass: tonic.pitchClass,
          mode,
          hand: chordHand,
          position: 0,
          chord,
        })
        return CADENCE_VOICINGS[0]![chord].map((degree, part) => ({
          note: keyAt(chordAnchor, degree),
          name: nameAt(degree),
          finger: fingers[part]!,
        }))
      }
      /** Each bar: the tune's notes, as places in its two-octave run, and the chord. */
      const bars: readonly (readonly [readonly number[], CadenceChord])[] = [
        [[0, 1, 2], 'I'],
        [[3], 'IV'],
        [[4, 5, 6], 'V'],
        [[7, 8, 9], 'I'],
        [[10], 'IV'],
        [[11, 12, 13], 'V7'],
        [[14], 'I'],
        [[14, 13, 12], 'I'],
        [[11], 'V'],
        [[10, 9, 8], 'V'],
        [[7, 6, 5], 'I'],
        [[4], 'V'],
        [[3, 2, 1], 'V7'],
        [[0], 'I'],
      ]
      moments = bars.flatMap(([notes, chord]) =>
        notes.map((index, at): Moment => {
          const beats = notes.length === 1 ? 3 : 1
          const melody = [tune.at(index)]
          if (at > 0) return { [tuneHand]: melody, beats }
          return {
            [tuneHand]: melody,
            [chordHand]: chordNotes(chord),
            beats,
            holds: { [chordHand]: 3 },
            label: melody[0]!.name,
            degree: numeralOf(chord),
            cue: `${symbolOf(chord)} chord`,
          }
        }),
      )
      meter = { beats: 3, beatType: 4 }
      const chordFingers = (['I', 'IV', 'V', 'V7'] as const).flatMap((chord) =>
        chordNotes(chord).map((played) => played.finger),
      )
      const chordSummary: ExerciseFingering = {
        hand: chordHand,
        fingers: chordFingers,
        source: 'alfred',
        perStep: 3,
      }
      fingerings = inBass ? [chordSummary, summary(tune)] : [summary(tune), chordSummary]
      subtitleHands = inBass ? 'Chords in the Bass' : 'Chords in the Treble'
      detail = `${numeralOf('I')}, ${numeralOf('IV')}, V and V7`
      break
    }
  }

  const steps = stepsFrom(moments)
  const titles: Record<Exclude<Routine, 'triad-chain'>, string> = {
    blocked: `${keyName} Blocked Scale`,
    'expanding-1': `${keyName} Expanding Scale No. 1`,
    'expanding-2': `${keyName} Expanding Scale No. 2`,
    accelerating: `${keyName} Accelerating Scale`,
    'grand-form': `${keyName} Grand Form`,
    'harmonized-bass': `${keyName} Scale, Harmonized`,
    'harmonized-treble': `${keyName} Scale, Harmonized`,
  }

  return {
    id: `exercise:${spec.routine}:${tonic.name}:${mode}:${hands.join('+')}:${detail}:${placed}`,
    kind: 'exercise',
    title: titles[spec.routine],
    subtitle: [subtitleHands, detail].join(' · '),
    steps,
    pitchClasses: scale.notes.map((note) => note.pitchClass),
    rootPitchClass: tonic.pitchClass,
    pitchNames: Object.fromEntries(scale.notes.map((note) => [note.pitchClass, note.name])),
    notes: steps.flatMap((step) => step.notes),
    keyFifths: keySignatureOf(scale),
    facts: [
      { label: 'Routine', value: ROUTINE_LABELS[spec.routine] },
      { label: 'Key', value: mode === 'minor' ? `${keyName} (harmonic)` : keyName },
      { label: 'Notes', value: scale.notes.map((note) => note.name).join(' ') },
      { label: 'Written', value: `${meter.beats}/${meter.beatType}` },
    ],
    fingerings,
    defaultBpm: 72,
    meter,
  }
}

/* ===========================================================================
   THE TRIAD CHAIN
   ======================================================================== */

type ChainQuality = 'Major' | 'Minor' | 'Diminished' | 'Augmented'

/** The seven links, in order: each differs from the last by one note, a half step. */
const CHAIN: readonly ChainQuality[] = [
  'Major',
  'Minor',
  'Diminished',
  'Minor',
  'Major',
  'Augmented',
  'Major',
]

/** The third and the fifth of each triad, in half steps above the root. */
const CHAIN_INTERVALS: Record<ChainQuality, readonly [number, number]> = {
  Major: [4, 7],
  Minor: [3, 7],
  Diminished: [3, 6],
  Augmented: [4, 8],
}
const CHAIN_SUFFIX: Record<ChainQuality, string> = {
  Major: '',
  Minor: 'm',
  Diminished: '°',
  Augmented: '+',
}

/**
 * p. 86. Seven triads on one root — major, minor, diminished, minor, major,
 * augmented, major — each broken by the left hand and answered by the right,
 * then all seven struck as chords in both.
 *
 * Built on a note rather than in a key. The third and the fifth keep their
 * letters whatever is done to them, which is the point of the exercise on
 * paper: C to E♭ to G♭, never C to D♯ to F♯.
 */
function buildTriadChain(spec: RoutineSpec, range: NoteRange): Exercise {
  const major = findScaleType('major') ?? SCALE_TYPES[0]!
  const key = spellScale(spec.rootPitchClass, major, spec.tonic)
  const root = key.root
  const tone = (letters: number, semitones: number): Pitch => {
    const letter = root.letter + letters
    const pitchClass = normalisePitchClass(root.pitchClass + semitones)
    // Every third and fifth of these four triads is within a double sharp or
    // flat of its letter, from any root a major key is written on.
    return makePitch(letter, accidentalFor(letter, pitchClass) ?? 0)
  }
  const tonesOf = (quality: ChainQuality): readonly Pitch[] => {
    const [third, fifth] = CHAIN_INTERVALS[quality]
    return [root, tone(2, third), tone(4, fifth)]
  }

  // The right hand's root in the register the key's chords sit in; the left an octave below.
  const candidates = [36, 48, 60, 72].map((c) => c + root.pitchClass)
  const fitting = candidates.filter((note) => note - 12 >= range.low && note + 8 <= range.high)
  const right = (fitting.length > 0 ? fitting : candidates).reduce((best, note) =>
    Math.abs(note - PREFERRED_RIGHT) < Math.abs(best - PREFERRED_RIGHT) ? note : best,
  )
  const anchors: Record<Hand, number> = { right, left: right - 12 }
  const FINGERS: Record<Hand, readonly number[]> = { left: [5, 3, 1], right: [1, 3, 5] }

  const shape = (hand: Hand, quality: ChainQuality): Played[] => {
    const [third, fifth] = CHAIN_INTERVALS[quality]
    return tonesOf(quality).map((pitch, part) => ({
      note: anchors[hand] + [0, third, fifth][part]!,
      name: pitch.name,
      finger: FINGERS[hand][part]!,
    }))
  }
  const symbol = (quality: ChainQuality) => `${root.name}${CHAIN_SUFFIX[quality]}`

  const broken: Moment[] = CHAIN.flatMap((quality) =>
    (['left', 'right'] as const).flatMap((hand) =>
      shape(hand, quality).map((played, part): Moment => ({
        [hand]: [played],
        beats: 1,
        ...(part === 0 && hand === 'left' ? { cue: `${quality} · ${symbol(quality)}` } : {}),
      })),
    ),
  )
  const block: Moment[] = CHAIN.map((quality) => ({
    left: shape('left', quality),
    right: shape('right', quality),
    beats: 3,
    label: symbol(quality),
    cue: quality,
  }))
  const steps = stepsFrom([...broken, ...block])

  /** The six notes the chain uses, each under its one name. */
  const pitches = new Map<number, string>()
  for (const quality of CHAIN)
    for (const pitch of tonesOf(quality)) pitches.set(pitch.pitchClass, pitch.name)

  return {
    id: `exercise:triad-chain:${root.name}:${right}`,
    kind: 'exercise',
    title: `Triad Chain on ${root.name}`,
    subtitle: 'Both Hands · Broken, then Block',
    steps,
    pitchClasses: [...pitches.keys()],
    rootPitchClass: root.pitchClass,
    pitchNames: Object.fromEntries(pitches),
    notes: steps.flatMap((step) => step.notes),
    keyFifths: keySignatureOf(key),
    facts: [
      { label: 'Routine', value: ROUTINE_LABELS['triad-chain'] },
      { label: 'Root', value: root.name },
      { label: 'Chain', value: CHAIN.map(symbol).join('  ') },
      { label: 'Written', value: '3/4' },
    ],
    fingerings: (['left', 'right'] as const).map((hand) => ({
      hand,
      fingers: FINGERS[hand],
      source: 'alfred',
      perStep: 3,
    })),
    defaultBpm: 72,
    meter: { beats: 3, beatType: 4 },
  }
}
