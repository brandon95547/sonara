import { describe, expect, it } from 'vitest'
import { decodeMidiMessage, isSustainDown } from './messages.js'

describe('decodeMidiMessage', () => {
  it('decodes a note on', () => {
    expect(decodeMidiMessage([0x90, 60, 100])).toEqual({
      type: 'noteOn',
      channel: 0,
      note: 60,
      velocity: 100,
    })
  })

  it('treats note-on with velocity 0 as a note off', () => {
    // The single most common cause of stuck keys on a virtual keyboard.
    expect(decodeMidiMessage([0x90, 60, 0])).toEqual({
      type: 'noteOff',
      channel: 0,
      note: 60,
      velocity: 0,
    })
  })

  it('reads the channel from the low nibble', () => {
    expect(decodeMidiMessage([0x9f, 60, 100])).toMatchObject({ channel: 15 })
  })

  it('decodes sustain as a control change', () => {
    expect(decodeMidiMessage([0xb0, 64, 127])).toEqual({
      type: 'controlChange',
      channel: 0,
      controller: 64,
      value: 127,
    })
  })

  it('normalises pitch bend around centre', () => {
    expect(decodeMidiMessage([0xe0, 0x00, 0x40])).toMatchObject({ type: 'pitchBend', value: 0 })
    expect(decodeMidiMessage([0xe0, 0x00, 0x00])).toMatchObject({ type: 'pitchBend', value: -1 })
  })

  it('ignores system messages rather than reading them as channel 15', () => {
    expect(decodeMidiMessage([0xf8])).toBeNull() // clock
    expect(decodeMidiMessage([0xfe])).toBeNull() // active sensing
    expect(decodeMidiMessage([])).toBeNull()
  })

  it('ignores data bytes with no status', () => {
    expect(decodeMidiMessage([60, 100])).toBeNull()
  })
})

describe('isSustainDown', () => {
  it('splits at 64', () => {
    expect(isSustainDown(63)).toBe(false)
    expect(isSustainDown(64)).toBe(true)
  })
})
