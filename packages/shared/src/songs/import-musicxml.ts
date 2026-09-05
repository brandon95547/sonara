import { buildSong, inferHand, type Hand, type Song, type SongNote } from './song.js'

/**
 * Reads MusicXML into a song.
 *
 * Scanned rather than DOM-parsed, so it runs the same in a browser, in Node and
 * in a test. MusicXML is verbose but extremely regular, and the elements that
 * matter here — note, backup, forward, attributes — never nest inside one
 * another, which is what makes scanning them in document order safe.
 *
 * The three things that make notation different from a note list, and that this
 * has to handle rather than ignore:
 *
 *  - `<chord/>` means "at the same time as the note before", not "after it", so
 *    a chord must not advance the cursor.
 *  - `<backup>` rewinds the cursor so a second voice or staff can be written
 *    over the same bar. Ignore it and the left hand lands after the right
 *    instead of underneath it.
 *  - A tie is one note written as two. Emitting both gives a repeated note
 *    where the music holds.
 */

const STEP_SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

const inner = (xml: string, tag: string): string | undefined =>
  new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(xml)?.[1]

const num = (xml: string, tag: string): number | undefined => {
  const text = inner(xml, tag)
  if (text === undefined) return undefined
  const value = Number(text.trim())
  return Number.isFinite(value) ? value : undefined
}

const flag = (xml: string, tag: string): boolean =>
  new RegExp(`<${tag}(?:\\s[^>]*)?/>|<${tag}(?:\\s[^>]*)?>`).test(xml)

export function importMusicXml(text: string, fallbackTitle: string): Song | null {
  // Compressed .mxl is a zip; it needs unpacking before it gets here.
  if (!/<score-partwise/.test(text)) return null

  const title =
    inner(text, 'work-title')?.trim() || inner(text, 'movement-title')?.trim() || fallbackTitle

  let divisions = 1
  let beatsPerMeasure = 4
  let bpm = 0

  const notes: SongNote[] = []
  /** Open tied notes, so the continuation extends rather than restrikes. */
  const tied = new Map<number, SongNote[]>()

  // Measures in order; the cursor resets to the bar line at each one.
  const measures = [...text.matchAll(/<measure\b[^>]*>([\s\S]*?)<\/measure>/g)]
  let measureStart = 0

  for (const [, body = ''] of measures) {
    let cursor = 0
    let previousStart = 0
    let longest = 0

    const blocks = body.matchAll(
      /<(note|backup|forward|attributes|direction|sound)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g,
    )

    for (const block of blocks) {
      const tag = block[1]!
      const attributes = block[2] ?? ''
      const content = block[3] ?? ''

      if (tag === 'attributes') {
        divisions = num(content, 'divisions') ?? divisions
        const beats = num(content, 'beats')
        const beatType = num(content, 'beat-type')
        if (beats && beatType) beatsPerMeasure = (beats * 4) / beatType
        continue
      }

      if (tag === 'sound' || tag === 'direction') {
        const tempo =
          Number(/tempo="([\d.]+)"/.exec(attributes + content)?.[1] ?? '') ||
          num(content, 'per-minute')
        if (tempo && tempo > 0 && !bpm) bpm = tempo
        continue
      }

      if (tag === 'backup') {
        cursor = Math.max(0, cursor - (num(content, 'duration') ?? 0))
        continue
      }
      if (tag === 'forward') {
        cursor += num(content, 'duration') ?? 0
        continue
      }

      // A note.
      const duration = num(content, 'duration') ?? 0
      const isChord = flag(content, 'chord')
      const start = isChord ? previousStart : cursor

      if (flag(content, 'rest')) {
        cursor = start + duration
        longest = Math.max(longest, cursor)
        continue
      }

      const pitch = inner(content, 'pitch')
      if (!pitch) {
        if (!isChord) cursor = start + duration
        continue
      }

      const step = inner(pitch, 'step')?.trim() ?? 'C'
      const alter = num(pitch, 'alter') ?? 0
      const octave = num(pitch, 'octave') ?? 4
      const midi = (octave + 1) * 12 + (STEP_SEMITONES[step] ?? 0) + alter

      const staff = num(content, 'staff')
      const hand: Hand = staff === 2 ? 'left' : staff === 1 ? 'right' : inferHand(midi)

      const beatsFrom = (value: number) => (value / divisions) * (60000 / (bpm || 100))
      const startMs = measureStart + beatsFrom(start)
      const durationMs = Math.max(30, beatsFrom(duration))

      if (/<tie[^>]*type="stop"/.test(content)) {
        const held = tied.get(midi)?.pop()
        if (held) {
          // Replace the held note with a longer one rather than adding a second.
          const index = notes.lastIndexOf(held)
          if (index >= 0) {
            notes[index] = { ...held, durationMs: startMs + durationMs - held.startMs }
            if (/<tie[^>]*type="start"/.test(content)) {
              const queue = tied.get(midi) ?? []
              queue.push(notes[index]!)
              tied.set(midi, queue)
            }
          }
          if (!isChord) {
            previousStart = start
            cursor = start + duration
            longest = Math.max(longest, cursor)
          }
          continue
        }
      }

      const note: SongNote = { note: midi, velocity: 80, startMs, durationMs, hand }
      notes.push(note)
      if (/<tie[^>]*type="start"/.test(content)) {
        const queue = tied.get(midi) ?? []
        queue.push(note)
        tied.set(midi, queue)
      }

      if (!isChord) {
        previousStart = start
        cursor = start + duration
      }
      longest = Math.max(longest, start + duration)
    }

    measureStart += (longest / divisions) * (60000 / (bpm || 100))
  }

  if (notes.length === 0) return null

  return buildSong({
    id: `musicxml:${title}:${Date.now()}`,
    title,
    bpm: bpm || 100,
    beatsPerMeasure,
    notes,
    source: 'musicxml',
    handsInferred: !/<staff>/.test(text),
  })
}
