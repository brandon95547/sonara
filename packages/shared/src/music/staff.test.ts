import { describe, expect, it } from 'vitest'
import { ledgerSteps, staffFor, staffNoteName, staffPlacement } from './staff.js'

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
      expect(staffPlacement(sharp!).accidental).toBe(1)
      expect(staffPlacement(natural!).accidental).toBe(0)
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

describe('a spelled note', () => {
  it('sits on the line its letter names, whatever it sounds like', () => {
    // B♭4 is note 70. Spelled as the score spells it, it is on B's line with
    // a flat; left to the sharp-side fallback it would be an A♯ on A's space.
    const flat = staffPlacement(70, { letter: 6, accidental: -1 })
    expect(flat).toMatchObject({ letter: 'B', accidental: -1, steps: 6, octave: 4 })
    expect(staffPlacement(70)).toMatchObject({ letter: 'A', accidental: 1, steps: 5 })
  })

  it('keeps the octave with the letter across the C boundary', () => {
    // B♯3 sounds as middle C and is written on B's line, one step under it.
    expect(staffPlacement(60, { letter: 6, accidental: 1 })).toMatchObject({
      steps: -1,
      octave: 3,
      letter: 'B',
    })
    // C♭4 sounds as B3 and is written on middle C's line.
    expect(staffPlacement(59, { letter: 0, accidental: -1 })).toMatchObject({
      steps: 0,
      octave: 4,
      letter: 'C',
    })
  })

  it('names the note the way it is spelled', () => {
    expect(staffNoteName(70, { letter: 6, accidental: -1 })).toBe('B♭4')
    expect(staffNoteName(60, { letter: 6, accidental: 1 })).toBe('B♯3')
  })

  it('goes on the hand’s staff when the hand is known', () => {
    // A left-hand E4 is written in the bass with a ledger line, not moved into
    // the treble because it happens to be above middle C.
    expect(staffFor(64, 'left')).toBe('bass')
    expect(staffFor(48, 'right')).toBe('treble')
    expect(staffFor(64)).toBe('treble')
    expect(staffPlacement(64, null, 'bass')).toMatchObject({ staff: 'bass', steps: 2 })
    expect(ledgerSteps(staffPlacement(64, null, 'bass'))).toEqual([0, 2])
  })
})
