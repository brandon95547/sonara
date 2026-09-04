import { describe, expect, it } from 'vitest'
import { deviceConfigSchema, fingerprintDevice, DEFAULT_DEVICE_CONFIG } from './device.js'

describe('fingerprintDevice', () => {
  it('is stable across the port-index suffix browsers append', () => {
    // Chrome and Firefox report the same hardware differently. Saved settings
    // must survive moving the cable to the other USB socket.
    const a = fingerprintDevice({ name: 'P-125', manufacturer: 'Yamaha' })
    const b = fingerprintDevice({ name: 'P-125 MIDI 1', manufacturer: 'Yamaha' })
    expect(a).toBe(b)
  })

  it('is case- and punctuation-insensitive', () => {
    expect(fingerprintDevice({ name: 'MPK Mini Mk3', manufacturer: 'AKAI' })).toBe(
      fingerprintDevice({ name: 'mpk  mini   mk3', manufacturer: 'akai' }),
    )
  })

  it('separates two different keyboards', () => {
    expect(fingerprintDevice({ name: 'P-125', manufacturer: 'Yamaha' })).not.toBe(
      fingerprintDevice({ name: 'FP-30X', manufacturer: 'Roland' }),
    )
  })

  it('copes with an empty manufacturer', () => {
    expect(fingerprintDevice({ name: 'USB MIDI Keyboard', manufacturer: '' })).toBe(
      'usb-midi-keyboard',
    )
  })

  it('never returns an empty id', () => {
    expect(fingerprintDevice({ name: '???', manufacturer: '' })).toBe('unknown-device')
  })
})

describe('deviceConfigSchema', () => {
  it('accepts the default config', () => {
    expect(deviceConfigSchema.parse(DEFAULT_DEVICE_CONFIG)).toEqual(DEFAULT_DEVICE_CONFIG)
  })

  it('rejects an inverted range', () => {
    const result = deviceConfigSchema.safeParse({
      ...DEFAULT_DEVICE_CONFIG,
      range: { low: 80, high: 40 },
    })
    expect(result.success).toBe(false)
  })

  it('rejects an out-of-range transpose', () => {
    expect(deviceConfigSchema.safeParse({ ...DEFAULT_DEVICE_CONFIG, transpose: 48 }).success).toBe(
      false,
    )
  })

  it('allows omni via a null channel filter', () => {
    expect(
      deviceConfigSchema.safeParse({ ...DEFAULT_DEVICE_CONFIG, channelFilter: null }).success,
    ).toBe(true)
  })
})
