import {
  buildSong,
  inferHand,
  modeForFifths,
  numberMeasures,
  spellingFromTpc,
  spellingName,
  tonicForFifths,
  velocityForDynamic,
  type ChordSymbol,
  type DetectedKey,
  type Hand,
  type NoteValue,
  type PedalSpan,
  type Song,
  type SongMeasure,
  type SongNote,
  type WrittenNote,
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
 * a MIDI number, and its spelling is beside it as a tonal pitch class, so
 * nothing has to be worked out. And duration is a name — `quarter`, `eighth` —
 * rather than a count of divisions, so the tuplet and dot arithmetic is small
 * and local.
 *
 * The awkward part is time. There is no cursor in the file: a `<Chord>` or
 * `<Rest>` advances it, a `<Chord>` inside the same `<voice>` follows the one
 * before, and each `<voice>` restarts at the beginning of its measure. Three
 * things do not advance it and were read as though they did: a grace note,
 * which is struck before the beat it belongs to; a `<Tuplet>`, which scales
 * the chords that follow it until `<endTuplet/>`; and a tie, which is one note
 * written as two.
 */

/**
 * What an octave line does to the notes under it, in semitones.
 *
 * These are the only place in a score where the written pitch and the sounding
 * pitch differ *and* MuseScore stores the written one. An octave-transposing
 * clef — `G8va` and its family — is the other way round: the stored pitch
 * already sounds, and the clef only decides where the notehead is drawn. So
 * clefs are correctly ignored here and these are not.
 */
const OCTAVE_SHIFTS: Record<string, number> = {
  '8va': 12,
  '8vb': -12,
  '15ma': 24,
  '15mb': -24,
  '22ma': 36,
  '22mb': -36,
}

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

/** MuseScore duration names onto the values the engraver draws. */
const VALUES: Record<string, NoteValue> = {
  long: 'whole',
  breve: 'whole',
  whole: 'whole',
  measure: 'whole',
  half: 'half',
  quarter: 'quarter',
  eighth: 'eighth',
  '16th': 'sixteenth',
  '32nd': 'thirty-second',
  '64th': 'thirty-second',
  '128th': 'thirty-second',
}

/** The elements that mark a chord as a grace note, before or after its beat. */
const GRACE_TAGS = [
  'acciaccatura',
  'appoggiatura',
  'grace4',
  'grace16',
  'grace32',
  'grace8after',
  'grace16after',
  'grace32after',
]

/** How long before its beat a grace note is struck, in crotchets. */
const GRACE_Q = 0.25

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

interface Parsed extends SongNote {
  readonly startQ: number
  readonly durationQ: number
}

export function importMuseScore(text: string, fallbackTitle: string): Song | null {
  if (!/<museScore/i.test(text)) return null

  const title =
    /<metaTag name="workTitle">([^<]*)<\/metaTag>/.exec(text)?.[1]?.trim() || fallbackTitle

  let beatsPerMeasure = 4
  let timeSignature = { beats: 4, beatType: 4 }
  let fifths: number | null = null
  let mode: 'major' | 'minor' | null = null
  const notes: Parsed[] = []
  const pedalsQ: { fromQ: number; toQ: number }[] = []
  const chordsQ: { startQ: number; text: string }[] = []
  /** Tempo marks in crotchets from the start. `<tempo>` is beats per second. */
  const tempos: { atQ: number; bpm: number }[] = []
  /** Each bar's length in crotchets and its metre, from the first staff read. */
  const bars: { durationQ: number; beats: number; beatType: number }[] = []
  let tupletCounter = 0

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

  let guessedAHand = false

  for (const [, idText, staffBody = ''] of staves) {
    const staffIndex = Number(idText)
    const hand = handForStaff(staffIndex)
    if (hand === null) guessedAHand = true
    let measureStartQ = 0
    // Octave lines belong to the staff that carries them, so they are gathered
    // per staff and applied to that staff's notes once its measures are read.
    const octaves: { fromQ: number; toQ: number; semitones: number }[] = []
    const staffFirstNote = notes.length
    /** Open tied notes on this staff, by pitch, so a tie extends rather than restrikes. */
    const tied = new Map<number, Parsed>()

    for (const [index, [, attributes = '', measureBody = '']] of [
      ...staffBody.matchAll(/<Measure((?:\s[^>]*)?)>([\s\S]*?)<\/Measure>/g),
    ].entries()) {
      const sigN = num(measureBody, 'sigN')
      const sigD = num(measureBody, 'sigD')
      if (sigN && sigD) {
        beatsPerMeasure = (sigN * 4) / sigD
        timeSignature = { beats: sigN, beatType: sigD }
      }

      // `<accidental>` is the signature's count of sharps or flats; MuseScore 4
      // also writes it as `<concertKey>`. The mode is written only when the
      // key was set as minor, and is worked out from the notes otherwise.
      const keySig = inner(measureBody, 'KeySig')
      if (keySig && fifths === null) {
        const declared = num(keySig, 'accidental') ?? num(keySig, 'concertKey')
        if (declared !== undefined) {
          fifths = declared
          const written = inner(keySig, 'mode')?.trim().toLowerCase()
          mode = written === 'minor' ? 'minor' : written === 'major' ? 'major' : null
        }
      }

      let longestVoice = 0
      // Voices are written one after another and all start at the bar line.
      const voices = [...measureBody.matchAll(/<voice>([\s\S]*?)<\/voice>/g)]
      const bodies = voices.length > 0 ? voices.map(([, body = '']) => body) : [measureBody]

      for (const voiceBody of bodies) {
        let cursor = 0
        let dynamic: string | undefined
        /** Tuplets in force, innermost last. Each scales what is under it. */
        const tuplets: { id: number; actual: number; normal: number }[] = []

        for (const element of children(voiceBody, [
          'Chord',
          'Rest',
          'Dynamic',
          // Both the pedal and the octave lines arrive wrapped: MuseScore
          // writes `<Spanner type="Pedal">` with the element inside it, so
          // matching the inner tag here finds nothing at all. Pedal was written
          // that way and had never imported a single span.
          'Spanner',
          'location',
          'Tuplet',
          'endTuplet',
          'Tempo',
          'Harmony',
        ])) {
          if (element.tag === 'Dynamic') {
            dynamic = inner(element.body, 'subtype')?.trim() || dynamic
            continue
          }
          if (element.tag === 'Tempo') {
            // Crotchets per second in the file, per minute everywhere else.
            const perSecond = num(element.body, 'tempo')
            if (perSecond && perSecond > 0)
              tempos.push({ atQ: measureStartQ + cursor, bpm: perSecond * 60 })
            continue
          }
          if (element.tag === 'Harmony') {
            const root = num(element.body, 'root')
            const spelled = root !== undefined ? spellingFromTpc(root) : null
            if (spelled) {
              const name = (inner(element.body, 'name') ?? '').trim()
              const base = num(element.body, 'base')
              const bass = base !== undefined ? spellingFromTpc(base) : null
              chordsQ.push({
                startQ: measureStartQ + cursor,
                text: `${spellingName(spelled)}${name}${bass ? `/${spellingName(bass)}` : ''}`,
              })
            }
            continue
          }
          if (element.tag === 'Tuplet') {
            const normal = num(element.body, 'normalNotes')
            const actual = num(element.body, 'actualNotes')
            if (normal && actual) tuplets.push({ id: ++tupletCounter, actual, normal })
            continue
          }
          if (element.tag === 'endTuplet') {
            tuplets.pop()
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
          if (element.tag === 'Spanner') {
            // How far it reaches, in fractions of a whole note. A spanner's
            // closing half carries a negative fraction in `<prev>`; only the
            // opening half names what kind of thing it is, so the rest are
            // skipped by having no subtype to match.
            const ticks = /(-?\d+)\/(\d+)/.exec(inner(element.body, 'fractions') ?? '')
            const beats = ticks ? (Number(ticks[1]) / Number(ticks[2])) * 4 : 0

            if (inner(element.body, 'Pedal') !== undefined) {
              if (hand !== null || staves.length === 1) {
                pedalsQ.push({
                  fromQ: measureStartQ + cursor,
                  toQ: measureStartQ + cursor + (beats > 0 ? beats : beatsPerMeasure),
                })
              }
              continue
            }

            // An octave line, and the one place a score's written pitch and its
            // sounding pitch differ in the file. MuseScore stores the written
            // one here and shifts it on playback — the opposite of an
            // octave-transposing clef, where the stored pitch already sounds
            // and the clef only moves the notehead. Ignored, a 15ma comes out
            // two octaves below the page.
            const shift = OCTAVE_SHIFTS[inner(element.body, 'subtype')?.trim() ?? '']
            if (shift !== undefined && beats > 0) {
              octaves.push({
                fromQ: measureStartQ + cursor,
                // A hair short, so a note starting exactly where the line ends
                // is outside it.
                toQ: measureStartQ + cursor + beats - 1e-6,
                semitones: shift,
              })
            }
            continue
          }

          const typeName = inner(element.body, 'durationType')?.trim() ?? 'quarter'
          const whole = DURATIONS[typeName] ?? 1 / 4
          const dots = num(element.body, 'dots') ?? 0
          // A dot adds half of what came before it, and a second dot half again.
          let beats = whole * 4 * (2 - 2 ** -dots)
          // Every tuplet in force scales the note: a triplet quaver is a third
          // of a crotchet, and a triplet inside a duplet is both at once.
          for (const tuplet of tuplets) beats *= tuplet.normal / tuplet.actual

          if (element.tag === 'Rest') {
            cursor += typeName === 'measure' ? beatsPerMeasure : beats
            longestVoice = Math.max(longestVoice, cursor)
            continue
          }

          // A grace note is struck a little before the beat it decorates and
          // takes no time of its own: the cursor stays where it is, or every
          // note after an acciaccatura arrives a quaver late.
          const grace = GRACE_TAGS.some((tag) => new RegExp(`<${tag}\\s*/>`).test(element.body))
          const innermost = tuplets.at(-1)
          const written: WrittenNote = {
            value: VALUES[typeName] ?? 'quarter',
            dots,
            ...(innermost ? { tuplet: innermost } : {}),
          }

          // A chord: every <Note> inside it starts together.
          for (const note of children(element.body, ['Note'])) {
            const pitch = num(note.body, 'pitch')
            if (pitch === undefined) continue
            const tpc = num(note.body, 'tpc')
            const spelling = tpc !== undefined ? spellingFromTpc(tpc) : null
            const fingerText = inner(note.body, 'Fingering')
              ? inner(inner(note.body, 'Fingering')!, 'text')?.trim()
              : undefined
            const finger = fingerText && /^[1-5]$/.test(fingerText) ? Number(fingerText) : undefined

            const startQ = grace
              ? Math.max(0, measureStartQ + cursor - GRACE_Q)
              : measureStartQ + cursor
            const durationQ = grace ? GRACE_Q : Math.max(0.0625, beats)

            // A tie is one note written as two. Its second half carries a
            // `<prev>` pointing back; the first half a `<next>` pointing on.
            // MuseScore 3 and 4 both write the tie as a spanner inside the
            // note, which is why matching `<Tie>` at the voice level found
            // nothing and every tied note was struck twice.
            const tie = /<Spanner\s+type="Tie">([\s\S]*?)<\/Spanner>/.exec(note.body)?.[1] ?? ''
            const continues = /<prev>/.test(tie)
            const starts = /<next>/.test(tie)
            if (continues) {
              const held = tied.get(pitch)
              if (held) {
                const index = notes.lastIndexOf(held)
                if (index >= 0) {
                  const extended: Parsed = { ...held, durationQ: startQ + durationQ - held.startQ }
                  notes[index] = extended
                  if (starts) tied.set(pitch, extended)
                  else tied.delete(pitch)
                  continue
                }
              }
            }

            const parsed: Parsed = {
              note: pitch,
              velocity: velocityForDynamic(dynamic),
              startMs: 0,
              durationMs: 0,
              startQ,
              durationQ,
              hand: hand ?? inferHand(pitch),
              role: 'keyboard',
              written,
              ...(spelling ? { spelling } : {}),
              ...(grace ? { grace: true } : {}),
              ...(finger ? { finger } : {}),
              ...(dynamic ? { dynamic } : {}),
            }
            notes.push(parsed)
            if (starts) tied.set(pitch, parsed)
          }
          if (!grace) {
            cursor += beats
            longestVoice = Math.max(longestVoice, cursor)
          }
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
      const durationQ = Math.max(longestVoice, measureBeats)

      const known = bars[index]
      bars[index] = {
        durationQ: Math.max(known?.durationQ ?? 0, durationQ),
        beats: timeSignature.beats,
        beatType: timeSignature.beatType,
      }
      measureStartQ += durationQ
    }

    // Lift the notes under any octave line onto the pitch they sound at, so
    // everything downstream — the keys, the staff, the fingering, playback —
    // reads one truth rather than each having to know about notation.
    if (octaves.length > 0) {
      for (let i = staffFirstNote; i < notes.length; i++) {
        const note = notes[i]!
        const span = octaves.find((o) => note.startQ >= o.fromQ && note.startQ <= o.toQ)
        if (span) notes[i] = { ...note, note: note.note + span.semitones }
      }
    }
  }

  if (notes.length === 0) return null

  const toMs = clock(tempos)
  const timed: SongNote[] = notes.map((note) => ({
    ...note,
    startMs: toMs(note.startQ),
    durationMs: Math.max(30, toMs(note.startQ + note.durationQ) - toMs(note.startQ)),
  }))

  const measureList: Omit<SongMeasure, 'number'>[] = []
  let atQ = 0
  for (const bar of bars) {
    measureList.push({
      startMs: toMs(atQ),
      durationMs: toMs(atQ + bar.durationQ) - toMs(atQ),
      startQ: atQ,
      durationQ: bar.durationQ,
      beats: bar.beats,
      beatType: bar.beatType,
      quarterMs: 60000 / bpmAt(tempos, atQ),
    })
    atQ += bar.durationQ
  }

  const pedal: PedalSpan[] = pedalsQ.map((span) => ({
    startMs: toMs(span.fromQ),
    endMs: toMs(span.toQ),
  }))
  const chords: ChordSymbol[] = chordsQ.map((chord) => ({
    startQ: chord.startQ,
    startMs: toMs(chord.startQ),
    text: chord.text,
    source: 'score',
  }))

  const key: DetectedKey | null =
    fifths !== null
      ? (() => {
          const chosen = mode ?? modeForFifths(timed, fifths)
          return {
            fifths,
            mode: chosen,
            pitchClass: tonicForFifths(fifths, chosen),
            declared: true,
          }
        })()
      : null

  const sounding = new Set(staves.map(([, id]) => Number(id)))
  const named = [
    ...new Set(
      parts
        .filter((part) => part.staffIds.some((id) => sounding.has(id)))
        .map((part) => part.name)
        .filter((name) => name.length > 0),
    ),
  ]

  const first = bars[0]
  return buildSong({
    id: `musescore:${title}:${Date.now()}`,
    title,
    bpm: tempos[0]?.bpm ?? 100,
    beatsPerMeasure: first ? (first.beats * 4) / first.beatType : beatsPerMeasure,
    timeSignature: first ? { beats: first.beats, beatType: first.beatType } : timeSignature,
    notes: timed,
    source: 'musescore',
    // Read from the score only where one part owns two staves. Anywhere else
    // the hand came from pitch, and the library has to say so rather than
    // claim the score decided it.
    handsInferred: guessedAHand || staves.length < 2,
    key,
    pedal,
    chords,
    measures: numberMeasures(measureList),
    rhythmFromScore: true,
    parts: named.length > 0 ? named : ['Piano'],
  })
}

/** The tempo in force at a point, in crotchets per minute. */
function bpmAt(tempos: readonly { atQ: number; bpm: number }[], atQ: number): number {
  let bpm = tempos[0]?.bpm ?? 100
  for (const mark of tempos) if (mark.atQ <= atQ + 1e-9) bpm = mark.bpm
  return bpm > 0 ? bpm : 100
}

/**
 * Crotchets into milliseconds, tempo mark by tempo mark.
 *
 * The marks may have been read staff by staff rather than in time order, so
 * they are sorted first; a mark at the same point as another is the later
 * one read.
 */
function clock(tempos: readonly { atQ: number; bpm: number }[]): (quarters: number) => number {
  const marks = [...tempos].filter((mark) => mark.bpm > 0).sort((a, b) => a.atQ - b.atQ)
  const initial = marks[0]?.bpm ?? 100
  return (quarters: number) => {
    let ms = 0
    let atQ = 0
    let bpm = initial
    for (const mark of marks) {
      if (mark.atQ >= quarters) break
      if (mark.atQ > atQ) {
        ms += (mark.atQ - atQ) * (60000 / bpm)
        atQ = mark.atQ
      }
      bpm = mark.bpm
    }
    return ms + (quarters - atQ) * (60000 / bpm)
  }
}
