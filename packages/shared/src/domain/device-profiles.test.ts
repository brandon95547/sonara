import { describe, expect, it } from 'vitest'
import type { DeviceProfile } from './device.js'
import { keyCountFromName, matchDeviceProfile, STANDARD_RANGES } from './device-profiles.js'

const profiles: DeviceProfile[] = [
  {
    id: 'novation-launchkey-generic',
    label: 'Novation Launchkey',
    manufacturer: 'Novation',
    keyCount: 25,
    range: STANDARD_RANGES[25],
    namePattern: 'launchkey',
    manufacturerPattern: null,
    defaultVelocityCurve: 'soft',
    keyCountFromName: true,
    priority: 40,
  },
  {
    id: 'novation-launchkey-61',
    label: 'Novation Launchkey 61',
    manufacturer: 'Novation',
    keyCount: 61,
    range: STANDARD_RANGES[61],
    namePattern: 'launchkey.*\\b61\\b',
    manufacturerPattern: null,
    defaultVelocityCurve: 'soft',
    keyCountFromName: true,
    priority: 70,
  },
  {
    id: 'broken-pattern',
    label: 'Malformed',
    manufacturer: 'Nobody',
    keyCount: 88,
    range: STANDARD_RANGES[88],
    namePattern: '([unclosed',
    manufacturerPattern: null,
    defaultVelocityCurve: 'linear',
    keyCountFromName: false,
    priority: 100,
  },
]

describe('matchDeviceProfile', () => {
  it('prefers the more specific profile', () => {
    const match = matchDeviceProfile(
      { name: 'Launchkey 61 MK4', manufacturer: 'Novation' },
      profiles,
    )
    expect(match.profile?.id).toBe('novation-launchkey-61')
    expect(match.source).toBe('profile')
    expect(match.keyCount).toBe(61)
  })

  it('falls back to the generic profile', () => {
    const match = matchDeviceProfile({ name: 'Launchkey Mini', manufacturer: 'Novation' }, profiles)
    expect(match.profile?.id).toBe('novation-launchkey-generic')
  })

  it('survives a malformed pattern in the data instead of throwing', () => {
    const match = matchDeviceProfile({ name: 'Launchkey Mini', manufacturer: 'Novation' }, profiles)
    expect(match.profile?.id).toBe('novation-launchkey-generic')
  })

  it('guesses from the product name when nothing matches', () => {
    const match = matchDeviceProfile(
      { name: 'Keystation 49 MK3', manufacturer: 'M-Audio' },
      profiles,
    )
    expect(match.source).toBe('name-heuristic')
    expect(match.keyCount).toBe(49)
    expect(match.range).toEqual(STANDARD_RANGES[49])
  })

  it('keeps the profile size when the family does not state it in the name', () => {
    // A Yamaha NP-32 is a 76-key Piaggero. Reading "32" out of the model number
    // is the exact false positive `keyCountFromName: false` exists to block.
    const piaggero: DeviceProfile = {
      id: 'yamaha-piaggero',
      label: 'Yamaha Piaggero NP',
      manufacturer: 'Yamaha',
      keyCount: 76,
      range: STANDARD_RANGES[76],
      namePattern: 'np-?3[12]|piaggero',
      manufacturerPattern: null,
      defaultVelocityCurve: 'soft',
      keyCountFromName: false,
      priority: 80,
    }
    const match = matchDeviceProfile({ name: 'NP-32', manufacturer: 'Yamaha' }, [piaggero])
    expect(match.keyCount).toBe(76)
    expect(match.range).toEqual(STANDARD_RANGES[76])
  })

  it('lets a size stated in the name override the matched profile', () => {
    // One generic Launchkey profile covers the whole family: it supplies the
    // manufacturer and the velocity curve, the name supplies the size.
    const match = matchDeviceProfile(
      { name: 'Launchkey 49 MK4', manufacturer: 'Novation' },
      profiles,
    )
    expect(match.profile?.id).toBe('novation-launchkey-generic')
    expect(match.keyCount).toBe(49)
    expect(match.range).toEqual(STANDARD_RANGES[49])
  })

  it('defaults to 61 keys for an anonymous port', () => {
    const match = matchDeviceProfile({ name: 'USB MIDI Device', manufacturer: '' }, profiles)
    expect(match.source).toBe('default')
    expect(match.keyCount).toBe(61)
  })
})

describe('keyCountFromName', () => {
  it.each([
    ['Keystation 49 MK3', 49],
    ['MPK249', 49],
    ['KOMPLETE KONTROL M32', 32],
    ['Launchkey 61', 61],
    ['Digital Piano 88 key', 88],
    ['CTK-2550 61-note', 61],
    ['microKEY2-61', 61],
    ['Nektar Impact GX61', 61],
    ['Arturia KeyLab 88 MkII', 88],
  ])('reads %s as %i keys', (name, expected) => {
    expect(keyCountFromName(name)).toBe(expected)
  })

  it.each([
    // Model numbers that contain a key count as a substring. Every one of these
    // returns the wrong answer under a naive digit search.
    'Yamaha P-125',
    'Yamaha PSR-E373',
    'Casio PX-770',
    'Roland FP-30X',
    'Impact GX Mini',
    'SL MkIII',
    'MPK Mini Mk3',
  ])('does not invent a size from %s', (name) => {
    expect(keyCountFromName(name)).toBeNull()
  })
})
