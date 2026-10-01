import { MIDDLE_LINE, stemDirection, type Staff } from '@sonara/shared'
import { STEP, yOn } from './staff-frame'
import { placementOf, staffOf, STEM_STEPS, stemXFor } from './StaffNotes'
import type { Placed } from './score'

/**
 * Beams: the bars that join short notes into the beats they belong to.
 *
 * A quaver on its own carries a flag. Four of them in a row carrying four flags
 * is a line of washing, and it says nothing about where the beat falls — which
 * is the only reason short notes are grouped at all. A beam says it at a
 * glance: these belong together, and the next beat starts where the next beam
 * does.
 *
 * Which notes share a beam is decided when the score is measured (see
 * `measureScore`), because it is a fact about rhythm. What the beam looks like
 * is decided here, once the chords have been placed, because it is geometry:
 * a beam is a line between two stems, and where the stems are is not known
 * until the page is laid out.
 *
 * The rules are the engraver's, kept to the few that matter at this size:
 *
 * - **One direction for the group.** The note furthest from the middle line
 *   decides, exactly as it does for a chord, and every stem follows.
 * - **The beam follows the notes**, rising when they rise — but only so far.
 *   A beam as steep as a scale reads as a slash; past a staff space of rise it
 *   is flattened.
 * - **Stems reach the beam, never the other way round.** The beam is placed so
 *   that the note nearest it has a stem of the normal length, and every other
 *   stem is lengthened to meet it. None is ever shortened.
 */

/** How one chord's stem is drawn when a beam decides it. */
export interface StemOverride {
  readonly up: boolean
  /** Where the stem ends: on the beam's outer edge. */
  readonly end: number
}

/** The stems of one step that beams have decided, by staff. */
export type StepStems = Partial<Record<Staff, StemOverride>>

/** One beam, or one level of it, as a four-cornered shape. */
export interface BeamBar {
  readonly points: string
}

export interface BeamShape {
  readonly key: string
  /** The steps it joins, for deciding whether it is behind the player yet. */
  readonly indices: readonly number[]
  readonly bars: readonly BeamBar[]
  /** `3` over a triplet, where the group is one. */
  readonly tuplet?: { readonly x: number; readonly y: number; readonly text: string }
}

/** Half a staff space: the weight a beam is drawn at. */
const THICKNESS = STEP
/** From one beam of a group to the next: its thickness, and a quarter space of air. */
const PITCH = STEP * 1.6
/** The most a beam rises or falls from end to end. */
const MAX_RISE = STEP * 2
/** How long the stub of a lone short note is: about a notehead. */
const STUB = STEP * 2.4

interface Member {
  readonly index: number
  readonly x: number
  /** The step of the note nearest the beam. */
  readonly outer: number
  readonly steps: readonly number[]
  readonly flags: number
  readonly tuplet?: { readonly id: number; readonly actual: number }
}

export function beamsIn(placed: readonly Placed[]): {
  stems: Map<number, StepStems>
  beams: BeamShape[]
} {
  const stems = new Map<number, StepStems>()
  const beams: BeamShape[] = []

  for (const staff of ['treble', 'bass'] as const) {
    // Gather the groups on this staff. A group that runs over the end of a
    // line is two groups, one on each: a beam does not cross a system break.
    const groups = new Map<number, Placed[]>()
    for (const entry of placed) {
      const id = entry.beam?.[staff]
      if (id === undefined) continue
      const group = groups.get(id)
      if (group) group.push(entry)
      else groups.set(id, [entry])
    }

    for (const [id, entries] of groups) {
      if (entries.length < 2) continue
      const chords = entries.map((entry) => {
        const steps = entry.notes
          .filter((note) => staffOf(note) === staff)
          .map((note) => placementOf(note).steps)
          .sort((a, b) => a - b)
        return { entry, steps }
      })
      const up =
        stemDirection(
          chords.flatMap(({ steps }) => steps.map((step) => ({ staff, steps: step }))),
        ) === 'up'
      const middle = MIDDLE_LINE[staff]

      const members: Member[] = chords.map(({ entry, steps }) => ({
        index: entry.index,
        x: stemXFor(entry.x, up),
        outer: up ? steps.at(-1)! : steps[0]!,
        steps,
        flags: entry.value[staff].flags,
        tuplet: entry.tuplet?.[staff],
      }))

      /** Where each stem would end if its chord stood alone. */
      const tips = members.map(({ outer }) => {
        const reach = outer + (up ? STEM_STEPS : -STEM_STEPS)
        return yOn(up ? Math.max(reach, middle) : Math.min(reach, middle), staff)
      })

      const first = members[0]!
      const last = members.at(-1)!
      const run = last.x - first.x
      const rise = Math.max(-MAX_RISE, Math.min(MAX_RISE, tips.at(-1)! - tips[0]!))
      const slope = run > 0 ? rise / run : 0
      const along = (x: number) => tips[0]! + slope * (x - first.x)
      // Moved away from the notes until the stem nearest the beam is full
      // length. Up is towards smaller y.
      const slack = members.map((member, at) => tips[at]! - along(member.x))
      const shift = up ? Math.min(0, ...slack) : Math.max(0, ...slack)
      const edge = (x: number) => along(x) + shift

      for (const member of members) {
        stems.set(member.index, {
          ...stems.get(member.index),
          [staff]: { up, end: edge(member.x) },
        })
      }

      /** One bar of the beam, `level` beams in from the outer edge. */
      const bar = (from: number, to: number, level: number): BeamBar => {
        const inward = (up ? 1 : -1) * level * PITCH
        const thick = (up ? 1 : -1) * THICKNESS
        const a = edge(from) + inward
        const b = edge(to) + inward
        return {
          points: `${from},${a} ${to},${b} ${to},${b + thick} ${from},${a + thick}`,
        }
      }

      const bars: BeamBar[] = [bar(first.x, last.x, 0)]
      const levels = Math.max(...members.map((member) => member.flags))
      for (let level = 1; level < levels; level++) {
        let start: Member | null = null
        members.forEach((member, at) => {
          const has = member.flags > level
          const next = members[at + 1]
          if (has && start === null) start = member
          if (start !== null && (!has || !next || next.flags <= level)) {
            const end = has ? member : members[at - 1]!
            if (end.x > start.x) bars.push(bar(start.x, end.x, level))
            else {
              // A short note with no short neighbour: a stub, towards the
              // rest of its group.
              const towards = at === 0 || (has && next && !members[at - 1]) ? 1 : -1
              const tip = start.x + towards * STUB
              bars.push(bar(Math.min(start.x, tip), Math.max(start.x, tip), level))
            }
            start = null
          }
        })
      }

      // A beam that is exactly one tuplet says so with its number, on the
      // stem side, clear of the beam.
      const tuplet = first.tuplet
      const whole =
        tuplet !== undefined &&
        members.length === tuplet.actual &&
        members.every((member) => member.tuplet?.id === tuplet.id)
      const midX = (first.x + last.x) / 2

      beams.push({
        key: `${staff}-${id}-${first.index}`,
        indices: members.map((member) => member.index),
        bars,
        ...(whole
          ? {
              tuplet: {
                x: midX,
                y: edge(midX) + (up ? -STEP * 0.9 : STEP * 2.7),
                text: String(tuplet.actual),
              },
            }
          : {}),
      })
    }
  }

  return { stems, beams }
}
