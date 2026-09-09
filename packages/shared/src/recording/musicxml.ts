import { spellInKey, normalisePitchClass } from '../music/pitch.js'
import { staffPlacement } from '../music/staff.js'
import type { DetectedKey } from '../songs/key-of.js'
import type { PedalSpan } from '../songs/song.js'
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
 *
 * The key is the caller's to state, for the same reason the metre is not
 * inferred: a wrong key written confidently is worse than no key, because the
 * reader has no way to tell. The app knows what you were practising and says
 * so. Nobody says, and it is C major with sharps — which claims nothing.
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

function pitchXml(note: number, key: DetectedKey | null): string {
  // Spelled in the key, so a recording of something in F major writes B♭ and
  // not A♯. `staffPlacement` puts the octave on the *letter*, which is what
  // MusicXML wants: B♯3 is step B, alter 1, octave 3.
  const spelling = key ? spellInKey(normalisePitchClass(note), key.fifths, key.mode) : null
  const { letter, accidental, octave } = staffPlacement(note, spelling)
  return [
    '<pitch>',
    `<step>${letter}</step>`,
    accidental !== 0 ? `<alter>${accidental}</alter>` : '',
    `<octave>${octave}</octave>`,
    '</pitch>',
  ].join('')
}

interface Group {
  start: number
  duration: number
  notes: RecordedNote[]
}

/**
 * Cuts each group where the next one begins.
 *
 * This is the one-voice-per-staff policy, actually applied. It used to be
 * applied to the wrong note: a group was written at its full length, the cursor
 * moved past everything underneath it, and any note that began *and ended*
 * inside it had nowhere left to go — so it was skipped, silently. Hold a chord,
 * play a melody over it, and the melody was simply not in the file.
 *
 * Cutting the held note instead is what the documentation always said happens,
 * and it cannot lose anything: every group keeps at least the span up to the
 * next onset, which is at least one division.
 */
function cutAtNextOnset(groups: Group[]): Group[] {
  return groups.map((group, index) => {
    const next = groups[index + 1]
    return next ? { ...group, duration: Math.min(group.duration, next.start - group.start) } : group
  })
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
  return cutAtNextOnset([...byStart.values()].sort((a, b) => a.start - b.start))
}

/** One staff's worth of a measure: notes where there are notes, rests elsewhere. */
function voiceXml(
  groups: Group[],
  from: number,
  voice: number,
  staff: number,
  key: DetectedKey | null,
): string {
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

    /*
     * A note held across a bar line is one note, tied.
     *
     * The remainder was already written into the next measure — the bar totals
     * came out right and the notation was still wrong, because a tie is what
     * says "keep holding" and without one the player strikes the note again on
     * the downbeat. Every other tie in this file joins two pieces of one span
     * inside a bar; these two flags are the same idea across the line.
     */
    const startedBefore = group.start < from
    const continuesPast = group.start + group.duration > to

    const parts = writable(available)
    let carried = 0
    parts.forEach(([value, type, dotted], index) => {
      const tieStart = index < parts.length - 1 || continuesPast
      const tieStop = index > 0 || startedBefore
      group.notes.forEach((note, chordIndex) => {
        out.push(
          '<note>' +
            (chordIndex > 0 ? '<chord/>' : '') +
            pitchXml(note.note, key) +
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
  /**
   * The key to write the performance in.
   *
   * Stated, never guessed. The app knows what material you were working on and
   * passes its key; a free performance with nobody to ask is written in C major
   * with sharps, which is what "no key was declared" looks like on a page.
   */
  readonly key?: DetectedKey | null
  /** When the sustain pedal was down, marked under the bass staff. */
  readonly pedal?: readonly PedalSpan[]
}

/**
 * The pedal marks that fall inside one measure, in the order they happen.
 *
 * A direction is written at the measure's own starting point and carries an
 * `<offset>` in divisions, which is how MusicXML places something between two
 * notes without giving it a duration of its own.
 */
function pedalXml(
  spans: readonly PedalSpan[],
  divisionsPerMs: number,
  from: number,
): { at: number; type: 'start' | 'stop' }[] {
  const marks: { at: number; type: 'start' | 'stop' }[] = []
  for (const span of spans) {
    const down = Math.round(span.startMs * divisionsPerMs)
    const up = Math.round(span.endMs * divisionsPerMs)
    if (up <= down) continue
    if (down >= from && down < from + MEASURE) marks.push({ at: down, type: 'start' })
    // A release lands on the closing edge of the bar it belonged to rather than
    // the opening edge of the next. Otherwise a pedal let go exactly on a bar
    // line asks for a bar after the last one, does not get it, and its mark is
    // dropped — leaving a pedal line that opens and never closes.
    if (up > from && up <= from + MEASURE) marks.push({ at: up, type: 'stop' })
  }
  // A release before a press at the same instant: the old span has to close
  // before the new one opens, or a reader sees two overlapping pedal lines.
  return marks.sort((a, b) => a.at - b.at || (a.type === 'stop' ? -1 : 1))
}

export function writeMusicXml(
  notes: readonly RecordedNote[],
  options: MusicXmlOptions = {},
): string {
  const bpm = options.bpm && options.bpm > 0 ? options.bpm : 100
  const key = options.key ?? null
  const divisionsPerMs = (DIVISIONS * bpm) / 60000

  const treble = groupChords(
    notes.filter((note) => staffPlacement(note.note).staff === 'treble'),
    divisionsPerMs,
  )
  const bass = groupChords(
    notes.filter((note) => staffPlacement(note.note).staff === 'bass'),
    divisionsPerMs,
  )

  const pedal = options.pedal ?? []
  const end = Math.max(
    ...[...treble, ...bass].map((group) => group.start + group.duration),
    // A pedal still down after the last note keeps the piece going: a mark that
    // opens and never closes is the one thing a reader cannot resolve.
    ...pedal.map((span) => Math.round(span.endMs * divisionsPerMs)),
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
            `<key><fifths>${key?.fifths ?? 0}</fifths><mode>${key?.mode ?? 'major'}</mode></key>` +
            `<time><beats>${BEATS_PER_MEASURE}</beats><beat-type>4</beat-type></time>` +
            '<staves>2</staves>' +
            '<clef number="1"><sign>G</sign><line>2</line></clef>' +
            '<clef number="2"><sign>F</sign><line>4</line></clef>' +
            '</attributes>' +
            `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${Math.round(bpm)}</per-minute></metronome></direction-type><sound tempo="${Math.round(bpm)}"/></direction>`
        : '',
      ...pedalXml(pedal, divisionsPerMs, from).map(
        (mark) =>
          `<direction placement="below"><direction-type><pedal type="${mark.type}" line="yes"/></direction-type>` +
          `<offset>${mark.at - from}</offset><staff>2</staff></direction>`,
      ),
      voiceXml(within(treble), from, 1, 1, key),
      `<backup><duration>${MEASURE}</duration></backup>`,
      voiceXml(within(bass), from, 2, 2, key),
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
