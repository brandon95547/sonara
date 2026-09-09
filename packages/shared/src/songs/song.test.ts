import { describe, expect, it } from 'vitest'
import { numberMeasures } from './meter.js'
import { buildSong, songSteps, type SongNote } from './song.js'

const note = (
  pitch: number,
  startMs: number,
  durationMs: number,
  extra: Partial<SongNote> = {},
): SongNote => ({
  note: pitch,
  velocity: 80,
  startMs,
  durationMs,
  hand: 'right',
  role: 'keyboard',
  ...extra,
})

describe('the bars of a song', () => {
  it('lays a file that gave no bars out on a grid', () => {
    const song = buildSong({
      id: 'grid',
      title: 'Grid',
      bpm: 120,
      beatsPerMeasure: 3,
      timeSignature: { beats: 3, beatType: 4 },
      notes: [note(60, 0, 500), note(62, 3000, 500)],
      source: 'midi',
      handsInferred: false,
    })
    expect(song.measures.map((bar) => bar.startMs)).toEqual([0, 1500, 3000])
    expect(song.measures.map((bar) => bar.number)).toEqual([1, 2, 3])
    expect(song.measureCount).toBe(3)
    expect(song.measureMs).toBe(1500)
  })

  it('keeps the bars an importer read, pickup and all', () => {
    const measures = numberMeasures([
      {
        startMs: 0,
        durationMs: 500,
        startQ: 0,
        durationQ: 1,
        beats: 3,
        beatType: 4,
        quarterMs: 500,
      },
      {
        startMs: 500,
        durationMs: 1500,
        startQ: 1,
        durationQ: 3,
        beats: 3,
        beatType: 4,
        quarterMs: 500,
      },
    ])
    const song = buildSong({
      id: 'pickup',
      title: 'Pickup',
      bpm: 120,
      beatsPerMeasure: 3,
      timeSignature: { beats: 3, beatType: 4 },
      notes: [note(60, 0, 500), note(62, 500, 500)],
      source: 'musescore',
      handsInferred: false,
      measures,
    })
    expect(song.measures.map((bar) => bar.number)).toEqual([0, 1])
    // The convenience length is a full bar, not the pickup.
    expect(song.measureMs).toBe(1500)
  })

  it('gives every note its place in crotchets from the bars', () => {
    const song = buildSong({
      id: 'q',
      title: 'Quarters',
      bpm: 120,
      beatsPerMeasure: 4,
      notes: [note(60, 0, 500), note(62, 1500, 1000), note(64, 4000, 250)],
      source: 'midi',
      handsInferred: false,
    })
    expect(song.notes.map((n) => [n.startQ, n.durationQ])).toEqual([
      [0, 1],
      [3, 2],
      [8, 0.5],
    ])
  })

  it('leaves a score’s own crotchets alone', () => {
    const song = buildSong({
      id: 'score',
      title: 'Score',
      bpm: 60,
      beatsPerMeasure: 4,
      notes: [note(60, 0, 1000, { startQ: 0, durationQ: 1.5 })],
      source: 'musicxml',
      handsInferred: false,
    })
    expect(song.notes[0]).toMatchObject({ startQ: 0, durationQ: 1.5 })
  })

  it('follows a tempo change when the bars carry one', () => {
    // Two bars: the second at half speed. A note at the start of bar two is
    // still crotchet four, however many milliseconds it took to get there.
    const measures = numberMeasures([
      {
        startMs: 0,
        durationMs: 2000,
        startQ: 0,
        durationQ: 4,
        beats: 4,
        beatType: 4,
        quarterMs: 500,
      },
      {
        startMs: 2000,
        durationMs: 4000,
        startQ: 4,
        durationQ: 4,
        beats: 4,
        beatType: 4,
        quarterMs: 1000,
      },
    ])
    const song = buildSong({
      id: 'rit',
      title: 'Rit',
      bpm: 120,
      beatsPerMeasure: 4,
      notes: [note(60, 2000, 1000), note(62, 3000, 1000)],
      source: 'midi',
      handsInferred: false,
      measures,
    })
    expect(song.notes.map((n) => [n.startQ, n.durationQ])).toEqual([
      [4, 1],
      [5, 1],
    ])
  })

  it('still groups steps by time', () => {
    const song = buildSong({
      id: 'steps',
      title: 'Steps',
      bpm: 120,
      beatsPerMeasure: 4,
      notes: [note(60, 0, 500), note(64, 10, 500), note(67, 600, 500)],
      source: 'midi',
      handsInferred: false,
    })
    expect(songSteps(song).map((step) => step.notes.length)).toEqual([2, 1])
  })
})
