import { staffPlacement } from '../music/staff.js'
import type { RecordedNote } from './performance.js'

/**
 * The performance as notation.
 *
 * MIDI keeps what was played; this keeps what it would be *written* as, and the
 * two are not the same thing. Nobody plays a quarter note 500ms long, so every
 * note has to be rounded onto a grid before it can be drawn — and that rounding
 * is the whole difficulty of the format. What comes out is readable notation of
 * an approximation, which is what a notation program wants; MIDI is the export
 * for anyone who needs the performance itself.
 *
 * Two simplifications, both deliberate and both visible in the output:
 * one voice per staff, so a note still held when the next one starts is cut
 * short rather than given a voice of its own; and a fixed 4/4, because
 * inferring a time signature from a free performance guesses more than it
 * knows.
 */

/** Divisions per quarter note. Four gives sixteenth-note resolution. */
const DIVISIONS = 4
const BEATS_PER_MEASURE = 4
const MEASURE = DIVISIONS * BEATS_PER_MEASURE

/** Written durations, longest first, as [divisions, type, dotted]. */
const WRITTEN: readonly [number, string, boolean][] = [
  [16, 'whole', false],
  [12, 'half', true],
  [8, 'half', false],
  [6, 'quarter', true],
  [4, 'quarter', false],
  [3, 'eighth', true],
  [2, 'eighth', false],
  [1, '16th', false],
]

/**
 * Breaks a span into durations that can actually be written.
 *
 * Five sixteenths is not a note; it is a quarter tied to a sixteenth. Greedy
 * from the longest value down, which gives the reading a musician expects.
 */
function writable(duration: number): [number, string, boolean][] {
  const parts: [number, string, boolean][] = []
  let left = duration
  while (left > 0) {
    const part = WRITTEN.find(([value]) => value <= left) ?? WRITTEN[WRITTEN.length - 1]!
    parts.push(part)
    left -= part[0]
  }
  return parts
}

const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;')

function pitchXml(note: number): string {
  const { letter, sharp, octave } = staffPlacement(note)
  return [
    '<pitch>',
    `<step>${letter}</step>`,
    sharp ? '<alter>1</alter>' : '',
    `<octave>${octave}</octave>`,
    '</pitch>',
  ].join('')
}

interface Group {
  start: number
  duration: number
  notes: RecordedNote[]
}

/** Notes struck together become one chord; a grid position is close enough. */
function groupChords(notes: readonly RecordedNote[], divisionsPerMs: number): Group[] {
  const byStart = new Map<number, Group>()
  for (const note of notes) {
    const start = Math.round(note.startMs * divisionsPerMs)
    const duration = Math.max(1, Math.round(note.durationMs * divisionsPerMs))
    const group = byStart.get(start)
    if (group) {
      group.notes.push(note)
      group.duration = Math.max(group.duration, duration)
    } else {
      byStart.set(start, { start, duration, notes: [note] })
    }
  }
  return [...byStart.values()].sort((a, b) => a.start - b.start)
}

/** One staff's worth of a measure: notes where there are notes, rests elsewhere. */
function voiceXml(groups: Group[], from: number, voice: number, staff: number): string {
  const out: string[] = []
  let at = from
  const to = from + MEASURE

  const rest = (duration: number) => {
    for (const [value, type, dotted] of writable(duration)) {
      out.push(
        `<note><rest/><duration>${value}</duration><voice>${voice}</voice>` +
          `<type>${type}</type>${dotted ? '<dot/>' : ''}<staff>${staff}</staff></note>`,
      )
    }
  }

  for (const group of groups) {
    if (group.start >= to) break
    if (group.start > at) rest(group.start - at)
    // One voice per staff: a note still sounding when the next arrives is cut
    // to where the next begins rather than given a voice of its own.
    const start = Math.max(group.start, at)
    const available = Math.min(group.duration - (start - group.start), to - start)
    if (available <= 0) continue

    const parts = writable(available)
    let carried = 0
    parts.forEach(([value, type, dotted], index) => {
      const tieStart = index < parts.length - 1
      const tieStop = index > 0
      group.notes.forEach((note, chordIndex) => {
        out.push(
          '<note>' +
            (chordIndex > 0 ? '<chord/>' : '') +
            pitchXml(note.note) +
            `<duration>${value}</duration>` +
            (tieStop ? '<tie type="stop"/>' : '') +
            (tieStart ? '<tie type="start"/>' : '') +
            `<voice>${voice}</voice><type>${type}</type>${dotted ? '<dot/>' : ''}` +
            `<staff>${staff}</staff>` +
            (tieStop || tieStart
              ? '<notations>' +
                (tieStop ? '<tied type="stop"/>' : '') +
                (tieStart ? '<tied type="start"/>' : '') +
                '</notations>'
              : '') +
            '</note>',
        )
      })
      carried += value
    })
    at = start + carried
  }

  if (at < to) rest(to - at)
  return out.join('')
}

export interface MusicXmlOptions {
  readonly bpm?: number
  readonly title?: string
}

export function writeMusicXml(
  notes: readonly RecordedNote[],
  options: MusicXmlOptions = {},
): string {
  const bpm = options.bpm && options.bpm > 0 ? options.bpm : 100
  const divisionsPerMs = (DIVISIONS * bpm) / 60000

  const treble = groupChords(
    notes.filter((note) => staffPlacement(note.note).staff === 'treble'),
    divisionsPerMs,
  )
  const bass = groupChords(
    notes.filter((note) => staffPlacement(note.note).staff === 'bass'),
    divisionsPerMs,
  )

  const end = Math.max(
    ...[...treble, ...bass].map((group) => group.start + group.duration),
    MEASURE,
  )
  const measures = Math.max(1, Math.ceil(end / MEASURE))

  const body: string[] = []
  for (let index = 0; index < measures; index++) {
    const from = index * MEASURE
    const within = (groups: Group[]) =>
      groups.filter((group) => group.start + group.duration > from && group.start < from + MEASURE)

    body.push(
      `<measure number="${index + 1}">`,
      index === 0
        ? '<attributes>' +
            `<divisions>${DIVISIONS}</divisions>` +
            '<key><fifths>0</fifths></key>' +
            `<time><beats>${BEATS_PER_MEASURE}</beats><beat-type>4</beat-type></time>` +
            '<staves>2</staves>' +
            '<clef number="1"><sign>G</sign><line>2</line></clef>' +
            '<clef number="2"><sign>F</sign><line>4</line></clef>' +
            '</attributes>' +
            `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${Math.round(bpm)}</per-minute></metronome></direction-type><sound tempo="${Math.round(bpm)}"/></direction>`
        : '',
      voiceXml(within(treble), from, 1, 1),
      `<backup><duration>${MEASURE}</duration></backup>`,
      voiceXml(within(bass), from, 2, 2),
      '</measure>',
    )
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
    '<score-partwise version="4.0">',
    `<work><work-title>${escape(options.title ?? 'Sonara recording')}</work-title></work>`,
    '<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>',
    '<part id="P1">',
    ...body,
    '</part>',
    '</score-partwise>',
  ].join('\n')
}
