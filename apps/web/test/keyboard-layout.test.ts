import { describe, expect, it } from 'vitest'
import { countWhiteKeys, isBlackKey, noteName } from '@sonara/shared'
import {
  buildLayout,
  canShift,
  chooseSpan,
  FULL_PIANO,
  KEYBOARD_SPANS,
  shiftWindow,
  windowForSpan,
  windowIncluding,
} from '@/features/keyboard/keyboard-layout'

const span = (id: string) => KEYBOARD_SPANS.find((s) => s.id === id)!

describe('buildLayout', () => {
  it('lays out a full 88-key piano', () => {
    const layout = buildLayout(FULL_PIANO)
    expect(layout.whiteCount).toBe(52)
    expect(layout.whiteKeys).toHaveLength(52)
    expect(layout.blackKeys).toHaveLength(36)
    expect(layout.whiteKeys.length + layout.blackKeys.length).toBe(88)
  })

  it('fills the keybed exactly', () => {
    const layout = buildLayout({ low: 60, high: 72 })
    const last = layout.whiteKeys.at(-1)!
    expect(last.leftPercent + last.widthPercent).toBeCloseTo(100, 6)
  })

  it('keeps every black key inside the keybed', () => {
    // A black key hanging off either end is the classic off-by-one here.
    for (const window of [FULL_PIANO, { low: 60, high: 72 }, { low: 36, high: 96 }]) {
      for (const key of buildLayout(window).blackKeys) {
        expect(key.leftPercent).toBeGreaterThan(0)
        expect(key.leftPercent + key.widthPercent).toBeLessThan(100)
      }
    }
  })

  it('places black keys between their neighbours, off-centre the way a piano does', () => {
    const layout = buildLayout({ low: 60, high: 72 })
    const white = 100 / layout.whiteCount
    const cSharp = layout.blackKeys.find((key) => key.note === 61)!
    const centre = cSharp.leftPercent + cSharp.widthPercent / 2
    // Near the C/D boundary at one white key in, but nudged toward C.
    expect(centre).toBeGreaterThan(white * 0.8)
    expect(centre).toBeLessThan(white)
  })

  it('never starts or ends on a black key', () => {
    const layout = buildLayout({ low: 61, high: 70 })
    expect(isBlackKey(layout.window.low)).toBe(false)
    expect(isBlackKey(layout.window.high)).toBe(false)
  })

  it('renders white keys at even width', () => {
    const layout = buildLayout({ low: 36, high: 96 })
    const widths = new Set(layout.whiteKeys.map((key) => key.widthPercent.toFixed(6)))
    expect(widths.size).toBe(1)
  })
})

describe('chooseSpan', () => {
  it('shows the full piano on a wide desktop', () => {
    expect(chooseSpan(1400, false).id).toBe('full')
  })

  it('narrows as the viewport does', () => {
    const wide = chooseSpan(1400, false)
    const tablet = chooseSpan(760, false)
    const phone = chooseSpan(340, true)
    expect(wide.semitones).toBeGreaterThan(tablet.semitones)
    expect(tablet.semitones).toBeGreaterThan(phone.semitones)
  })

  it('keeps keys wider under a finger than under a mouse', () => {
    // Same width, different pointer: touch gets fewer, wider keys.
    expect(chooseSpan(700, true).semitones).toBeLessThanOrEqual(chooseSpan(700, false).semitones)
  })

  it('still returns a keyboard at 320px rather than nothing', () => {
    const chosen = chooseSpan(320, true)
    expect(chosen.semitones).toBeGreaterThan(0)
  })

  it('respects the minimum key width it picked for', () => {
    for (const width of [320, 480, 768, 1024, 1440, 1920]) {
      const chosen = chooseSpan(width, false)
      if (chosen.id === KEYBOARD_SPANS[0]!.id) continue
      const whites = countWhiteKeys(60, 60 + chosen.semitones)
      expect(width / whites).toBeGreaterThanOrEqual(20)
    }
  })
})

describe('windowForSpan', () => {
  it('anchors the window on a C', () => {
    const window = windowForSpan(span('2'), 65)
    expect(noteName(window.low)).toMatch(/^C\d$/)
  })

  it('returns the real 88-key range for the full span', () => {
    expect(windowForSpan(span('full'), 60)).toEqual(FULL_PIANO)
  })

  it('never runs off the top of the piano', () => {
    const window = windowForSpan(span('4'), 120)
    expect(window.high).toBeLessThanOrEqual(108)
  })

  it('never runs off the bottom', () => {
    const window = windowForSpan(span('2'), 0)
    expect(window.low).toBeGreaterThanOrEqual(21)
  })
})

describe('shiftWindow', () => {
  it('moves by whole octaves', () => {
    expect(shiftWindow({ low: 60, high: 72 }, 1)).toEqual({ low: 72, high: 84 })
    expect(shiftWindow({ low: 60, high: 72 }, -2)).toEqual({ low: 36, high: 48 })
  })

  it('stops at the ends and keeps the span', () => {
    const bottom = shiftWindow({ low: 24, high: 48 }, -5)
    expect(bottom.low).toBe(21)
    expect(bottom.high - bottom.low).toBe(24)

    const top = shiftWindow({ low: 84, high: 108 }, 5)
    expect(top.high).toBe(108)
    expect(top.high - top.low).toBe(24)
  })

  it('reports whether there is anywhere left to go', () => {
    expect(canShift({ low: 60, high: 72 }, 1)).toBe(true)
    expect(canShift(FULL_PIANO, 1)).toBe(false)
    expect(canShift(FULL_PIANO, -1)).toBe(false)
  })
})

describe('windowIncluding', () => {
  it('leaves a visible note alone', () => {
    const window = { low: 60, high: 72 }
    expect(windowIncluding(window, 64)).toBe(window)
  })

  it('jumps down by whole octaves to reach a low note', () => {
    const window = windowIncluding({ low: 60, high: 72 }, 41)
    expect(window.low).toBeLessThanOrEqual(41)
    expect(Math.abs((window.low - 60) % 12)).toBe(0)
  })

  it('jumps up by whole octaves to reach a high note', () => {
    const window = windowIncluding({ low: 60, high: 72 }, 96)
    expect(window.high).toBeGreaterThanOrEqual(96)
  })

  it('reaches every note on the piano', () => {
    for (let note = 21; note <= 108; note++) {
      const window = windowIncluding({ low: 60, high: 72 }, note)
      expect(note).toBeGreaterThanOrEqual(window.low)
      expect(note).toBeLessThanOrEqual(window.high)
    }
  })
})
