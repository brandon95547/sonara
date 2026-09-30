import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  fitClef,
  PAPER_MARGIN,
  PaperCards,
  STAFF_BANDS,
  STAFF_START,
  StaffFrame,
  STEP,
  yOn,
} from '@/features/staff/staff-frame'

/**
 * The staff is a strip of paper exactly as tall as its five lines, with the
 * clef standing out above and below it.
 *
 * The white used to be a card with a margin round the staff, which made the
 * music look boxed; the design is a band the notes hang on, so what reaches
 * past the lines — a treble clef, a note on ledger lines — stands on the
 * stage. These pin the band to the lines and the clefs to the middle of it.
 */

afterEach(cleanup)

const staves = ['treble', 'bass'] as const
const attr = (element: Element, name: string) => Number(element.getAttribute(name))

describe('the paper under each staff', () => {
  it('runs from the top line to the bottom line, and no further', () => {
    const { container } = render(
      <svg>
        <PaperCards width={600} />
      </svg>,
    )
    const strips = [...container.querySelectorAll('.staff__paper')]
    expect(strips).toHaveLength(2)
    expect(strips.map((strip) => attr(strip, 'y'))).toEqual([yOn(10, 'treble'), yOn(-2, 'bass')])
    for (const strip of strips) expect(attr(strip, 'height')).toBe(STEP * 8)
  })

  it('starts and stops where the staff lines do', () => {
    const { container } = render(
      <svg>
        <PaperCards width={600} />
        <StaffFrame width={600} />
      </svg>,
    )
    const strip = container.querySelector('.staff__paper')!
    const lines = [...container.querySelectorAll('.staff__line')]
    const starts = lines.map((line) => attr(line, 'x1'))
    const ends = lines.map((line) => attr(line, 'x2'))
    expect(attr(strip, 'x')).toBe(Math.min(...starts))
    expect(attr(strip, 'x') + attr(strip, 'width')).toBe(Math.max(...ends))
    expect(Math.min(...starts)).toBe(STAFF_START)
    expect(Math.max(...ends)).toBe(600 - PAPER_MARGIN)
  })
})

/** Where a clef's ink lands, drawn as `fitClef` says, for a font with this ink at 100px. */
function inkOf(staff: (typeof staves)[number], ascent: number, descent: number) {
  const fit = fitClef(staff, { ascent, descent })
  const k = fit.size / 100
  return { top: fit.baseline - ascent * k, bottom: fit.baseline + descent * k }
}

describe('the clefs', () => {
  it.each(staves)('centres the %s clef on its strip', (staff) => {
    const ink = inkOf(staff, 72, 26)
    const band = STAFF_BANDS[staff]
    expect((ink.top + ink.bottom) / 2).toBeCloseTo((band.top + band.bottom) / 2, 9)
  })

  it('stands the treble clef out a space and a half at both ends, the way it is engraved', () => {
    const ink = inkOf('treble', 72, 26)
    expect(STAFF_BANDS.treble.top - ink.top).toBeCloseTo(STEP * 3, 9)
    expect(ink.bottom - STAFF_BANDS.treble.bottom).toBeCloseTo(STEP * 3, 9)
  })

  it('keeps the bass clef inside its staff', () => {
    const ink = inkOf('bass', 60, 10)
    expect(ink.top).toBeGreaterThan(STAFF_BANDS.bass.top)
    expect(ink.bottom).toBeLessThan(STAFF_BANDS.bass.bottom)
  })

  it('draws the same clef whichever font the machine has, however big it calls a size', () => {
    // One font's clef is half again the size of another's at the same point
    // size; the ink on the staff must not care.
    const small = inkOf('treble', 50, 18)
    const large = inkOf('treble', 75, 27)
    expect(small.top).toBeCloseTo(large.top, 9)
    expect(small.bottom).toBeCloseTo(large.bottom, 9)
  })
})
