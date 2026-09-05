/**
 * The parts of General MIDI a song importer has to know about.
 *
 * Two facts do almost all the work. Channel 10 — index 9 — is percussion, and
 * a note number there names a drum rather than a pitch, so playing it on a
 * piano is not a wrong sound, it is a category error. And a Program Change
 * says what every other channel is, in families of eight.
 */

/** The drum channel. Zero-indexed, so channel 10 in the spec is 9 here. */
export const PERCUSSION_CHANNEL = 9

export type PartRole = 'keyboard' | 'percussion' | 'accompaniment'

/**
 * What a General MIDI program sounds like, in the only grouping that matters
 * here: is this a part someone would play on the keys in front of them?
 *
 * Programs 0-7 are the pianos. 8-15 are the tuned percussion — celesta,
 * glockenspiel, vibraphone — which are played from a keyboard and read from
 * the same staff, so they belong with the pianos rather than with the drums
 * their name suggests. 16-23 are the organs. Everything else is somebody else
 * in the room.
 */
export function roleForProgram(program: number): PartRole {
  return program >= 0 && program <= 23 ? 'keyboard' : 'accompaniment'
}

/** A short family name, for saying what is in a file. */
export function programFamily(program: number): string {
  const families = [
    'Piano',
    'Tuned percussion',
    'Organ',
    'Guitar',
    'Bass',
    'Strings',
    'Ensemble',
    'Brass',
    'Reed',
    'Pipe',
    'Synth lead',
    'Synth pad',
    'Synth effects',
    'Ethnic',
    'Percussive',
    'Sound effects',
  ]
  return families[Math.floor(program / 8)] ?? 'Instrument'
}

/**
 * The General MIDI Level 1 Percussion Key Map, in full.
 *
 * Notes 35-81, exactly as the MMA published it. Written out rather than grown
 * a note at a time from whatever files turned up, because the half-map that
 * preceded this read a conga part as a shaker — the notes it had never seen
 * fell through a guess based on register, and a third of one song's percussion
 * went to the wrong instrument without anything failing.
 *
 * Every entry names a real instrument and a voice to make it with. Several
 * instruments share a voice: a cabasa and a maraca are the same gesture at
 * this level of synthesis, and pretending otherwise would be detail we cannot
 * actually produce.
 */
export type DrumVoice =
  | 'kick'
  | 'snare'
  | 'rimshot'
  | 'clap'
  | 'tom-low'
  | 'tom-mid'
  | 'tom-high'
  | 'hat-closed'
  | 'hat-pedal'
  | 'hat-open'
  | 'crash'
  | 'ride'
  | 'ride-bell'
  | 'shaker'
  | 'cowbell'
  | 'conga-low'
  | 'conga-high'
  | 'bongo-low'
  | 'bongo-high'
  | 'timbale'
  | 'agogo'
  | 'woodblock'
  | 'triangle'
  | 'whistle'
  | 'scrape'

interface Percussion {
  readonly name: string
  readonly voice: DrumVoice
}

/** GM 1 percussion, notes 35-81. The names are the spec's. */
const PERCUSSION: Record<number, Percussion> = {
  35: { name: 'Acoustic Bass Drum', voice: 'kick' },
  36: { name: 'Bass Drum 1', voice: 'kick' },
  37: { name: 'Side Stick', voice: 'rimshot' },
  38: { name: 'Acoustic Snare', voice: 'snare' },
  39: { name: 'Hand Clap', voice: 'clap' },
  40: { name: 'Electric Snare', voice: 'snare' },
  41: { name: 'Low Floor Tom', voice: 'tom-low' },
  42: { name: 'Closed Hi-Hat', voice: 'hat-closed' },
  43: { name: 'High Floor Tom', voice: 'tom-low' },
  44: { name: 'Pedal Hi-Hat', voice: 'hat-pedal' },
  45: { name: 'Low Tom', voice: 'tom-mid' },
  46: { name: 'Open Hi-Hat', voice: 'hat-open' },
  47: { name: 'Low-Mid Tom', voice: 'tom-mid' },
  48: { name: 'Hi-Mid Tom', voice: 'tom-high' },
  49: { name: 'Crash Cymbal 1', voice: 'crash' },
  50: { name: 'High Tom', voice: 'tom-high' },
  51: { name: 'Ride Cymbal 1', voice: 'ride' },
  52: { name: 'Chinese Cymbal', voice: 'crash' },
  53: { name: 'Ride Bell', voice: 'ride-bell' },
  54: { name: 'Tambourine', voice: 'shaker' },
  55: { name: 'Splash Cymbal', voice: 'crash' },
  56: { name: 'Cowbell', voice: 'cowbell' },
  57: { name: 'Crash Cymbal 2', voice: 'crash' },
  58: { name: 'Vibraslap', voice: 'scrape' },
  59: { name: 'Ride Cymbal 2', voice: 'ride' },
  60: { name: 'Hi Bongo', voice: 'bongo-high' },
  61: { name: 'Low Bongo', voice: 'bongo-low' },
  62: { name: 'Mute Hi Conga', voice: 'conga-high' },
  63: { name: 'Open Hi Conga', voice: 'conga-high' },
  64: { name: 'Low Conga', voice: 'conga-low' },
  65: { name: 'High Timbale', voice: 'timbale' },
  66: { name: 'Low Timbale', voice: 'timbale' },
  67: { name: 'High Agogo', voice: 'agogo' },
  68: { name: 'Low Agogo', voice: 'agogo' },
  69: { name: 'Cabasa', voice: 'shaker' },
  70: { name: 'Maracas', voice: 'shaker' },
  71: { name: 'Short Whistle', voice: 'whistle' },
  72: { name: 'Long Whistle', voice: 'whistle' },
  73: { name: 'Short Guiro', voice: 'scrape' },
  74: { name: 'Long Guiro', voice: 'scrape' },
  75: { name: 'Claves', voice: 'woodblock' },
  76: { name: 'Hi Wood Block', voice: 'woodblock' },
  77: { name: 'Low Wood Block', voice: 'woodblock' },
  78: { name: 'Mute Cuica', voice: 'scrape' },
  79: { name: 'Open Cuica', voice: 'scrape' },
  80: { name: 'Mute Triangle', voice: 'triangle' },
  81: { name: 'Open Triangle', voice: 'triangle' },
}

/**
 * The voice for a percussion note.
 *
 * Outside 35-81 the map says nothing, and neither does the spec. Those notes
 * still have to make a noise — a hole in a groove is more obvious than an
 * approximate sound — so they take the nearest mapped neighbour rather than a
 * guess about what they might be.
 */
export function drumVoice(note: number): DrumVoice {
  const mapped = PERCUSSION[note]
  if (mapped) return mapped.voice

  let nearest = 38
  let distance = Infinity
  for (const key of Object.keys(PERCUSSION)) {
    const candidate = Number(key)
    const gap = Math.abs(candidate - note)
    if (gap < distance) {
      distance = gap
      nearest = candidate
    }
  }
  return PERCUSSION[nearest]!.voice
}

/** The instrument's name from the spec, for saying what a track plays. */
export function drumName(note: number): string {
  return PERCUSSION[note]?.name ?? `Percussion ${note}`
}
