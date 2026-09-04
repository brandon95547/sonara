import type { Instrument, SynthVoicing } from '@sonara/shared'

/**
 * The piano catalogue.
 *
 * Held in code rather than in the database on purpose. Every entry names an
 * engine the *client* has to be able to run, so a row is only meaningful
 * alongside a client build that understands it. Putting it in a table would let
 * an operator add a piano the app cannot play, and the failure would surface as
 * silence in a player's headphones rather than as an error anyone sees.
 *
 * Each instrument carries a `voicing` even when it is sampled. That voicing is
 * what the built-in engine plays when the sample CDN is slow or unreachable —
 * the app stays playable offline, and it stays recognisably *this* piano rather
 * than one generic beep for everything.
 */

/**
 * Real piano strings are stiff, so their overtones sit slightly sharp of exact
 * multiples of the fundamental. Stretching the ratios by a few tenths of a
 * percent is most of the difference between "piano" and "organ".
 */
const stretched = (partial: number) => partial * (1 + 0.0004 * partial * partial)

const acousticPartials = (brightnessBias = 1) =>
  [
    { ratio: 1, gain: 1, decay: 4.2 },
    { ratio: stretched(2), gain: 0.42 * brightnessBias, decay: 2.6 },
    { ratio: stretched(3), gain: 0.22 * brightnessBias, decay: 1.7 },
    { ratio: stretched(4), gain: 0.12 * brightnessBias, decay: 1.1 },
    { ratio: stretched(5), gain: 0.07 * brightnessBias, decay: 0.75 },
    { ratio: stretched(6), gain: 0.04 * brightnessBias, decay: 0.5 },
  ] satisfies SynthVoicing['partials']

const grandVoicing: SynthVoicing = {
  partials: acousticPartials(),
  attack: 0.004,
  release: 0.5,
  brightness: 6200,
  detune: 4,
  hammer: 0.3,
}

export const INSTRUMENTS: readonly Instrument[] = [
  {
    id: 'splendid-grand',
    name: 'Splendid Grand',
    description: 'A concert grand captured at four dynamic layers. The reference sound.',
    family: 'acoustic',
    character: ['warm', 'wide', 'detailed'],
    engine: { kind: 'sampled-splendid' },
    voicing: grandVoicing,
    gainDb: 0,
    range: { low: 21, high: 108 },
  },
  {
    id: 'concert-grand',
    name: 'Concert Grand',
    description: 'Classic hall grand — even across the range and quick to respond.',
    family: 'acoustic',
    character: ['balanced', 'classical'],
    engine: { kind: 'sampled-soundfont', program: 'acoustic_grand_piano' },
    voicing: grandVoicing,
    gainDb: -1,
    range: { low: 21, high: 108 },
  },
  {
    id: 'bright-upright',
    name: 'Bright Upright',
    description: 'Close-miked upright with a hard hammer. Cuts through a mix.',
    family: 'acoustic',
    character: ['bright', 'percussive'],
    engine: { kind: 'sampled-soundfont', program: 'bright_acoustic_piano' },
    voicing: {
      partials: acousticPartials(1.45),
      attack: 0.002,
      release: 0.38,
      brightness: 9500,
      detune: 6,
      hammer: 0.5,
    },
    gainDb: -2,
    range: { low: 21, high: 108 },
  },
  {
    id: 'honky-tonk',
    name: 'Honky-Tonk',
    description: 'Deliberately out of tune with itself. Saloon piano, ragtime, character.',
    family: 'acoustic',
    character: ['detuned', 'vintage'],
    engine: { kind: 'sampled-soundfont', program: 'honkytonk_piano' },
    voicing: {
      partials: acousticPartials(1.15),
      attack: 0.003,
      release: 0.34,
      // The whole identity of this piano is the beating between two strings
      // tuned a fraction apart, so the detune is doing the characterisation.
      brightness: 7000,
      detune: 24,
      hammer: 0.45,
    },
    gainDb: -2,
    range: { low: 21, high: 108 },
  },
  {
    id: 'rhodes-mk-i',
    name: 'Rhodes Mk I',
    description: 'Tine electric piano. Bell-like attack that melts into a soft sustain.',
    family: 'electric',
    character: ['bell', 'mellow'],
    engine: { kind: 'sampled-soundfont', program: 'electric_piano_1' },
    voicing: {
      // A tine's voice is the fundamental plus a high, fast-decaying bell
      // partial. Harmonics 2-5 are almost absent, which is why a Rhodes sounds
      // hollow next to an acoustic piano.
      partials: [
        { ratio: 1, gain: 1, decay: 3.4 },
        { ratio: 2, gain: 0.12, decay: 2.2 },
        { ratio: 6.02, gain: 0.3, decay: 0.35 },
        { ratio: 9.1, gain: 0.12, decay: 0.18 },
      ],
      attack: 0.006,
      release: 0.6,
      brightness: 3400,
      detune: 0,
      hammer: 0.12,
    },
    gainDb: -1,
    range: { low: 28, high: 100 },
  },
  {
    id: 'studio-wurli',
    name: 'Studio Wurli',
    description: 'Reed electric piano. Sweet when played softly, bites when you lean in.',
    family: 'electric',
    character: ['reedy', 'gritty'],
    engine: { kind: 'sampled-soundfont', program: 'electric_piano_2' },
    voicing: {
      // A struck reed is close to a square wave: odd harmonics dominate.
      partials: [
        { ratio: 1, gain: 1, decay: 2.8 },
        { ratio: 3, gain: 0.34, decay: 1.6 },
        { ratio: 5, gain: 0.16, decay: 0.9 },
        { ratio: 7, gain: 0.08, decay: 0.5 },
      ],
      attack: 0.004,
      release: 0.42,
      brightness: 4600,
      detune: 2,
      hammer: 0.25,
    },
    gainDb: -1,
    range: { low: 33, high: 96 },
  },
  {
    id: 'sonara-studio',
    name: 'Sonara Studio',
    description: 'Synthesised in the browser. No download, works offline, plays instantly.',
    family: 'acoustic',
    character: ['clean', 'instant'],
    engine: { kind: 'synth' },
    voicing: {
      partials: acousticPartials(0.9),
      attack: 0.004,
      release: 0.55,
      brightness: 5200,
      detune: 3,
      hammer: 0.28,
    },
    gainDb: -2,
    range: { low: 21, high: 108 },
  },
]

export const DEFAULT_INSTRUMENT_ID = 'splendid-grand'

export function findInstrument(id: string): Instrument | undefined {
  return INSTRUMENTS.find((instrument) => instrument.id === id)
}
