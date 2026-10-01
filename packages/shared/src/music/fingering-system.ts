import type { Hand } from './fingering.js'
import { TRADITIONAL } from './fingering-traditional.js'

/**
 * Fingering systems.
 *
 * A fingering is an opinion about a passage, not a property of it. The same
 * A♭ major scale is the same eight notes whoever teaches it, and one school
 * opens it on the 2nd finger where another opens it on the 3rd. So the notes
 * live in `scales.ts` and know nothing about fingers, and a *system* is asked,
 * separately, which fingers it puts on them.
 *
 * Adding a system is a new file that implements `FingeringSystem` and one line
 * in the table below. Nothing about a scale, a key or an exercise changes.
 */

export const FINGERING_SYSTEM_IDS = ['traditional'] as const
export type FingeringSystemId = (typeof FINGERING_SYSTEM_IDS)[number]

export const DEFAULT_FINGERING_SYSTEM: FingeringSystemId = 'traditional'

/** What a system is asked: a run of a scale, in a key, in one hand. */
export interface ScaleFingeringQuery {
  /**
   * The tonic as the key is spelled — `D♯`, not pitch class 3.
   *
   * D♯ minor and E♭ minor are played on the same keys and are different keys:
   * a source prints one of them, with that key's spelling, and a system that
   * indexed its pages by pitch class would be claiming a page it does not have.
   */
  readonly tonic: string
  readonly scaleTypeId: string
  readonly hand: Hand
  readonly octaves: number
  /** The run ascending, bottom note to top, for a system that fingers by rule. */
  readonly notes: readonly number[]
}

export interface SystemScaleFingering {
  /** One finger per note of the ascending run, bottom to top. */
  readonly fingers: readonly number[]
  /**
   * One finger per scale degree, tonic first: what each note takes in the
   * middle of a run, clear of how the run happens to open or turn. Absent for
   * a fingering that is a rule rather than a repeating shape.
   */
  readonly cycle?: readonly number[]
}

export interface FingeringSystem {
  readonly id: FingeringSystemId
  /** `Traditional / Orthodox` — as the setting lists it. */
  readonly name: string
  /** `Traditional` — for a chip beside a row of finger numbers. */
  readonly shortName: string
  readonly description: string
  /** The source it is transcribed from. */
  readonly reference: string
  /** The fingers for a scale run, or null where the system does not supply any. */
  scale(query: ScaleFingeringQuery): SystemScaleFingering | null
}

export const FINGERING_SYSTEMS: Readonly<Record<FingeringSystemId, FingeringSystem>> = {
  traditional: TRADITIONAL,
}

export function isFingeringSystemId(value: unknown): value is FingeringSystemId {
  return typeof value === 'string' && (FINGERING_SYSTEM_IDS as readonly string[]).includes(value)
}

/** The system by id, or the default for anything unrecognised. */
export function fingeringSystem(id?: string | null): FingeringSystem {
  return FINGERING_SYSTEMS[isFingeringSystemId(id) ? id : DEFAULT_FINGERING_SYSTEM]
}
