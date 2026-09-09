/**
 * Bars, beats and the pulse a metronome should give.
 *
 * A piece is not one bar length repeated. It has a pickup, or a change of
 * metre, or a ritardando, and every one of those moves every bar line after
 * it. Reading the bar number as `floor(time / oneBarLength)` — which is what
 * this replaced — put every bar line of a piece with a one-beat pickup two
 * beats late for the whole of the piece.
 *
 * So the bars are a list, built by whichever importer read the file, and
 * everything that needs a bar — the bar numbers on the page, the progress
 * bar, skipping forward a bar, the metronome — asks the list.
 */

export interface SongMeasure {
  /** Where the bar begins, in milliseconds from the start of the piece. */
  readonly startMs: number
  /** How long it lasts. A pickup bar is shorter than its signature says. */
  readonly durationMs: number
  /** Where it begins in crotchets from the start, for engraving. */
  readonly startQ: number
  /** Its length in crotchets. */
  readonly durationQ: number
  /** The signature in force, as written. */
  readonly beats: number
  readonly beatType: number
  /** Milliseconds per crotchet in this bar — the tempo. */
  readonly quarterMs: number
  /**
   * The number the page prints.
   *
   * A pickup bar is numbered 0, which is what MuseScore and every engraved
   * edition do: the first *full* bar is bar 1.
   */
  readonly number: number
}

/** Crotchets in one bar of a signature: a bar of 6/8 is three of them. */
export function quartersPerBar(beats: number, beatType: number): number {
  return beats > 0 && beatType > 0 ? (beats * 4) / beatType : 4
}

/**
 * The bars of a piece that has one tempo and one metre throughout.
 *
 * The fallback for songs stored before bars were read from the file, and for
 * a builder that was given nothing better. Every bar is full length.
 */
export function gridMeasures(input: {
  bpm: number
  beats: number
  beatType: number
  durationMs: number
}): SongMeasure[] {
  const quarterMs = 60000 / (input.bpm > 0 ? input.bpm : 100)
  const durationQ = quartersPerBar(input.beats, input.beatType)
  const durationMs = durationQ * quarterMs
  const count = Math.max(1, Math.ceil((input.durationMs > 0 ? input.durationMs : 1) / durationMs))
  return Array.from({ length: count }, (_, index) => ({
    startMs: index * durationMs,
    durationMs,
    startQ: index * durationQ,
    durationQ,
    beats: input.beats,
    beatType: input.beatType,
    quarterMs,
    number: index + 1,
  }))
}

/**
 * Numbers a list of bars the way a score does: a short opening bar is a
 * pickup and is bar 0, so the first full bar is bar 1.
 */
export function numberMeasures(measures: readonly Omit<SongMeasure, 'number'>[]): SongMeasure[] {
  const first = measures[0]
  const pickup =
    first !== undefined &&
    measures.length > 1 &&
    first.durationQ < quartersPerBar(first.beats, first.beatType) - 1e-6
  return measures.map((measure, index) => ({ ...measure, number: pickup ? index : index + 1 }))
}

/** The index of the bar a moment falls in. Before the first bar is the first bar. */
export function barIndexAt(measures: readonly SongMeasure[], ms: number): number {
  let found = 0
  for (const [index, measure] of measures.entries()) {
    if (measure.startMs <= ms + 1e-6) found = index
    else break
  }
  return found
}

/** The same question in crotchets, for the engraver. */
export function barIndexAtQ(measures: readonly SongMeasure[], quarters: number): number {
  let found = 0
  for (const [index, measure] of measures.entries()) {
    if (measure.startQ <= quarters + 1e-6) found = index
    else break
  }
  return found
}

export interface Pulse {
  /** Crotchets after the bar line. */
  readonly offsetQ: number
  /** The downbeat, and nothing else. */
  readonly strong: boolean
}

/**
 * Where a metronome clicks in one bar of a signature.
 *
 * Not one click per crotchet. A bar of 6/8 has two beats, each a dotted
 * crotchet, and a click on every quaver-pair lands between them; a bar of
 * 7/8 is not three and a half of anything. So the pulse is read from the
 * signature the way a conductor reads it:
 *
 *  - a crotchet, minim or semibreve denominator beats on every numerator
 *    count — 3/4 is three, 2/2 is two minims;
 *  - a quaver denominator whose numerator divides by three is compound and
 *    beats in dotted crotchets — 6/8 in two, 9/8 in three;
 *  - 6/4, 9/4 and 12/4 are the same thing in dotted minims;
 *  - anything else on a quaver denominator is additive and is grouped in
 *    twos with a three at the end, which is the common reading of 5/8 and
 *    7/8 and is at least a pulse that repeats every bar rather than drifting.
 */
export function metronomePulses(beats: number, beatType: number): Pulse[] {
  if (!(beats > 0) || !(beatType > 0)) return [{ offsetQ: 0, strong: true }]
  const unitQ = 4 / beatType

  const compound = beats % 3 === 0 && beats >= 6 && (beatType === 8 || beatType === 4)
  if (compound) {
    return Array.from({ length: beats / 3 }, (_, index) => ({
      offsetQ: index * 3 * unitQ,
      strong: index === 0,
    }))
  }

  if (beatType <= 4 || beats <= 2) {
    return Array.from({ length: beats }, (_, index) => ({
      offsetQ: index * unitQ,
      strong: index === 0,
    }))
  }

  // Additive: twos, then whatever is left as the final group. 5 → 2 + 3,
  // 7 → 2 + 2 + 3, 4 → 2 + 2. A bar that is one group on its own — 3/8 — is
  // clicked on every quaver instead, which is how it is counted when it is
  // slow enough to need a metronome at all.
  const groups: number[] = []
  let left = beats
  while (left > 3) {
    groups.push(2)
    left -= 2
  }
  groups.push(left)
  if (groups.length === 1) {
    return Array.from({ length: beats }, (_, index) => ({
      offsetQ: index * unitQ,
      strong: index === 0,
    }))
  }
  const pulses: Pulse[] = []
  let at = 0
  for (const [index, size] of groups.entries()) {
    pulses.push({ offsetQ: at * unitQ, strong: index === 0 })
    at += size
  }
  return pulses
}

/**
 * How a bar's quavers are beamed: the boundaries, in crotchets from the bar
 * line, that a beam may not cross.
 *
 * The same reading of the signature as the metronome, because they are the
 * same fact: a beam shows the beat, and the beat is what the click marks.
 * Simple time beams by the beat; compound time by the dotted crotchet; 4/4
 * additionally allows a beam across the half bar for quavers but not
 * semiquavers, which is more than this needs — one group per beat reads
 * correctly everywhere and is what a learner's edition prints.
 */
export function beamBoundaries(beats: number, beatType: number): number[] {
  const pulses = metronomePulses(beats, beatType)
  const boundaries = pulses.map((pulse) => pulse.offsetQ)
  // Simple time on a crotchet or minim: a beam group is one crotchet, so a
  // bar of 2/2 still breaks its quavers in fours rather than eights.
  if (beatType <= 2) {
    const total = quartersPerBar(beats, beatType)
    const out: number[] = []
    for (let at = 0; at < total; at += 2) out.push(at)
    return out
  }
  return boundaries
}
