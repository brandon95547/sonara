/**
 * Progressions: chords in sequence, and the kinds of sequence there are.
 *
 * Progressions is the area; what is practised in it is one of its types. Each
 * type has its own settings and its own builder, kept in a file of its own —
 * `cadence-exercise.ts` is the first — because a cadence and whatever comes
 * after it share a staff and a key and very little else. A cadence is set by
 * position and dominant; a twelve-bar blues would be set by neither.
 *
 * A new type is a name here, a spec and a builder beside the cadence's, and a
 * case wherever the web app switches on `ProgressionType`: the compiler finds
 * each one.
 */
export const PROGRESSION_TYPES = ['cadences'] as const
export type ProgressionType = (typeof PROGRESSION_TYPES)[number]

/** The type the area opens on. */
export const DEFAULT_PROGRESSION_TYPE: ProgressionType = PROGRESSION_TYPES[0]

export const PROGRESSION_TYPE_LABELS: Record<ProgressionType, string> = {
  cadences: 'Cadences',
}

/** What each type is, in a line — for the menu that chooses between them. */
export const PROGRESSION_TYPE_DESCRIPTIONS: Record<ProgressionType, string> = {
  cadences: 'The cadence of every key, in three positions: I – IV – I – V – I.',
}

/** The type a name is, if it is one: for reading it back out of an address. */
export const findProgressionType = (name: string | undefined): ProgressionType | null =>
  PROGRESSION_TYPES.find((type) => type === name) ?? null
