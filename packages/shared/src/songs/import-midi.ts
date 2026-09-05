import { buildSong, inferHand, type Hand, type Song, type SongNote } from './song.js'

/**
 * Reads a Standard MIDI File into a song.
 *
 * Handles format 0 and format 1, which is everything a piano part arrives as.
 * The awkward parts of the format are the ones this has to get right:
 *
 *  - Running status. A note-on can omit its status byte and inherit the last
 *    one, which is how most files keep their size down. Miss it and the parse
 *    desynchronises into nonsense a few events in.
 *  - Note-on with velocity zero. The spec allows it as a note-off, and it is
 *    what most sequencers actually write, precisely so running status can be
 *    used for a whole passage.
 *  - Tempo. Format 1 keeps it on a conductor track that has no notes at all.
 */

class Reader {
  at = 0
  constructor(readonly bytes: Uint8Array) {}

  u8() {
    return this.bytes[this.at++] ?? 0
  }
  u16() {
    return (this.u8() << 8) | this.u8()
  }
  u32() {
    return ((this.u8() << 24) | (this.u8() << 16) | (this.u8() << 8) | this.u8()) >>> 0
  }
  text(length: number) {
    const slice = this.bytes.slice(this.at, this.at + length)
    this.at += length
    return String.fromCharCode(...slice)
  }
  /** Variable-length quantity: seven bits a byte, high bit means "another". */
  varLength() {
    let value = 0
    for (let index = 0; index < 4; index++) {
      const byte = this.u8()
      value = (value << 7) | (byte & 0x7f)
      if ((byte & 0x80) === 0) break
    }
    return value
  }
}

interface RawNote {
  note: number
  velocity: number
  startTick: number
  endTick: number
  track: number
}

export function importMidi(bytes: Uint8Array, title: string): Song | null {
  const reader = new Reader(bytes)
  if (reader.text(4) !== 'MThd') return null
  const headerLength = reader.u32()
  reader.u16() // format — 0 and 1 are read the same way here
  const trackCount = reader.u16()
  const division = reader.u16()
  reader.at = 8 + headerLength

  // SMPTE timing sets the top bit. Rare for music files, and the tick maths
  // below would be wrong for it, so it is refused rather than mis-read.
  if (division & 0x8000) return null
  const ppq = division || 480

  const notes: RawNote[] = []
  let microsecondsPerQuarter = 500000
  let beatsPerMeasure = 4
  let tempoFound = false

  for (let track = 0; track < trackCount; track++) {
    if (reader.text(4) !== 'MTrk') break
    const length = reader.u32()
    const end = reader.at + length
    let tick = 0
    let status = 0
    const open = new Map<number, RawNote[]>()

    while (reader.at < end) {
      tick += reader.varLength()
      let byte = reader.u8()

      if (byte < 0x80) {
        // Running status: this byte is already data, so put it back.
        reader.at--
        byte = status
      } else if (byte < 0xf0) {
        status = byte
      }

      if (byte === 0xff) {
        const type = reader.u8()
        const metaLength = reader.varLength()
        const from = reader.at
        if (type === 0x51 && metaLength === 3) {
          microsecondsPerQuarter = (reader.u8() << 16) | (reader.u8() << 8) | reader.u8()
          tempoFound = true
        } else if (type === 0x58 && metaLength >= 2) {
          const numerator = reader.u8()
          const denominator = 2 ** reader.u8()
          // A bar of 6/8 is six eighths, which is three quarter-note beats.
          beatsPerMeasure = Math.max(1, (numerator * 4) / denominator)
        }
        reader.at = from + metaLength
        continue
      }

      if (byte === 0xf0 || byte === 0xf7) {
        reader.at += reader.varLength()
        continue
      }

      const command = byte & 0xf0
      const first = reader.u8()
      const second = command === 0xc0 || command === 0xd0 ? 0 : reader.u8()

      if (command === 0x90 && second > 0) {
        const queue = open.get(first) ?? []
        queue.push({ note: first, velocity: second, startTick: tick, endTick: tick, track })
        open.set(first, queue)
      } else if (command === 0x80 || (command === 0x90 && second === 0)) {
        // Note-on at velocity zero is a note-off, and is what most files write.
        const started = open.get(first)?.shift()
        if (started) {
          started.endTick = tick
          notes.push(started)
        }
      }
    }

    // Anything still held when the track ended stops there.
    for (const queue of open.values()) {
      for (const started of queue) {
        started.endTick = Math.max(tick, started.startTick + 1)
        notes.push(started)
      }
    }
    reader.at = end
  }

  if (notes.length === 0) return null

  const msPerTick = microsecondsPerQuarter / 1000 / ppq
  // Tracks that actually carry notes. A format 1 conductor track has none, and
  // counting it would make a two-hand piece look like three parts.
  const playing = [...new Set(notes.map((note) => note.track))].sort((a, b) => a - b)
  // Convention, near-universal for piano: the first track is the right hand.
  const byTrack = playing.length >= 2
  const hands = new Map<number, Hand>(
    playing.map((track, index) => [track, index === 0 ? 'right' : 'left']),
  )

  const songNotes: SongNote[] = notes.map((raw) => ({
    note: raw.note,
    velocity: raw.velocity,
    startMs: raw.startTick * msPerTick,
    durationMs: Math.max(30, (raw.endTick - raw.startTick) * msPerTick),
    hand: byTrack ? (hands.get(raw.track) ?? 'right') : inferHand(raw.note),
  }))

  return buildSong({
    id: `midi:${title}:${Date.now()}`,
    title,
    bpm: tempoFound ? 60000000 / microsecondsPerQuarter : 100,
    beatsPerMeasure,
    notes: songNotes,
    source: 'midi',
    handsInferred: !byTrack,
  })
}
