import { Midi } from '@tonejs/midi'
import {
  buildSong,
  estimateKey,
  fifthsForKeyName,
  inferHand,
  numberMeasures,
  programFamily,
  roleForProgram,
  spellInKey,
  tonicForFifths,
  type DetectedKey,
  type Hand,
  type PartRole,
  type Song,
  type SongMeasure,
  type SongNote,
} from '@sonara/shared'

/**
 * Reads a Standard MIDI File into a song.
 *
 * The parsing is @tonejs/midi's, not ours. A hand-written SMF reader is a
 * well-known way to get subtly wrong answers — running status, note-on at
 * velocity zero, SysEx lengths, SMPTE division — and the one this replaced had
 * a quieter fault than any of those: it kept a single tempo and applied it to
 * the whole file, so anything with a tempo change came out with every note
 * after it in the wrong place. A library that has read a million files does
 * not have that bug, and gets note times back in seconds with the tempo map
 * already applied.
 *
 * What is left here is the part that is ours: deciding what each track is for,
 * reading the key the way the file means it, laying out the bars from the
 * tempo and metre maps, and spelling the notes — which a MIDI file cannot do
 * and a staff cannot do without.
 */
export function importMidi(bytes: Uint8Array, title: string): Song | null {
  let midi: Midi
  try {
    midi = new Midi(bytes)
  } catch {
    // Not a MIDI file, or one too damaged to read. Either way, say so rather
    // than return a song with nothing in it.
    return null
  }

  const tracks = midi.tracks.filter((track) => track.notes.length > 0)
  if (tracks.length === 0) return null

  // `instrument.percussion` is the library's reading of the same rule: channel
  // 10 is a kit, whatever program is set on it — and the file that prompted
  // this sets none at all.
  type Track = (typeof tracks)[number]

  const playable = (track: Track): PartRole =>
    track.instrument.percussion ? 'percussion' : roleForProgram(track.instrument.number)

  /**
   * Which instrument is the one being learned.
   *
   * An arrangement can have several keyboard-family parts — this file has a
   * piano and a rock organ — and only one of them is the part in front of the
   * player. Pianos win outright; otherwise the busiest keyboard part does. The
   * others are still keyboard-shaped, but they are somebody else in the band,
   * so they play behind rather than on the keys.
   */
  const keyboardish = tracks.filter((track) => playable(track) === 'keyboard')
  const score = (track: Track) =>
    (track.instrument.number <= 7 ? 1_000_000 : 0) + track.notes.length
  const lead = keyboardish.reduce<Track | null>(
    (best, track) => (best === null || score(track) > score(best) ? track : best),
    null,
  )
  const leadTracks = lead
    ? keyboardish.filter((track) => track.instrument.number === lead.instrument.number)
    : []

  const roleOf = (track: Track): PartRole => {
    const role = playable(track)
    // A keyboard part that is not the lead is accompaniment: audible, but not
    // notes to put fingers on.
    return role === 'keyboard' && !leadTracks.includes(track) ? 'accompaniment' : role
  }

  // Hands split across the lead instrument's own tracks, and nothing else's.
  // Pairing a piano track with an organ track would call two instruments two
  // hands, and light the wrong notes for both.
  const byTrack = leadTracks.length >= 2
  const hands = new Map<Track, Hand>(
    leadTracks.map((track, index) => [track, index === 0 ? 'right' : 'left']),
  )

  /*
   * The key, as the file means it.
   *
   * An SMF key signature is a count of sharps or flats and a major/minor
   * flag, and the library names the count by its major key: A minor arrives
   * as "C" with `minor`. Read as fifths that is right; read as a tonic name
   * it is C minor, three flats out. The flats were worse — "Bb" was not on
   * the list of names being looked up, so every flat key past F came out as C
   * major, and was stamped as declared.
   */
  const declared = midi.header.keySignatures[0]
  const declaredFifths = declared ? fifthsForKeyName(declared.key) : null
  const declaredKey: DetectedKey | null =
    declared && declaredFifths !== null
      ? {
          mode: declared.scale === 'minor' ? 'minor' : 'major',
          pitchClass: tonicForFifths(
            declaredFifths,
            declared.scale === 'minor' ? 'minor' : 'major',
          ),
          fifths: declaredFifths,
          declared: true,
        }
      : null

  const ppq = midi.header.ppq > 0 ? midi.header.ppq : 480
  const unspelled: (SongNote & { track: Track })[] = []
  for (const track of tracks) {
    const role = roleOf(track)
    for (const note of track.notes) {
      unspelled.push({
        track,
        note: note.midi,
        // The library normalises velocity to 0-1; MIDI and our engines want 1-127.
        velocity: Math.max(1, Math.round(note.velocity * 127)),
        startMs: note.time * 1000,
        durationMs: Math.max(30, note.duration * 1000),
        // Exact, from the file's own ticks: the tempo map decides when a
        // crotchet sounds, not what a crotchet is.
        startQ: note.ticks / ppq,
        durationQ: Math.max(0.0625, note.durationTicks / ppq),
        hand: byTrack ? (hands.get(track) ?? 'right') : inferHand(note.midi),
        role,
      })
    }
  }

  // Most MIDI files declare no key, and the spelling needs one before the
  // song is built — so the estimate is made here rather than left to
  // buildSong, and handed on so the song reports the same key it was
  // spelled in.
  const key = declaredKey ?? estimateKey(unspelled)
  const notes = spellNotes(unspelled, key)

  const [beats = 4, beatType = 4] = midi.header.timeSignatures[0]?.timeSignature ?? []
  const endTicks = tracks.reduce(
    (end, track) =>
      track.notes.reduce((last, note) => Math.max(last, note.ticks + note.durationTicks), end),
    0,
  )

  return buildSong({
    id: `midi:${title}:${Date.now()}`,
    title: midi.name?.trim() || title,
    bpm: midi.header.tempos[0]?.bpm ?? 100,
    // A bar of 6/8 is six eighths, which is three quarter-note beats.
    beatsPerMeasure: Math.max(1, (beats * 4) / beatType),
    timeSignature: { beats, beatType },
    notes,
    source: 'midi',
    handsInferred: !byTrack,
    key,
    measures: measuresFromHeader(midi.header, endTicks),
    parts: [
      ...new Set(
        tracks.map((track) =>
          track.instrument.percussion ? 'Drums' : programFamily(track.instrument.number),
        ),
      ),
    ],
  })
}

/**
 * Spells every pitched note in the key.
 *
 * A note a semitone from the next one in its track is a chromatic step and
 * is spelled in the direction it is going — C C♯ D, D D♭ C — which is the
 * one thing the key alone cannot decide. Percussion is not pitch and keeps
 * no spelling.
 */
function spellNotes<T extends SongNote & { track: unknown }>(
  notes: readonly T[],
  key: DetectedKey | null,
): SongNote[] {
  const fifths = key?.fifths ?? 0
  const mode = key?.mode ?? 'major'
  const byTrack = new Map<unknown, T[]>()
  for (const note of notes) {
    const list = byTrack.get(note.track) ?? []
    list.push(note)
    byTrack.set(note.track, list)
  }
  const approaches = new Map<T, 'up' | 'down' | undefined>()
  for (const list of byTrack.values()) {
    const ordered = [...list].sort((a, b) => a.startMs - b.startMs || a.note - b.note)
    for (const [index, note] of ordered.entries()) {
      const next = ordered.slice(index + 1).find((candidate) => candidate.note !== note.note)
      const interval = next ? next.note - note.note : 0
      approaches.set(note, interval === 1 ? 'up' : interval === -1 ? 'down' : undefined)
    }
  }
  return notes.map((original) => {
    const { track: _track, ...note } = original
    if (note.role === 'percussion') return note
    return {
      ...note,
      spelling: spellInKey(((note.note % 12) + 12) % 12, fifths, mode, approaches.get(original)),
    }
  })
}

/**
 * The bars of the file, from its metre and tempo maps.
 *
 * A MIDI file has no bars, only a grid it could be barred on: the time
 * signature events say how long a bar is from that tick onward, and the tempo
 * events say how long a tick is. Walking both gives every bar its own start
 * and length in time, which is what puts the bar lines back where the
 * sequencer that wrote the file had them — including after a ritardando,
 * where one bar length for the whole piece drifts a little further wrong
 * with every bar that follows.
 */
function measuresFromHeader(header: Midi['header'], endTicks: number): SongMeasure[] {
  const ppq = header.ppq > 0 ? header.ppq : 480
  const signatures = [...header.timeSignatures].sort((a, b) => a.ticks - b.ticks)
  const tempos = [...header.tempos].sort((a, b) => a.ticks - b.ticks)
  const seconds = (ticks: number) => header.ticksToSeconds(ticks)

  const bars: Omit<SongMeasure, 'number'>[] = []
  let tick = 0
  // A file cannot be longer than this many bars and still be a piece of
  // music; the cap is only there so a broken header cannot loop forever.
  while ((tick < endTicks || bars.length === 0) && bars.length < 20_000) {
    const signature = signatures.filter((entry) => entry.ticks <= tick).at(-1)
    const [beats = 4, beatType = 4] = signature?.timeSignature ?? []
    const barTicks = Math.max(1, Math.round((ppq * 4 * beats) / beatType))
    // A change of metre starts a new bar, so a bar cut short by one ends
    // where the new signature begins.
    const change = signatures.find((entry) => entry.ticks > tick)
    const end = change ? Math.min(tick + barTicks, change.ticks) : tick + barTicks
    const tempo = tempos.filter((entry) => entry.ticks <= tick).at(-1)
    const bpm = tempo && tempo.bpm > 0 ? tempo.bpm : 120
    bars.push({
      startMs: seconds(tick) * 1000,
      durationMs: (seconds(end) - seconds(tick)) * 1000,
      startQ: tick / ppq,
      durationQ: (end - tick) / ppq,
      beats,
      beatType,
      quarterMs: 60000 / bpm,
    })
    tick = end
  }
  return numberMeasures(bars)
}
