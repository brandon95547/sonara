import { describe, expect, it } from 'vitest'
import { buildSong, songSteps, type SongNote } from '@sonara/shared'
import { useSongStore } from '@/state/song-store'
import {
  barLinesIn,
  breakIntoSystems,
  headerEnd,
  measureScore,
  place,
  type Measured,
} from '@/features/staff/score'

/**
 * Where the lines break, and what breaking them is not allowed to change.
 *
 * Sheet View exists because Flow is the wrong way to sight-read: the page will
 * not hold still, and you cannot look ahead of a note that has not arrived. It
 * only earns that if the music on it is the same music — same chords, same
 * order, same fingering — laid out differently, and if switching costs the
 * player nothing they were part-way through.
 */

/** Sixteen bars of a left-hand chord under a four-note right-hand bar. */
function demo(bars = 16, beat = 500) {
  const notes: SongNote[] = []
  const melody = [67, 69, 71, 72, 74, 72, 71, 69]
  for (let bar = 0; bar < bars; bar++) {
    const at = bar * beat * 4
    const root = [43, 45, 47, 48][bar % 4]!
    for (const [note, finger] of [
      [root, 5],
      [root + 7, 1],
    ] as const)
      notes.push({
        note,
        velocity: 80,
        startMs: at,
        durationMs: beat * 4 - 40,
        hand: 'left',
        role: 'keyboard',
        finger,
      })
    for (let b = 0; b < 4; b++)
      notes.push({
        note: melody[(bar * 4 + b) % melody.length]!,
        velocity: 90,
        startMs: at + b * beat,
        durationMs: beat - 40,
        hand: 'right',
        role: 'keyboard',
        finger: (b % 5) + 1,
      })
  }
  const song = buildSong({
    id: 'demo',
    title: 'Demo',
    bpm: 120,
    beatsPerMeasure: 4,
    notes,
    source: 'midi',
    handsInferred: false,
  })
  return { song, measured: measureScore(song, songSteps(song, 'both')) }
}

/** Where each chord lands once its system has been laid out. */
function laidOut(measured: readonly Measured[], fifths: number, width: number) {
  return breakIntoSystems(measured, fifths, width).map((system) => ({
    ...system,
    placed: place(
      measured.slice(system.from, system.to),
      headerEnd(fifths, system.from === 0),
      system.stretch,
    ),
  }))
}

describe('breaking a score into systems', () => {
  const { measured } = demo()

  it.each([420, 700, 1100, 1800])('covers every chord exactly once at width %i', (width) => {
    const systems = breakIntoSystems(measured, 0, width)
    expect(systems[0]!.from).toBe(0)
    expect(systems.at(-1)!.to).toBe(measured.length)
    for (const [i, system] of systems.entries()) {
      // No empty system, and no gap or overlap between one line and the next.
      expect(system.to).toBeGreaterThan(system.from)
      if (i > 0) expect(system.from).toBe(systems[i - 1]!.to)
    }
  })

  it('fits its music inside the line it was given', () => {
    const width = 900
    for (const system of laidOut(measured, 1, width)) {
      // One chord alone may be wider than any line; two never have to be.
      if (system.to - system.from < 2) continue
      const last = system.placed.at(-1)!
      expect(last.x + last.extent.right).toBeLessThanOrEqual(width)
    }
  })

  it('breaks between bars rather than through them', () => {
    // At this width several bars fit, so there is always a bar line to back up
    // to and no system should ever start mid-bar.
    const systems = laidOut(measured, 0, 1100)
    for (const system of systems.slice(1)) {
      const first = system.placed[0]!
      expect(first.bar).not.toBe(measured[first.index - 1]!.bar)
    }
  })

  it('fills every line but the last', () => {
    const systems = breakIntoSystems(measured, 0, 1100)
    for (const system of systems.slice(0, -1)) expect(system.stretch).toBeGreaterThan(1)
    // A final line is left short, the way an engraver leaves it.
    expect(systems.at(-1)!.stretch).toBe(1)
  })

  it('gives a wider page fewer lines', () => {
    const narrow = breakIntoSystems(measured, 0, 600).length
    const wide = breakIntoSystems(measured, 0, 1600).length
    expect(wide).toBeLessThan(narrow)
  })

  it('still ends on music too wide for any line', () => {
    // Narrower than the clefs alone. Nothing fits, and the loop still has to
    // finish rather than spin forever adding empty systems.
    const systems = breakIntoSystems(measured, 7, 10)
    expect(systems).toHaveLength(measured.length)
    expect(systems.at(-1)!.to).toBe(measured.length)
  })

  it('numbers the bars the same however the lines fall', () => {
    const flow = barLinesIn(place(measured, headerEnd(0, true))).map((line) => line.bar)
    const sheet = laidOut(measured, 0, 900).flatMap((system) =>
      barLinesIn(system.placed).map((line) => line.bar),
    )
    // A bar line at the very start of a system is drawn as the system's edge
    // rather than inside it, so Sheet prints a subset — never a different set.
    expect(flow).toEqual(expect.arrayContaining(sheet))
    expect(new Set(sheet).size).toBe(sheet.length)
  })
})

describe('the two views drawing one score', () => {
  const { measured } = demo(8)

  it('writes the same chords in the same order with the same fingering', () => {
    const flow = place(measured, headerEnd(1, true))
    const sheet = laidOut(measured, 1, 900).flatMap((system) => system.placed)
    expect(sheet.map((entry) => entry.index)).toEqual(flow.map((entry) => entry.index))
    for (const [i, entry] of sheet.entries()) {
      expect(entry.step.notes.map((note) => note.note)).toEqual(
        flow[i]!.step.notes.map((note) => note.note),
      )
      expect(entry.step.notes.map((note) => note.finger)).toEqual(
        flow[i]!.step.notes.map((note) => note.finger),
      )
      expect(entry.value).toEqual(flow[i]!.value)
    }
  })

  it('keeps the chords in reading order across the page', () => {
    for (const system of laidOut(measured, 1, 900)) {
      for (let i = 1; i < system.placed.length; i++)
        expect(system.placed[i]!.x).toBeGreaterThan(system.placed[i - 1]!.x)
    }
  })
})

describe('switching between the views', () => {
  it('changes nothing a player was part-way through', () => {
    const before = {
      positionMs: 4200,
      stepIndex: 9,
      mode: 'learn' as const,
      tempoScale: 0.75,
      learning: true,
      part: 'left' as const,
    }
    useSongStore.setState({ ...before, staffView: 'flow' })
    useSongStore.getState().setStaffView('sheet')

    const after = useSongStore.getState()
    expect(after.staffView).toBe('sheet')
    for (const [key, value] of Object.entries(before))
      expect(after[key as keyof typeof before]).toBe(value)
  })
})
