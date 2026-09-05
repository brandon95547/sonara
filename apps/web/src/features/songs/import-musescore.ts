import {
  buildSong,
  inferHand,
  tonicForFifths,
  type DetectedKey,
  type Hand,
  type PedalSpan,
  type Song,
  type SongNote,
} from '@sonara/shared'

/**
 * Reads MuseScore's own `.mscx` into a song.
 *
 * Not MusicXML. `.mscz` is a zip like `.mxl`, and the document inside is
 * MuseScore's internal format — a different vocabulary describing the same
 * music. It is worth reading directly because `.mscz` is what MuseScore *saves*
 * as; exporting MusicXML is an extra step, and a step people forget.
 *
 * Two things make it pleasant to read where MusicXML is not. Pitch is already
 * a MIDI number, so nothing has to be spelled. And duration is a name —
 * `quarter`, `eighth` — rather than a count of divisions, so the tuplet and
 * dot arithmetic is small and local.
 *
 * The awkward part is time. There is no cursor in the file: a `<Chord>` or
 * `<Rest>` advances it, a `<Chord>` inside the same `<voice>` follows the one
 * before, and each `<voice>` restarts at the beginning of its measure.
 */

/** Fractions of a whole note. */
const DURATIONS: Record<string, number> = {
  long: 4,
  breve: 2,
  whole: 1,
  half: 1 / 2,
  quarter: 1 / 4,
  eighth: 1 / 8,
  '16th': 1 / 16,
  '32nd': 1 / 32,
  '64th': 1 / 64,
  '128th': 1 / 128,
  measure: 1,
}

const inner = (xml: string, tag: string): string | undefined =>
  new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(xml)?.[1]

const num = (xml: string, tag: string): number | undefined => {
  const text = inner(xml, tag)
  if (text === undefined) return undefined
  const value = Number(text.trim())
  return Number.isFinite(value) ? value : undefined
}

/** Top-level children of one element, in document order. */
function* children(xml: string, tags: readonly string[]): Generator<{ tag: string; body: string }> {
  const pattern = new RegExp(`<(${tags.join('|')})(?:\\s[^>]*)?(?:/>|>([\\s\\S]*?)</\\1>)`, 'g')
  for (const match of xml.matchAll(pattern)) {
    yield { tag: match[1]!, body: match[2] ?? '' }
  }
}

export function importMuseScore(text: string, fallbackTitle: string): Song | null {
  if (!/<museScore/i.test(text)) return null

  const title =
    /<metaTag name="workTitle">([^<]*)<\/metaTag>/.exec(text)?.[1]?.trim() || fallbackTitle

  let bpm = num(text, 'tempo') ? num(text, 'tempo')! * 60 : 0
  // <tempo> is beats per second in MuseScore's file, not per minute.
  if (!Number.isFinite(bpm) || bpm <= 0) bpm = 0

  let beatsPerMeasure = 4
  let key: DetectedKey | null = null
  const notes: SongNote[] = []
  const pedal: PedalSpan[] = []

  // Each <Staff id="n"> at the top level carries that staff's measures. Staff 1
  // is the right hand and staff 2 the left, which is how a piano part is
  // written and how MuseScore stores it.
  const staves = [...text.matchAll(/<Staff id="(\d+)">([\s\S]*?)<\/Staff>/g)].filter(([, , body]) =>
    /<Measure/.test(body ?? ''),
  )
  if (staves.length === 0) return null

  const beat = () => 60000 / (bpm || 100)

  for (const [, idText, staffBody = ''] of staves) {
    const staffIndex = Number(idText)
    const hand: Hand | null = staffIndex === 1 ? 'right' : staffIndex === 2 ? 'left' : null
    let measureStart = 0

    for (const [, measureBody = ''] of staffBody.matchAll(
      /<Measure(?:\s[^>]*)?>([\s\S]*?)<\/Measure>/g,
    )) {
      const sigN = num(measureBody, 'sigN')
      const sigD = num(measureBody, 'sigD')
      if (sigN && sigD) beatsPerMeasure = (sigN * 4) / sigD

      const accidental = num(measureBody, 'accidental')
      if (accidental !== undefined && key === null) {
        key = {
          fifths: accidental,
          mode: 'major',
          pitchClass: tonicForFifths(accidental, 'major'),
          declared: true,
        }
      }

      let longestVoice = 0
      // Voices are written one after another and all start at the bar line.
      const voices = [...measureBody.matchAll(/<voice>([\s\S]*?)<\/voice>/g)]
      const bodies = voices.length > 0 ? voices.map(([, body = '']) => body) : [measureBody]

      for (const voiceBody of bodies) {
        let cursor = 0
        let dynamic: string | undefined

        for (const element of children(voiceBody, [
          'Chord',
          'Rest',
          'Dynamic',
          'Pedal',
          'location',
        ])) {
          if (element.tag === 'Dynamic') {
            dynamic = inner(element.body, 'subtype')?.trim() || dynamic
            continue
          }
          if (element.tag === 'Pedal') {
            // A spanner: its length is on the element, in fractions of a whole.
            const ticks = /(\d+)\/(\d+)/.exec(inner(element.body, 'fractions') ?? '')
            const beats = ticks ? (Number(ticks[1]) / Number(ticks[2])) * 4 : beatsPerMeasure
            pedal.push({
              startMs: measureStart + cursor * beat(),
              endMs: measureStart + (cursor + beats) * beat(),
            })
            continue
          }

          const typeName = inner(element.body, 'durationType')?.trim() ?? 'quarter'
          const whole = DURATIONS[typeName] ?? 1 / 4
          const dots = num(element.body, 'dots') ?? 0
          // A dot adds half of what came before it, and a second dot half again.
          let beats = whole * 4 * (2 - 2 ** -dots)
          const tuplet =
            /<Tuplet>[\s\S]*?<normalNotes>(\d+)<\/normalNotes>[\s\S]*?<actualNotes>(\d+)<\/actualNotes>/.exec(
              element.body,
            )
          if (tuplet) beats *= Number(tuplet[1]) / Number(tuplet[2])

          if (element.tag === 'Rest') {
            cursor += typeName === 'measure' ? beatsPerMeasure : beats
            longestVoice = Math.max(longestVoice, cursor)
            continue
          }

          // A chord: every <Note> inside it starts together.
          for (const note of children(element.body, ['Note'])) {
            const pitch = num(note.body, 'pitch')
            if (pitch === undefined) continue
            const fingerText = inner(note.body, 'Fingering')
              ? inner(inner(note.body, 'Fingering')!, 'text')?.trim()
              : undefined
            const finger = fingerText && /^[1-5]$/.test(fingerText) ? Number(fingerText) : undefined

            notes.push({
              note: pitch,
              velocity: velocityFor(dynamic),
              startMs: measureStart + cursor * beat(),
              durationMs: Math.max(30, beats * beat()),
              hand: hand ?? inferHand(pitch),
              role: 'keyboard',
              ...(finger ? { finger } : {}),
              ...(dynamic ? { dynamic } : {}),
            })
          }
          cursor += beats
          longestVoice = Math.max(longestVoice, cursor)
        }
      }

      measureStart += Math.max(longestVoice, beatsPerMeasure) * beat()
    }
  }

  if (notes.length === 0) return null

  return buildSong({
    id: `musescore:${title}:${Date.now()}`,
    title,
    bpm: bpm || 100,
    beatsPerMeasure,
    notes,
    source: 'musescore',
    // MuseScore names the staff a note is on, so hands are read, not guessed.
    handsInferred: staves.length < 2,
    key,
    pedal,
    rhythmFromScore: true,
    parts: ['Piano'],
  })
}

/** Dynamics as a velocity, so a marked score plays with its own shape. */
function velocityFor(dynamic: string | undefined): number {
  const table: Record<string, number> = {
    ppp: 16,
    pp: 33,
    p: 49,
    mp: 64,
    mf: 80,
    f: 96,
    ff: 112,
    fff: 126,
  }
  return dynamic ? (table[dynamic] ?? 80) : 80
}
