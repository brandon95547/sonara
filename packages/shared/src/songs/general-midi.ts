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
 * The General MIDI drum map, for the notes that actually turn up.
 *
 * Anything not named here still sounds — it falls back to the nearest voice
 * rather than going silent, because a missing note in a groove is more obvious
 * than an approximate one.
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
  | 'shaker'
  | 'cowbell'

const DRUM_MAP: Record<number, DrumVoice> = {
  35: 'kick',
  36: 'kick',
  37: 'rimshot',
  38: 'snare',
  39: 'clap',
  40: 'snare',
  41: 'tom-low',
  42: 'hat-closed',
  43: 'tom-low',
  44: 'hat-pedal',
  45: 'tom-mid',
  46: 'hat-open',
  47: 'tom-mid',
  48: 'tom-high',
  49: 'crash',
  50: 'tom-high',
  51: 'ride',
  52: 'crash',
  53: 'ride',
  54: 'shaker',
  55: 'crash',
  56: 'cowbell',
  57: 'crash',
  59: 'ride',
  69: 'shaker',
  70: 'shaker',
  75: 'rimshot',
}

export function drumVoice(note: number): DrumVoice {
  const mapped = DRUM_MAP[note]
  if (mapped) return mapped
  // Unmapped percussion still has to make a noise. Split by register, which is
  // roughly how the GM map is laid out anyway.
  if (note < 38) return 'kick'
  if (note < 48) return 'tom-low'
  if (note < 60) return 'hat-closed'
  return 'shaker'
}

const DRUM_NAMES: Record<DrumVoice, string> = {
  kick: 'Kick',
  snare: 'Snare',
  rimshot: 'Rim',
  clap: 'Clap',
  'tom-low': 'Low tom',
  'tom-mid': 'Mid tom',
  'tom-high': 'High tom',
  'hat-closed': 'Closed hat',
  'hat-pedal': 'Pedal hat',
  'hat-open': 'Open hat',
  crash: 'Crash',
  ride: 'Ride',
  shaker: 'Shaker',
  cowbell: 'Cowbell',
}

export const drumName = (voice: DrumVoice): string => DRUM_NAMES[voice]
