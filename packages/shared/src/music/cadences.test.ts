import { describe, expect, it } from 'vitest'
import { fingerSteps } from './finger-steps.js'
import cadences from './fixtures/cadences.json'

interface Chord {
  readonly chord: string
  readonly rh?: number[][]
  readonly lh?: number[][]
}
interface Progression {
  readonly key: string
  readonly position: number
  readonly chords: Chord[]
}

/**
 * The one piece of ground truth there is for fingering chords in a sequence.
 *
 * Thirty-four chords from the cadence pages of The Complete Book of Scales,
 * Chords, Arpeggios & Cadences — three keys, three positions each, both hands,
 * read from the rendered pages and verified. They are the only place the source
 * shows fingering *in context* rather than for an isolated shape, and the only
 * way to tell whether the search is doing what a musician would.
 *
 * They also set the ceiling. The source fingers the same left-hand grip three
 * different ways across its three positions, teaching three hand positions of
 * one progression, and no amount of modelling recovers a choice that was made
 * for pedagogical reasons. What is checked here is that the engine tracks the
 * source closely and does not regress; matching it everywhere is not the goal
 * and would mean having overfitted to one progression.
 */
describe('the cadences the source prints', () => {
  const compare = () => {
    let matched = 0
    let total = 0
    const misses: string[] = []
    for (const prog of cadences as Progression[]) {
      for (const hand of ['rh', 'lh'] as const) {
        const chords = prog.chords.filter((chord) => chord[hand])
        if (chords.length === 0) continue
        const steps = chords.map((chord) =>
          chord[hand]!.map((note) => note[0]!).sort((a, b) => a - b),
        )
        const want = chords.map((chord) =>
          [...chord[hand]!].sort((a, b) => a[0]! - b[0]!).map((note) => note[1]!),
        )
        const got = fingerSteps(steps, hand === 'rh' ? 'right' : 'left').map(
          (s) => s?.fingers ?? null,
        )
        for (const [i, expected] of want.entries()) {
          total++
          if (expected.join('') === (got[i]?.join('') ?? '')) matched++
          else misses.push(`${prog.key} p${prog.position} ${chords[i]!.chord} ${hand}`)
        }
      }
    }
    return { matched, total, misses }
  }

  it('fingers every chord in every cadence with something playable', () => {
    // Whatever it chooses, it has to choose *something*: a cadence is four
    // chords a beginner is asked to play, and a blank in the middle of one
    // would be a failure of the engine rather than an honest refusal.
    for (const prog of cadences as Progression[]) {
      for (const hand of ['rh', 'lh'] as const) {
        const chords = prog.chords.filter((chord) => chord[hand])
        if (chords.length === 0) continue
        const steps = chords.map((chord) =>
          chord[hand]!.map((note) => note[0]!).sort((a, b) => a - b),
        )
        for (const fingers of fingerSteps(steps, hand === 'rh' ? 'right' : 'left').map(
          (s) => s?.fingers ?? null,
        )) {
          expect(fingers, `${prog.key} p${prog.position} ${hand}`).not.toBeNull()
          expect(new Set(fingers!).size).toBe(fingers!.length)
        }
      }
    }
  })

  it('agrees with the printed fingering on most of them', () => {
    const { matched, total, misses } = compare()
    // A floor, not a target. It was 41 before the shape table and the
    // measurements around it; dropping back below that means something that
    // was right has been broken.
    expect(total).toBe(68)
    expect(matched, `missed: ${misses.join(', ')}`).toBeGreaterThanOrEqual(44)
  })

  it('gets the right hand almost exactly', () => {
    // The right hand is where the source is consistent enough to be tabled: of
    // the shapes it prints, only the dominant in second and third position is
    // fingered two ways, and that varies by key rather than by position.
    let matched = 0
    let total = 0
    for (const prog of cadences as Progression[]) {
      const chords = prog.chords.filter((chord) => chord.rh)
      if (chords.length === 0) continue
      const steps = chords.map((chord) => chord.rh!.map((note) => note[0]!).sort((a, b) => a - b))
      const got = fingerSteps(steps, 'right').map((s) => s?.fingers ?? null)
      chords.forEach((chord, i) => {
        total++
        const want = [...chord.rh!].sort((a, b) => a[0]! - b[0]!).map((note) => note[1]!)
        if (want.join('') === (got[i]?.join('') ?? '')) matched++
      })
    }
    expect(matched / total).toBeGreaterThan(0.7)
  })
})
