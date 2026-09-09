import {
  buildSong,
  inferHand,
  modeForFifths,
  numberMeasures,
  spellingName,
  tonicForFifths,
  valueQuarters,
  velocityForDynamic,
  type Accidental,
  type ChordSymbol,
  type DetectedKey,
  type Hand,
  type NoteValue,
  type PartRole,
  type PedalSpan,
  type Song,
  type SongMeasure,
  type SongNote,
  type Spelling,
  type WrittenNote,
} from '@sonara/shared'

/**
 * Reads MusicXML into a song.
 *
 * Scanned rather than DOM-parsed, so it runs the same in a browser, in Node and
 * in a test. MusicXML is verbose but extremely regular, and the elements that
 * matter here — note, backup, forward, attributes — never nest inside one
 * another, which is what makes scanning them in document order safe.
 *
 * The things that make notation different from a note list, and that this has
 * to handle rather than ignore:
 *
 *  - Every `<part>` starts again from the beginning of the piece. Reading the
 *    measures in file order, as this once did, played a voice-and-piano score
 *    as the voice part followed by the piano part.
 *  - `<chord/>` means "at the same time as the note before", not "after it", so
 *    a chord must not advance the cursor.
 *  - `<backup>` rewinds the cursor so a second voice or staff can be written
 *    over the same bar. Ignore it and the left hand lands after the right
 *    instead of underneath it.
 *  - A tie is one note written as two. Emitting both gives a repeated note
 *    where the music holds.
 *  - Time is counted in the score's own divisions and turned into
 *    milliseconds at the end through the tempo marks, wherever in the piece
 *    they fall. A metronome mark in minims or dotted crotchets is converted to
 *    crotchets first; read as crotchets, a 6/8 piece marked ♩.=80 plays at
 *    two thirds of its speed.
 */

const STEP_SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const LETTER_INDEX: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 }

/** MusicXML note types onto the values the engraver draws. */
const TYPE_VALUES: Record<string, NoteValue> = {
  maxima: 'whole',
  long: 'whole',
  breve: 'whole',
  whole: 'whole',
  half: 'half',
  quarter: 'quarter',
  eighth: 'eighth',
  '16th': 'sixteenth',
  '32nd': 'thirty-second',
  '64th': 'thirty-second',
  '128th': 'thirty-second',
  '256th': 'thirty-second',
}

/** Kinds a `<harmony>` names, as the suffix a lead sheet prints. */
const KIND_SUFFIX: Record<string, string> = {
  major: '',
  minor: 'm',
  augmented: '+',
  diminished: '°',
  dominant: '7',
  'major-seventh': 'maj7',
  'minor-seventh': 'm7',
  'diminished-seventh': '°7',
  'augmented-seventh': '+7',
  'half-diminished': 'ø7',
  'major-minor': 'm(maj7)',
  'major-sixth': '6',
  'minor-sixth': 'm6',
  'dominant-ninth': '9',
  'major-ninth': 'maj9',
  'minor-ninth': 'm9',
  'dominant-11th': '11',
  'dominant-13th': '13',
  'suspended-second': 'sus2',
  'suspended-fourth': 'sus4',
  power: '5',
  none: '',
}

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

const flag = (xml: string, tag: string): boolean =>
  new RegExp(`<${tag}(?:\\s[^>]*)?/>|<${tag}(?:\\s[^>]*)?>`).test(xml)

interface PartInfo {
  readonly id: string
  readonly name: string
  /** General MIDI program, zero-based, where the part list gives one. */
  readonly program?: number
}

/** `<part-list>`: the names and instruments the score declares. */
function readPartList(text: string): PartInfo[] {
  const list = inner(text, 'part-list') ?? ''
  return [...list.matchAll(/<score-part\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/score-part>/g)].map(
    ([, id = '', body = '']) => {
      const program = num(body, 'midi-program')
      return {
        id,
        name: (inner(body, 'part-name') ?? '').replace(/<[^>]*>/g, '').trim(),
        ...(program !== undefined ? { program: program - 1 } : {}),
      }
    },
  )
}

/**
 * Which part is the piano.
 *
 * The one the part list calls a piano or a keyboard, else the one it gives a
 * keyboard program, else the one written on two staves, else the first. The
 * others are the rest of the room: heard, and not put under the fingers.
 */
function chooseLead(
  parts: readonly PartInfo[],
  staves: ReadonlyMap<string, number>,
): string | null {
  if (parts.length === 0) return null
  const named = parts.find((part) =>
    /piano|keyboard|klavier|clavier|harpsichord|organ|celest|rhodes|synth/i.test(part.name),
  )
  if (named) return named.id
  const programmed = parts.find((part) => part.program !== undefined && part.program <= 23)
  if (programmed) return programmed.id
  const twoStaves = parts.find((part) => (staves.get(part.id) ?? 1) >= 2)
  if (twoStaves) return twoStaves.id
  return parts[0]!.id
}

interface Parsed extends SongNote {
  readonly startQ: number
  readonly durationQ: number
}

export function importMusicXml(text: string, fallbackTitle: string): Song | null {
  // Compressed .mxl is a zip; it needs unpacking before it gets here.
  if (!/<score-partwise/.test(text)) return null

  const title =
    inner(text, 'work-title')?.trim() || inner(text, 'movement-title')?.trim() || fallbackTitle

  const partList = readPartList(text)
  const parts = [...text.matchAll(/<part\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/part>/g)].map(
    ([, id = '', body = '']) => ({ id, body }),
  )
  if (parts.length === 0) return null

  const stavesOf = new Map<string, number>()
  for (const part of parts) stavesOf.set(part.id, num(part.body, 'staves') ?? 1)
  const lead = chooseLead(
    partList.length > 0 ? partList : parts.map((part) => ({ id: part.id, name: '' })),
    stavesOf,
  )

  let fifths: number | null = null
  let mode: 'major' | 'minor' | null = null
  /** Tempo marks, in crotchets from the start, from whichever part carried them. */
  const tempos: { atQ: number; bpm: number }[] = []
  /** Each bar's length and metre, longest of any part that has it. */
  const bars: { durationQ: number; beats: number; beatType: number }[] = []
  const notes: Parsed[] = []
  const pedalsQ: { fromQ: number; toQ: number }[] = []
  const chordsQ: { startQ: number; text: string }[] = []
  let leadNamesStaves = false
  let tupletCounter = 0

  for (const part of parts) {
    let divisions = 1
    let beats = 4
    let beatType = 4
    let measureStartQ = 0
    // Both are in force until changed, so they are read as state rather than as
    // a property of the note that happens to carry the marking.
    let dynamic: string | undefined
    let pedalFromQ: number | null = null
    /** Open tied notes, so the continuation extends rather than restrikes. */
    const tied = new Map<string, Parsed>()
    /** The tuplet each voice is inside, if any. */
    const tuplets = new Map<string, { id: number; actual: number; normal: number }>()
    const role: PartRole = part.id === lead ? 'keyboard' : 'accompaniment'

    const measures = [...part.body.matchAll(/<measure\b[^>]*>([\s\S]*?)<\/measure>/g)]
    for (const [index, [, body = '']] of measures.entries()) {
      let cursor = 0
      let previousStart = 0
      let longest = 0

      const blocks = body.matchAll(
        /<(note|backup|forward|attributes|direction|sound|harmony)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g,
      )

      for (const block of blocks) {
        const tag = block[1]!
        const attributes = block[2] ?? ''
        const content = block[3] ?? ''

        if (tag === 'attributes') {
          // Notation always states its key. Nothing has to be guessed here —
          // except the mode, which the format leaves optional.
          const declared = num(content, 'fifths')
          if (declared !== undefined && fifths === null) {
            fifths = declared
            const written = inner(content, 'mode')?.trim().toLowerCase()
            mode = written === 'minor' ? 'minor' : written === 'major' ? 'major' : null
          }
          divisions = num(content, 'divisions') ?? divisions
          const newBeats = num(content, 'beats')
          const newBeatType = num(content, 'beat-type')
          if (newBeats && newBeatType) {
            beats = newBeats
            beatType = newBeatType
          }
          continue
        }

        if (tag === 'harmony') {
          const step = inner(content, 'root-step')?.trim()
          if (step && LETTER_INDEX[step] !== undefined) {
            const alter = Math.max(-2, Math.min(2, Math.round(num(content, 'root-alter') ?? 0)))
            const kind = inner(content, 'kind')?.trim() ?? 'major'
            const kindText = /text="([^"]*)"/.exec(content)?.[1]
            const bassStep = inner(content, 'bass-step')?.trim()
            const bassAlter = Math.max(-2, Math.min(2, Math.round(num(content, 'bass-alter') ?? 0)))
            const root = spellingName({
              letter: LETTER_INDEX[step]!,
              accidental: alter as Accidental,
            })
            const suffix = kindText ?? KIND_SUFFIX[kind] ?? ''
            const bass =
              bassStep && LETTER_INDEX[bassStep] !== undefined
                ? `/${spellingName({ letter: LETTER_INDEX[bassStep]!, accidental: bassAlter as Accidental })}`
                : ''
            chordsQ.push({
              startQ: measureStartQ + cursor / divisions,
              text: `${root}${suffix}${bass}`,
            })
          }
          continue
        }

        if (tag === 'direction' || tag === 'sound') {
          // <dynamics><mf/> — the marking is the element name, not its text.
          const marking = /<dynamics(?:\s[^>]*)?>\s*<([a-z]+)\s*\/>/.exec(content)?.[1]
          if (marking) dynamic = marking

          // Pedal is a spanner: one direction starts it, another stops it.
          const pedalType = /<pedal\b[^>]*type="([a-z]+)"/.exec(content)?.[1]
          if (pedalType && role === 'keyboard') {
            const at = measureStartQ + cursor / divisions
            if (pedalType === 'start' && pedalFromQ === null) pedalFromQ = at
            else if ((pedalType === 'stop' || pedalType === 'discontinue') && pedalFromQ !== null) {
              pedalsQ.push({ fromQ: pedalFromQ, toQ: at })
              pedalFromQ = null
            }
          }

          // `<sound tempo>` is always in crotchets. A `<metronome>` mark is in
          // whatever note it names, and has to be converted.
          const sound = Number(/tempo="([\d.]+)"/.exec(attributes + content)?.[1] ?? '')
          let bpm = sound > 0 ? sound : 0
          if (!bpm) {
            const perMinute = num(content, 'per-minute')
            const unit = inner(content, 'beat-unit')?.trim()
            if (perMinute && perMinute > 0) {
              const unitValue = unit ? TYPE_VALUES[unit] : undefined
              const dots = (content.match(/<beat-unit-dot\s*\/>/g) ?? []).length
              bpm = perMinute * (unitValue ? valueQuarters(unitValue, dots) : 1)
            }
          }
          if (bpm > 0) tempos.push({ atQ: measureStartQ + cursor / divisions, bpm })
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
        const isGrace = flag(content, 'grace')
        const start = isChord ? previousStart : cursor
        const voice = inner(content, 'voice')?.trim() ?? '1'

        if (flag(content, 'rest')) {
          cursor = start + duration
          longest = Math.max(longest, cursor)
          continue
        }

        // Notation writes drums as <unpitched>: a line on the staff, not a pitch.
        const unpitched = inner(content, 'unpitched')
        const pitch = inner(content, 'pitch') ?? unpitched
        if (!pitch) {
          if (!isChord) cursor = start + duration
          continue
        }

        const step = (inner(pitch, 'step') ?? inner(pitch, 'display-step'))?.trim() ?? 'C'
        const alter = Math.max(-2, Math.min(2, Math.round(num(pitch, 'alter') ?? 0))) as Accidental
        const octave = num(pitch, 'octave') ?? num(pitch, 'display-octave') ?? 4
        const midi = (octave + 1) * 12 + (STEP_SEMITONES[step] ?? 0) + alter
        const spelling: Spelling = { letter: LETTER_INDEX[step] ?? 0, accidental: alter }

        const staff = num(content, 'staff')
        if (role === 'keyboard' && staff !== undefined) leadNamesStaves = true
        const hand: Hand = staff === 2 ? 'left' : staff === 1 ? 'right' : inferHand(midi)

        const startQ = isGrace
          ? Math.max(0, measureStartQ + start / divisions - GRACE_Q)
          : measureStartQ + start / divisions
        const durationQ = isGrace ? GRACE_Q : Math.max(0.0625, duration / divisions)

        // The written value, tuplet included. A tuplet's notes carry their
        // ratio individually; the bracket over them is one thing, so every
        // note between a `start` and a `stop` shares an id.
        const typeName = inner(content, 'type')?.trim()
        const actual = num(content, 'actual-notes')
        const normal = num(content, 'normal-notes')
        const tupletKey = `${voice}`
        if (
          /<tuplet\b[^>]*type="start"/.test(content) ||
          (actual && normal && !tuplets.has(tupletKey))
        ) {
          if (actual && normal) tuplets.set(tupletKey, { id: ++tupletCounter, actual, normal })
        }
        const tuplet = actual && normal ? tuplets.get(tupletKey) : undefined
        const written: WrittenNote | undefined = typeName
          ? {
              value: TYPE_VALUES[typeName] ?? 'quarter',
              dots: (content.match(/<dot\s*\/>/g) ?? []).length,
              ...(tuplet ? { tuplet } : {}),
            }
          : undefined
        if (/<tuplet\b[^>]*type="stop"/.test(content) || !(actual && normal))
          tuplets.delete(tupletKey)

        const tieKey = `${staff ?? 0}:${voice}:${midi}`
        if (/<tie[^>]*type="stop"/.test(content)) {
          const held = tied.get(tieKey)
          if (held) {
            // Replace the held note with a longer one rather than adding a second.
            const index = notes.lastIndexOf(held)
            if (index >= 0) {
              const extended: Parsed = { ...held, durationQ: startQ + durationQ - held.startQ }
              notes[index] = extended
              if (/<tie[^>]*type="start"/.test(content)) tied.set(tieKey, extended)
              else tied.delete(tieKey)
            }
            if (!isChord && !isGrace) {
              previousStart = start
              cursor = start + duration
              longest = Math.max(longest, cursor)
            }
            continue
          }
        }

        // <notations><technical><fingering> — the one place a file can tell us
        // which finger to use. Worth reading precisely because it cannot be
        // recovered from anywhere else.
        const fingerText = inner(content, 'fingering')?.trim()
        const finger = fingerText && /^[1-5]$/.test(fingerText) ? Number(fingerText) : undefined

        const note: Parsed = {
          note: midi,
          velocity: velocityForDynamic(dynamic),
          startMs: 0,
          durationMs: 0,
          startQ,
          durationQ,
          hand,
          role: unpitched ? 'percussion' : role,
          spelling,
          ...(written ? { written } : {}),
          ...(isGrace ? { grace: true } : {}),
          ...(finger ? { finger } : {}),
          ...(dynamic ? { dynamic } : {}),
        }
        notes.push(note)
        if (/<tie[^>]*type="start"/.test(content)) tied.set(tieKey, note)

        if (!isChord && !isGrace) {
          previousStart = start
          cursor = start + duration
        }
        if (!isGrace) longest = Math.max(longest, start + duration)
      }

      // A bar is as long as its longest voice says, and a pickup bar is as
      // short as its content. Other parts may disagree by a rest they left
      // out; the longest reading wins so nothing is cut off.
      const durationQ = longest / divisions
      const known = bars[index]
      bars[index] = {
        durationQ: Math.max(known?.durationQ ?? 0, durationQ),
        beats,
        beatType,
      }
      measureStartQ += durationQ
    }
  }

  if (notes.length === 0) return null

  // From crotchets to milliseconds, through every tempo mark in order.
  const toMs = clock(tempos)

  const measureList: Omit<SongMeasure, 'number'>[] = []
  let atQ = 0
  for (const bar of bars) {
    const durationQ = bar.durationQ > 0 ? bar.durationQ : (bar.beats * 4) / bar.beatType
    measureList.push({
      startMs: toMs(atQ),
      durationMs: toMs(atQ + durationQ) - toMs(atQ),
      startQ: atQ,
      durationQ,
      beats: bar.beats,
      beatType: bar.beatType,
      quarterMs: 60000 / bpmAt(tempos, atQ),
    })
    atQ += durationQ
  }

  const timed: SongNote[] = notes.map((note) => ({
    ...note,
    startMs: toMs(note.startQ),
    durationMs: Math.max(30, toMs(note.startQ + note.durationQ) - toMs(note.startQ)),
  }))
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

  const first = bars[0] ?? { beats: 4, beatType: 4 }
  const names = partList.map((part) => part.name).filter((name) => name.length > 0)
  const hasDrums = timed.some((note) => note.role === 'percussion')

  return buildSong({
    id: `musicxml:${title}:${Date.now()}`,
    title,
    bpm: tempos[0]?.bpm ?? 100,
    beatsPerMeasure: (first.beats * 4) / first.beatType,
    timeSignature: { beats: first.beats, beatType: first.beatType },
    notes: timed,
    source: 'musicxml',
    handsInferred: !leadNamesStaves,
    parts: names.length > 0 ? names : [...new Set([hasDrums ? 'Drums' : 'Piano', 'Piano'])],
    key,
    pedal,
    chords,
    measures: numberMeasures(measureList),
    rhythmFromScore: true,
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
 * A change of tempo halfway through a piece changes the length of every
 * crotchet after it and none before it, so the conversion walks the marks in
 * order and adds up each stretch at its own speed. One tempo for the whole
 * piece, which is what this replaced, put every note after a change in the
 * wrong place.
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
