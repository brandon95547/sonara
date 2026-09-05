import { Midi } from '@tonejs/midi'
import {
  buildSong,
  inferHand,
  programFamily,
  roleForProgram,
  tonicForFifths,
  fifthsForTonic,
  type DetectedKey,
  type Hand,
  type PartRole,
  type Song,
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
 * What is left here is the part that is ours: deciding what each track is for.
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

  const notes: SongNote[] = []
  for (const track of tracks) {
    const role = roleOf(track)
    for (const note of track.notes) {
      notes.push({
        note: note.midi,
        // The library normalises velocity to 0-1; MIDI and our engines want 1-127.
        velocity: Math.max(1, Math.round(note.velocity * 127)),
        startMs: note.time * 1000,
        durationMs: Math.max(30, note.duration * 1000),
        hand: byTrack ? (hands.get(track) ?? 'right') : inferHand(note.midi),
        role,
      })
    }
  }

  const [beats = 4, beatType = 4] = midi.header.timeSignatures[0]?.timeSignature ?? []

  // A MIDI file may declare a key. Most do not, and buildSong estimates one
  // from the notes when this is null — marked as an estimate either way.
  const declared = midi.header.keySignatures[0]
  const key: DetectedKey | null = declared
    ? {
        mode: declared.scale === 'minor' ? 'minor' : 'major',
        pitchClass: tonicForFifths(
          fifthsForTonic(
            ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].indexOf(declared.key),
            declared.scale === 'minor' ? 'minor' : 'major',
          ),
          declared.scale === 'minor' ? 'minor' : 'major',
        ),
        fifths: fifthsForTonic(
          ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].indexOf(declared.key),
          declared.scale === 'minor' ? 'minor' : 'major',
        ),
        declared: true,
      }
    : null

  return buildSong({
    id: `midi:${title}:${Date.now()}`,
    title: midi.name?.trim() || title,
    bpm: midi.header.tempos[0]?.bpm ?? 100,
    // A bar of 6/8 is six eighths, which is three quarter-note beats.
    beatsPerMeasure: Math.max(1, (beats * 4) / beatType),
    notes,
    source: 'midi',
    handsInferred: !byTrack,
    key,
    parts: [
      ...new Set(
        tracks.map((track) =>
          track.instrument.percussion ? 'Drums' : programFamily(track.instrument.number),
        ),
      ),
    ],
  })
}
