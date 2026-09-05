import { describe, expect, it } from 'vitest'
import { ledgerSteps, staffNoteName, staffPlacement } from './staff.js'

/**
 * Staff position is diatonic. Getting it from a semitone count puts C♯ on its
 * own line, which is the one mistake that makes a stave unreadable to anyone
 * who reads staves.
 */
describe('staff placement', () => {
  it('puts middle C between the staves, on the treble side', () => {
    const middleC = staffPlacement(60)
    expect(middleC).toMatchObject({ staff: 'treble', steps: 0, letter: 'C', octave: 4 })
    // One ledger line, which is the line it is written on.
    expect(ledgerSteps(middleC)).toEqual([0])
  })

  it('lands the five treble lines on even steps 2 to 10', () => {
    // E4 G4 B4 D5 F5 — the lines every reader knows.
    expect([64, 67, 71, 74, 77].map((note) => staffPlacement(note).steps)).toEqual([2, 4, 6, 8, 10])
  })

  it('lands the five bass lines on even steps −2 to −10', () => {
    // G2 B2 D3 F3 A3.
    expect([43, 47, 50, 53, 57].map((note) => staffPlacement(note).steps)).toEqual([
      -10, -8, -6, -4, -2,
    ])
  })

  it('writes a sharp on the same line as its natural', () => {
    // The whole reason position is diatonic: these share a line and are told
    // apart by the accidental, not by height.
    for (const [natural, sharp] of [
      [60, 61],
      [65, 66],
      [67, 68],
    ]) {
      expect(staffPlacement(sharp!).steps).toBe(staffPlacement(natural!).steps)
      expect(staffPlacement(sharp!).sharp).toBe(true)
      expect(staffPlacement(natural!).sharp).toBe(false)
    }
  })

  it('never moves backwards as pitch rises', () => {
    let previous = -Infinity
    for (let note = 21; note <= 108; note++) {
      const { steps } = staffPlacement(note)
      expect(steps).toBeGreaterThanOrEqual(previous)
      previous = steps
    }
  })

  it('names notes the way a reader would say them', () => {
    expect(staffNoteName(60)).toBe('C4')
    expect(staffNoteName(61)).toBe('C♯4')
    expect(staffNoteName(21)).toBe('A0')
    expect(staffNoteName(108)).toBe('C8')
  })

  describe('ledger lines', () => {
    it('gives none to notes inside their own staff', () => {
      for (const note of [64, 67, 71, 74, 77, 43, 47, 50, 53, 57]) {
        expect(ledgerSteps(staffPlacement(note))).toEqual([])
      }
    })

    it('counts up from the staff for notes above it', () => {
      // A5 is one ledger line above the treble; C6 is two.
      expect(ledgerSteps(staffPlacement(81))).toEqual([12])
      expect(ledgerSteps(staffPlacement(84))).toEqual([12, 14])
    })

    it('counts down from the staff for notes below it', () => {
      // Middle C, then A3 below it, both on the treble side of the gap.
      expect(ledgerSteps(staffPlacement(60))).toEqual([0])
      // E2 is one ledger line below the bass staff.
      expect(ledgerSteps(staffPlacement(40))).toEqual([-12])
    })

    it('leaves a note in the gap on the staff it belongs to', () => {
      // B3 is below middle C, so it is written on the bass staff, above it.
      const b3 = staffPlacement(59)
      expect(b3.staff).toBe('bass')
      expect(ledgerSteps(b3)).toEqual([])
    })
  })
})
