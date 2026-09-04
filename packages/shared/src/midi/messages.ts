/**
 * MIDI channel-voice message decoding.
 *
 * Web MIDI delivers complete messages (running status is resolved for us), so
 * this is a pure function over a byte array with no parser state. It is in
 * `shared` rather than in the web app because the API's device-profile tests
 * exercise it too, and because a second consumer (a future practice-recording
 * endpoint) will need exactly the same decode.
 */

export const MIDI_STATUS = {
  noteOff: 0x80,
  noteOn: 0x90,
  polyAftertouch: 0xa0,
  controlChange: 0xb0,
  programChange: 0xc0,
  channelAftertouch: 0xd0,
  pitchBend: 0xe0,
} as const

/** Control-change numbers this app acts on. */
export const MIDI_CC = {
  modulation: 1,
  volume: 7,
  expression: 11,
  sustain: 64,
  sostenuto: 66,
  soft: 67,
  allSoundOff: 120,
  resetAllControllers: 121,
  allNotesOff: 123,
} as const

export type MidiMessage =
  | { type: 'noteOn'; channel: number; note: number; velocity: number }
  | { type: 'noteOff'; channel: number; note: number; velocity: number }
  | { type: 'controlChange'; channel: number; controller: number; value: number }
  | { type: 'pitchBend'; channel: number; value: number }
  | { type: 'channelAftertouch'; channel: number; pressure: number }
  | { type: 'polyAftertouch'; channel: number; note: number; pressure: number }
  | { type: 'programChange'; channel: number; program: number }
  | { type: 'unknown'; channel: number; status: number }

/**
 * Decodes one channel-voice message. Returns `null` for system messages
 * (0xf0-0xff: clock, sysex, active sensing), which carry no channel and would
 * otherwise be misread as channel 15 traffic.
 *
 * A note-on with velocity 0 is decoded as a note-off. This is not an edge case
 * — it is how the large majority of hardware keyboards signal a release, and
 * treating it as a note-on is the single most common way a virtual keyboard
 * ends up with stuck keys.
 */
export function decodeMidiMessage(data: ArrayLike<number>): MidiMessage | null {
  if (data.length === 0) return null
  const status = data[0] as number
  if (status < 0x80 || status >= 0xf0) return null

  const type = status & 0xf0
  const channel = status & 0x0f
  const d1 = (data[1] ?? 0) & 0x7f
  const d2 = (data[2] ?? 0) & 0x7f

  switch (type) {
    case MIDI_STATUS.noteOn:
      return d2 === 0
        ? { type: 'noteOff', channel, note: d1, velocity: 0 }
        : { type: 'noteOn', channel, note: d1, velocity: d2 }
    case MIDI_STATUS.noteOff:
      return { type: 'noteOff', channel, note: d1, velocity: d2 }
    case MIDI_STATUS.controlChange:
      return { type: 'controlChange', channel, controller: d1, value: d2 }
    case MIDI_STATUS.pitchBend:
      // 14-bit, LSB first, centred at 8192. Normalised to -1..1 so consumers
      // never have to remember the bit layout.
      return { type: 'pitchBend', channel, value: ((d2 << 7) | d1) / 8192 - 1 }
    case MIDI_STATUS.channelAftertouch:
      return { type: 'channelAftertouch', channel, pressure: d1 }
    case MIDI_STATUS.polyAftertouch:
      return { type: 'polyAftertouch', channel, note: d1, pressure: d2 }
    case MIDI_STATUS.programChange:
      return { type: 'programChange', channel, program: d1 }
    default:
      return { type: 'unknown', channel, status }
  }
}

/** A sustain pedal is "down" at 64 and above. Half-pedalling is not modelled. */
export function isSustainDown(value: number): boolean {
  return value >= 64
}
