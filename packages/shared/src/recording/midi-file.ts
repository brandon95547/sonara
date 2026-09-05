import type { RecordedNote } from './performance.js'

/**
 * A Standard MIDI File, written by hand.
 *
 * Format 0 — one track, everything on it — because a solo piano performance is
 * one part and nothing downstream benefits from splitting it. Every sequencer,
 * DAW and notation program reads format 0.
 *
 * MIDI is the honest export for a performance: it keeps the timing and the
 * velocities exactly as played, where notation has to round both onto a grid
 * before it can draw them.
 */

/** Ticks per quarter note. 480 divides cleanly by 2, 3, 4 and 8. */
const PPQ = 480

/** MIDI's variable-length quantity: seven bits per byte, high bit as "more". */
function writeVarLength(value: number): number[] {
  const bytes = [value & 0x7f]
  let rest = value >> 7
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80)
    rest >>= 7
  }
  return bytes
}

function chunk(id: string, body: number[]): number[] {
  const length = body.length
  return [
    ...[...id].map((character) => character.charCodeAt(0)),
    (length >> 24) & 0xff,
    (length >> 16) & 0xff,
    (length >> 8) & 0xff,
    length & 0xff,
    ...body,
  ]
}

export interface MidiFileOptions {
  /** Beats per minute the file declares. Timing is absolute either way. */
  readonly bpm?: number
}

export function writeMidiFile(
  notes: readonly RecordedNote[],
  options: MidiFileOptions = {},
): Uint8Array {
  const bpm = options.bpm && options.bpm > 0 ? options.bpm : 100
  const ticksPerMs = (PPQ * bpm) / 60000

  // One list of absolute-time events, sorted, then differenced into deltas.
  // Note-offs sort before note-ons at the same tick so a repeated pitch is
  // released before it is struck again — the other order leaves it ringing.
  const timeline: { tick: number; order: number; bytes: number[] }[] = []
  for (const note of notes) {
    const start = Math.max(0, Math.round(note.startMs * ticksPerMs))
    const end = Math.max(start + 1, Math.round((note.startMs + note.durationMs) * ticksPerMs))
    const velocity = Math.min(127, Math.max(1, Math.round(note.velocity)))
    timeline.push({ tick: start, order: 1, bytes: [0x90, note.note & 0x7f, velocity] })
    timeline.push({ tick: end, order: 0, bytes: [0x80, note.note & 0x7f, 0x00] })
  }
  timeline.sort((a, b) => a.tick - b.tick || a.order - b.order)

  const microsecondsPerQuarter = Math.round(60000000 / bpm)
  const track: number[] = [
    ...writeVarLength(0),
    0xff,
    0x51,
    0x03,
    (microsecondsPerQuarter >> 16) & 0xff,
    (microsecondsPerQuarter >> 8) & 0xff,
    microsecondsPerQuarter & 0xff,
  ]

  let previous = 0
  for (const event of timeline) {
    track.push(...writeVarLength(event.tick - previous), ...event.bytes)
    previous = event.tick
  }
  track.push(...writeVarLength(0), 0xff, 0x2f, 0x00)

  const header = chunk('MThd', [0x00, 0x00, 0x00, 0x01, (PPQ >> 8) & 0xff, PPQ & 0xff])
  return Uint8Array.from([...header, ...chunk('MTrk', track)])
}
