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

/**
 * Top-level children of one element, in document order.
 *
 * Depth matters. A `<Spanner>` carries `<location>` elements describing how far
 * it reaches, and a slur or tie sits inside the chord it belongs to — matching
 * those as though they were the bar's own contents advances the cursor for
 * music that is not there, and the error accumulates over the piece. So tags
 * are counted in and out rather than matched wherever they appear.
 */
function* children(xml: string, tags: readonly string[]): Generator<{ tag: string; body: string }> {
  const wanted = new Set(tags)
  let depth = 0
  let open: { tag: string; from: number } | null = null

  for (const match of xml.matchAll(/<([/?!]?)([\w.:-]+)[^>]*?(\/?)>/g)) {
    const [text = '', prefix = '', name = '', selfClosing = ''] = match
    if (prefix === '?' || prefix === '!') continue

    if (selfClosing) {
      if (depth === 0 && wanted.has(name)) yield { tag: name, body: '' }
      continue
    }
    if (prefix !== '/') {
      if (depth === 0 && wanted.has(name)) open = { tag: name, from: match.index + text.length }
      depth += 1
      continue
    }

    depth -= 1
    if (depth === 0 && open?.tag === name) {
      yield { tag: name, body: xml.slice(open.from, match.index) }
      open = null
    }
  }
}

interface Part {
  readonly staffIds: readonly number[]
  readonly name: string
}

/**
 * The instruments the score is written for, and which staves each one owns.
 *
 * This is what says whether two staves are two hands. A piano is one `<Part>`
 * holding two `<Staff>` children, and there the upper staff really is the right
 * hand. Two single-staff parts are two instruments — reading the second as a
 * left hand puts a melody an octave above middle C into the hand that cannot
 * play it, and, worse, claims the score said so.
 */
function readParts(text: string): Part[] {
  const parts: Part[] = []
  for (const [, body = ''] of text.matchAll(/<Part(?:\s[^>]*)?>([\s\S]*?)<\/Part>/g)) {
    const staffIds = [...body.matchAll(/<Staff id="(\d+)"/g)].map(([, id]) => Number(id))
    if (staffIds.length === 0) continue
    const name = (inner(body, 'longName') ?? inner(body, 'trackName') ?? '')
      .replace(/<[^>]*>/g, '')
      .trim()
    parts.push({ staffIds, name })
  }
  return parts
}

export function importMuseScore(text: string, fallbackTitle: string): Song | null {
  if (!/<museScore/i.test(text)) return null

  const title =
    /<metaTag name="workTitle">([^<]*)<\/metaTag>/.exec(text)?.[1]?.trim() || fallbackTitle

  let bpm = num(text, 'tempo') ? num(text, 'tempo')! * 60 : 0
  // <tempo> is beats per second in MuseScore's file, not per minute.
  if (!Number.isFinite(bpm) || bpm <= 0) bpm = 0

  let beatsPerMeasure = 4
  let timeSignature = { beats: 4, beatType: 4 }
  let key: DetectedKey | null = null
  const notes: SongNote[] = []
  const pedal: PedalSpan[] = []

  // Each <Staff id="n"> at the top level carries that staff's measures.
  const staves = [...text.matchAll(/<Staff id="(\d+)">([\s\S]*?)<\/Staff>/g)].filter(([, , body]) =>
    /<Measure/.test(body ?? ''),
  )
  if (staves.length === 0) return null

  const parts = readParts(text)

  /**
   * The hand a staff is written for, or null when the file does not say.
   *
   * Only a part that owns two staves has hands to read: the upper is the right,
   * the lower the left. One staff of its own is an instrument's single line and
   * says nothing about hands, however low it sits. A file with no part
   * information at all is read the old way, staff 1 then staff 2, because
   * absent anything better that is what a two-staff score means.
   */
  const handForStaff = (id: number): Hand | null => {
    if (parts.length === 0) return id === 1 ? 'right' : id === 2 ? 'left' : null
    const owner = parts.find((part) => part.staffIds.includes(id))
    if (!owner || owner.staffIds.length !== 2) return null
    return owner.staffIds[0] === id ? 'right' : 'left'
  }

  const beat = () => 60000 / (bpm || 100)
  let guessedAHand = false

  for (const [, idText, staffBody = ''] of staves) {
    const staffIndex = Number(idText)
    const hand = handForStaff(staffIndex)
    if (hand === null) guessedAHand = true
    let measureStart = 0

    for (const [, attributes = '', measureBody = ''] of staffBody.matchAll(
      /<Measure((?:\s[^>]*)?)>([\s\S]*?)<\/Measure>/g,
    )) {
      const sigN = num(measureBody, 'sigN')
      const sigD = num(measureBody, 'sigD')
      if (sigN && sigD) {
        beatsPerMeasure = (sigN * 4) / sigD
        timeSignature = { beats: sigN, beatType: sigD }
      }

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
          if (element.tag === 'location') {
            // MuseScore's cursor move, the equivalent of MusicXML's <backup>:
            // a signed fraction of a whole note, written where a voice does
            // not simply run from one bar line to the next.
            const shift = /(-?\d+)\/(\d+)/.exec(inner(element.body, 'fractions') ?? '')
            if (shift) cursor = Math.max(0, cursor + (Number(shift[1]) / Number(shift[2])) * 4)
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

      // A pickup bar states its own length, shorter than the time signature.
      // Padding it out to a full bar inserts silence and shifts every note
      // after it — for a one-beat pickup in 3/4, by two beats, for the rest of
      // the piece.
      const declared = /\blen="(\d+)\/(\d+)"/.exec(attributes)
      const measureBeats = declared
        ? (Number(declared[1]) / Number(declared[2])) * 4
        : beatsPerMeasure

      measureStart += Math.max(longestVoice, measureBeats) * beat()
    }
  }

  if (notes.length === 0) return null

  const sounding = new Set(staves.map(([, id]) => Number(id)))
  const named = [
    ...new Set(
      parts
        .filter((part) => part.staffIds.some((id) => sounding.has(id)))
        .map((part) => part.name)
        .filter((name) => name.length > 0),
    ),
  ]

  return buildSong({
    id: `musescore:${title}:${Date.now()}`,
    title,
    bpm: bpm || 100,
    beatsPerMeasure,
    timeSignature,
    notes,
    source: 'musescore',
    // Read from the score only where one part owns two staves. Anywhere else
    // the hand came from pitch, and the library has to say so rather than
    // claim the score decided it.
    handsInferred: guessedAHand || staves.length < 2,
    key,
    pedal,
    rhythmFromScore: true,
    parts: named.length > 0 ? named : ['Piano'],
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
