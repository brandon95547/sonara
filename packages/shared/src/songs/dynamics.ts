/**
 * Dynamics as a velocity, so a marked score plays with its own shape.
 *
 * One reading for every importer. A score says three different kinds of thing
 * about loudness, and they are not the same kind of instruction:
 *
 *  - a level — `p`, `mf`, `ff` — which holds until the next one;
 *  - an accent — `sf`, `fz`, `fp` — which is about the one note it stands
 *    under, and leaves the level as it was (or, for `fp`, drops it);
 *  - a swell — a hairpin, or the word cresc. or dim. — which is the level
 *    moving, from where it is to where the next marking puts it.
 *
 * They used to be read as one: every marking was a level. So a single
 * sforzando left the whole passage after it loud, a marking the table did not
 * know reset the piece to mezzo-forte, and a crescendo was a jump at its far
 * end. And a marking was read where it fell in the file rather than when it
 * fell in the music, so the hand written second in a bar heard it early, and a
 * piano written as one part a hand heard it in one hand only.
 *
 * The level values are the ones MuseScore's own playback uses, which is as
 * near a standard as there is.
 */
const LEVELS: Record<string, number> = {
  pppp: 10,
  ppp: 16,
  pp: 33,
  p: 49,
  mp: 64,
  mf: 80,
  f: 96,
  ff: 112,
  fff: 126,
  ffff: 127,
}

/** Mezzo-forte for a score that never says. */
export const DEFAULT_VELOCITY = 80

/** One level to the next: `p` to `mp`, `mf` to `f`. */
const STEP = 16
/** How far an accent lifts its note above the level it is in. */
const ACCENT = 2 * STEP
const STRONG_ACCENT = 3 * STEP

const clamp = (velocity: number) => Math.min(127, Math.max(1, Math.round(velocity)))

/** A level marking's velocity; mezzo-forte for anything that is not one. */
export function velocityForDynamic(dynamic: string | undefined): number {
  if (!dynamic) return DEFAULT_VELOCITY
  return LEVELS[dynamic.trim().toLowerCase()] ?? DEFAULT_VELOCITY
}

/** What a marking asks for. */
export type DynamicMeaning =
  | { readonly kind: 'level'; readonly velocity: number }
  | {
      readonly kind: 'accent'
      /** How far above the level in force the note is struck… */
      readonly boost: number
      /** …or the velocity it is struck at whatever the level: the f of `fp`. */
      readonly strike?: number
      /** The level left behind: the p of `fp`. */
      readonly then?: number
    }

/**
 * Reads a marking: `mf`, `sfz`, `fp`.
 *
 * Null for anything that is neither a level nor an accent — "dolce", "simile",
 * a marking from an edition's own vocabulary. Such a thing changes nothing: it
 * is not a reason to play mezzo-forte.
 */
export function readDynamic(marking: string | undefined): DynamicMeaning | null {
  const name = marking?.trim().toLowerCase().replace(/\./g, '')
  if (!name) return null
  const level = LEVELS[name]
  if (level !== undefined) return { kind: 'level', velocity: level }

  // Forte, then at once soft: fp, sfp, sfpp, fpp.
  const drop = /^(s?f+z?)(p+)$/.exec(name)
  if (drop) {
    const then = LEVELS[drop[2]!] ?? LEVELS.p!
    return drop[1] === 'f'
      ? { kind: 'accent', boost: ACCENT, strike: LEVELS.f!, then }
      : { kind: 'accent', boost: ACCENT, then }
  }
  if (/^sf{2,}z?$/.test(name)) return { kind: 'accent', boost: STRONG_ACCENT }
  if (/^(sfz?|fz|rfz?|sfzp?)$/.test(name)) return { kind: 'accent', boost: ACCENT }
  return null
}

/**
 * Where on the page a marking stands: a staff of the piano, or the part that
 * is one of its hands. Absent, it is for everything.
 */
export type DynamicLine = string | number

export type DynamicEvent =
  | {
      readonly kind: 'level'
      readonly atQ: number
      readonly velocity: number
      /** The marking's name, kept for the note it governs. */
      readonly marking?: string
      readonly line?: DynamicLine
    }
  | {
      readonly kind: 'accent'
      readonly atQ: number
      readonly boost: number
      readonly strike?: number
      readonly line?: DynamicLine
    }
  | {
      readonly kind: 'swell'
      readonly fromQ: number
      /** Where a hairpin closes. A word — cresc. — does not say, and has none. */
      readonly toQ?: number
      readonly direction: 'louder' | 'softer'
      readonly line?: DynamicLine
    }

/** The events a marking stands for, at a moment in the score. */
export function dynamicEvents(
  marking: string | undefined,
  atQ: number,
  line?: DynamicLine,
): DynamicEvent[] {
  const meaning = readDynamic(marking)
  if (!meaning) return []
  const on = line === undefined ? {} : { line }
  if (meaning.kind === 'level') {
    const name = marking!.trim().toLowerCase()
    return [{ kind: 'level', atQ, velocity: meaning.velocity, marking: name, ...on }]
  }
  const accent: DynamicEvent = {
    kind: 'accent',
    atQ,
    boost: meaning.boost,
    ...(meaning.strike === undefined ? {} : { strike: meaning.strike }),
    ...on,
  }
  if (meaning.then === undefined) return [accent]
  const name = Object.keys(LEVELS).find((key) => LEVELS[key] === meaning.then)
  return [
    accent,
    { kind: 'level', atQ, velocity: meaning.then, ...(name ? { marking: name } : {}), ...on },
  ]
}

/** cresc., dim. and their relatives, written as a word rather than drawn. */
export function swellOfWords(words: string | undefined): 'louder' | 'softer' | null {
  const text = words?.trim().toLowerCase() ?? ''
  if (/^(poco a poco |sempre |molto |più )?cresc/.test(text)) return 'louder'
  if (/^(poco a poco |sempre |molto |più )?(dim|decresc|smorz|calando|morendo|perdendo)/.test(text))
    return 'softer'
  return null
}

/** Two markings this close are one moment: a hand's own level, an accent's note. */
const TOGETHER_Q = 1 / 64
/** A staff's own marking within this of another staff's makes that one not its. */
const OWN_Q = 1
/** A hairpin lands on a marking written this soon after it closes. */
const LANDING_Q = 1
/** How far ahead a written "cresc." looks for the level it is going to. */
const WORD_REACH_Q = 32
/** How long it takes, when nothing ahead says where it is going. */
const WORD_LENGTH_Q = 4
/** An accent belongs to the first notes struck this soon after it. */
const ACCENT_REACH_Q = 0.26

/** A level, from the moment it is marked. */
interface Step {
  readonly q: number
  readonly velocity: number
  readonly marking?: string
}

/** The level on its way from one value to another. */
interface Ramp {
  readonly fromQ: number
  readonly toQ: number
  readonly fromV: number
  readonly toV: number
}

/** The level through the piece, for one line of it. */
interface Course {
  /** In order of time. */
  readonly steps: Step[]
  /** In the order they begin. */
  readonly ramps: Ramp[]
}

function valueAt({ steps, ramps }: Course, q: number): number {
  let step: Step | undefined
  for (const candidate of steps) {
    if (candidate.q > q + TOGETHER_Q) break
    step = candidate
  }
  let ramp: Ramp | undefined
  for (const candidate of ramps) {
    if (candidate.fromQ > q + TOGETHER_Q) break
    ramp = candidate
  }
  // A swell under way, unless a marking has come since it began: that marking
  // is the level now. Past its end it is over, and the level is what it was —
  // or what the swell arrived at, which is a step of its own (see below).
  if (
    ramp &&
    q <= ramp.toQ + TOGETHER_Q &&
    (!step || step.q <= ramp.fromQ + TOGETHER_Q) &&
    ramp.toQ > ramp.fromQ
  ) {
    const along = Math.min(1, Math.max(0, (q - ramp.fromQ) / (ramp.toQ - ramp.fromQ)))
    return ramp.fromV + (ramp.toV - ramp.fromV) * along
  }
  return step?.velocity ?? DEFAULT_VELOCITY
}

/**
 * The level through the piece, for one line of it.
 *
 * A marking written on one staff is the piano's unless the other staff has a
 * marking of its own at that moment — the usual case is one marking between
 * the staves, which the file hangs on the upper one.
 *
 * A swell that arrives somewhere stays there: a hairpin that closes on a
 * marking, a written "cresc." that the score follows with a louder one. A
 * hairpin that closes on nothing is a shape within the phrase — it rises or
 * falls a level and the next phrase begins where this one did. Left where they
 * ended, a page of such hairpins walks the level off the end of the scale: a
 * waltz with seventy-six of them and six markings ended up silent.
 */
function courseFor(events: readonly DynamicEvent[], line: DynamicLine | undefined): Course {
  const levels = events.filter(
    (event): event is Extract<DynamicEvent, { kind: 'level' }> => event.kind === 'level',
  )
  const mine = levels
    .filter(
      (level) =>
        line === undefined ||
        level.line === undefined ||
        level.line === line ||
        !levels.some((own) => own.line === line && Math.abs(own.atQ - level.atQ) <= OWN_Q),
    )
    .sort((a, b) => a.atQ - b.atQ)

  const swells = events
    .filter((event): event is Extract<DynamicEvent, { kind: 'swell' }> => event.kind === 'swell')
    .sort((a, b) => a.fromQ - b.fromQ)

  // In time order, a level before a swell that begins with it.
  const order = [
    ...mine.map((level) => ({ at: level.atQ, rank: 0, level, swell: undefined })),
    ...swells.map((swell) => ({ at: swell.fromQ, rank: 1, level: undefined, swell })),
  ].sort((a, b) => a.at - b.at || a.rank - b.rank)

  const course: Course = { steps: [], ramps: [] }
  const step = (entry: Step) => {
    course.steps.push(entry)
    course.steps.sort((a, b) => a.q - b.q)
  }

  for (const { level, swell } of order) {
    if (level) {
      step({
        q: level.atQ,
        velocity: level.velocity,
        ...(level.marking ? { marking: level.marking } : {}),
      })
      continue
    }
    const fromV = valueAt(course, swell.fromQ)
    const louder = swell.direction === 'louder'
    const going = (velocity: number) => (louder ? velocity > fromV : velocity < fromV)

    // Where it is going: the marking it closes on, if that is the way it was
    // heading. A crescendo into a sudden piano still rises, and then drops.
    let toQ = swell.toQ
    let landing: (typeof mine)[number] | undefined
    if (toQ !== undefined) {
      const closes = toQ
      landing = mine.find(
        (next) => next.atQ >= closes - TOGETHER_Q && next.atQ <= closes + LANDING_Q,
      )
    } else {
      landing = mine.find(
        (next) => next.atQ > swell.fromQ + TOGETHER_Q && next.atQ <= swell.fromQ + WORD_REACH_Q,
      )
      toQ = landing && going(landing.velocity) ? landing.atQ : swell.fromQ + WORD_LENGTH_Q
    }
    if (toQ <= swell.fromQ) continue
    const arrives = landing !== undefined && going(landing.velocity)
    const toV = arrives
      ? landing!.velocity
      : Math.max(LEVELS.ppp!, clamp(fromV + (louder ? STEP : -STEP)))
    course.ramps.push({ fromQ: swell.fromQ, toQ, fromV, toV })
    // Arrived, or told in words to keep going that way: the level it reached
    // is the level, until the next marking.
    if (arrives || swell.toQ === undefined) step({ q: toQ, velocity: toV })
  }
  return course
}

/** The marking in force at a moment: the last level named at or before it. */
function markingAt({ steps }: Course, q: number): string | undefined {
  let name: string | undefined
  for (const step of steps) {
    if (step.q > q + TOGETHER_Q) break
    if (step.marking) name = step.marking
  }
  return name
}

/**
 * How hard each note is struck, from everything the score says about loudness.
 *
 * By time, not by where a marking fell in the file: a note's level is the one
 * in force at the moment it is struck, on the line it is written on.
 */
export function applyDynamics(
  notes: readonly { readonly startQ: number; readonly line?: DynamicLine }[],
  events: readonly DynamicEvent[],
): { velocity: number; dynamic?: string }[] {
  const lines = new Map<DynamicLine | undefined, Course>()
  const courseOf = (line: DynamicLine | undefined) => {
    let known = lines.get(line)
    if (!known) lines.set(line, (known = courseFor(events, line)))
    return known
  }

  const struck = notes.map((note) => {
    const course = courseOf(note.line)
    const dynamic = markingAt(course, note.startQ)
    return { velocity: valueAt(course, note.startQ), ...(dynamic ? { dynamic } : {}) }
  })

  // An accent is for the notes struck with it: the first to begin at or just
  // after it, in either hand — a sforzando under a chord is the whole chord's.
  for (const accent of events) {
    if (accent.kind !== 'accent') continue
    let onset = Infinity
    for (const note of notes) {
      if (note.startQ < accent.atQ - TOGETHER_Q || note.startQ > accent.atQ + ACCENT_REACH_Q)
        continue
      onset = Math.min(onset, note.startQ)
    }
    if (onset === Infinity) continue
    notes.forEach((note, index) => {
      if (Math.abs(note.startQ - onset) > TOGETHER_Q) return
      const entry = struck[index]!
      // The level the accent stands in is the one before any drop it brings.
      const before = valueAt(courseOf(note.line), accent.atQ - 2 * TOGETHER_Q)
      entry.velocity = Math.max(entry.velocity, accent.strike ?? before + accent.boost)
    })
  }

  return struck.map((entry) => ({ ...entry, velocity: clamp(entry.velocity) }))
}

/**
 * The velocity a song's note is sounded at.
 *
 * A written dynamic is a velocity, and an instrument turns velocity into
 * loudness by its square — so pianissimo comes out more than twenty decibels
 * under fortissimo, measured: four times quieter. On a concert grand in a hall
 * that is the music. Through a laptop it is a passage that cannot be heard
 * followed by one that is too loud.
 *
 * So a song is played with half that range, in decibels, around mezzo-forte:
 * each note at the geometric mean of its own velocity and mezzo-forte's.
 * Pianissimo to fortissimo is then ten decibels — still plainly soft and
 * plainly loud — a piece that says nothing plays exactly as it did, and the
 * order of every marking is kept.
 *
 * Only for a score being played back. A key pressed by hand sounds as hard as
 * it was pressed.
 */
export function playbackVelocity(velocity: number): number {
  return clamp(Math.sqrt(DEFAULT_VELOCITY * Math.max(1, velocity)))
}
