import { describe, expect, it } from 'vitest'
import { KEY_COUNTS, isBlackKey, pitchClass, STANDARD_RANGES } from '@sonara/shared'
import {
  buildLayout,
  canShift,
  chooseSpan,
  DEFAULT_KEY_COUNT,
  DEFAULT_SPAN,
  FULL_PIANO,
  KEYBOARD_SPANS,
  shiftWindow,
  spanForKeyCount,
  windowForSpan,
  windowIncluding,
} from '@/features/keyboard/keyboard-layout'

const span = (keyCount: number) => spanForKeyCount(keyCount as (typeof KEY_COUNTS)[number])

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

describe('the size table', () => {
  it('is named the way keyboards are sold', () => {
    expect(KEYBOARD_SPANS.map((s) => s.label)).toEqual([
      '25 key',
      '32 key',
      '37 key',
      '49 key',
      '61 key',
      '76 key',
      '88 key',
    ])
  })

  it('carries every standard size, smallest first', () => {
    expect(KEYBOARD_SPANS.map((s) => s.keyCount)).toEqual([...KEY_COUNTS])
  })

  it('gives each size the range that size really has', () => {
    for (const entry of KEYBOARD_SPANS) {
      const standard = STANDARD_RANGES[entry.keyCount]
      expect(entry.semitones).toBe(standard.high - standard.low)
      // The count in the name is the count of keys, black ones included.
      expect(entry.semitones + 1).toBe(entry.keyCount)
    }
  })

  it('defaults to 61 key', () => {
    expect(DEFAULT_KEY_COUNT).toBe(61)
    expect(DEFAULT_SPAN.label).toBe('61 key')
  })
})

describe('chooseSpan', () => {
  it('picks the default size on an ordinary desktop', () => {
    expect(chooseSpan(1400, false).keyCount).toBe(61)
  })

  it('never goes above the default, however much room there is', () => {
    // A 4K monitor has space for 88 keys. That is not a reason to hand someone
    // a keyboard twice the size of the one they own.
    expect(chooseSpan(3840, false).keyCount).toBe(DEFAULT_KEY_COUNT)
  })

  it('narrows once the default no longer fits', () => {
    // 61 keys is 36 white keys, so it fits comfortably at 760px and does not
    // at 600. Below that the sizes step down rather than squeezing.
    expect(chooseSpan(1400, false).keyCount).toBe(61)
    expect(chooseSpan(760, false).keyCount).toBe(61)
    expect(chooseSpan(600, false).keyCount).toBeLessThan(61)
    expect(chooseSpan(340, true).keyCount).toBeLessThan(chooseSpan(600, false).keyCount)
  })

  it('never widens as the screen narrows', () => {
    let previous = Number.POSITIVE_INFINITY
    for (const width of [1920, 1400, 1024, 900, 768, 600, 480, 390, 320]) {
      const chosen = chooseSpan(width, false).keyCount
      expect(chosen).toBeLessThanOrEqual(previous)
      previous = chosen
    }
  })

  it('keeps keys wider under a finger than under a mouse', () => {
    // Same width, different pointer: touch gets fewer, wider keys.
    expect(chooseSpan(700, true).keyCount).toBeLessThanOrEqual(chooseSpan(700, false).keyCount)
  })

  it('still returns a keyboard at 320px rather than nothing', () => {
    expect(chooseSpan(320, true).keyCount).toBeGreaterThan(0)
  })

  it('respects the minimum key width it picked for', () => {
    for (const width of [320, 480, 768, 1024, 1440, 1920]) {
      const chosen = chooseSpan(width, false)
      if (chosen.keyCount === KEYBOARD_SPANS[0]!.keyCount) continue
      expect(width / chosen.whiteKeys).toBeGreaterThanOrEqual(20)
    }
  })
})

describe('windowForSpan', () => {
  it('starts every size on the note that size really starts on', () => {
    // A 61 starts on C, a 32 on F, a 76 on E. Anchoring anywhere else would
    // show a slice of a piano rather than a keyboard anyone owns.
    for (const entry of KEYBOARD_SPANS) {
      const window = windowForSpan(entry, 60)
      expect(pitchClass(window.low)).toBe(pitchClass(STANDARD_RANGES[entry.keyCount].low))
    }
  })

  it('gives each size its standard range when anchored at its own start', () => {
    for (const entry of KEYBOARD_SPANS) {
      const standard = STANDARD_RANGES[entry.keyCount]
      expect(windowForSpan(entry, standard.low)).toEqual(standard)
    }
  })

  it('returns the real 88-key range for the full size', () => {
    expect(windowForSpan(span(88), 60)).toEqual(FULL_PIANO)
  })

  it('keeps every size inside the piano wherever it is anchored', () => {
    for (const entry of KEYBOARD_SPANS) {
      for (const anchor of [-40, 0, 21, 60, 108, 200]) {
        const window = windowForSpan(entry, anchor)
        expect(window.low).toBeGreaterThanOrEqual(21)
        expect(window.high).toBeLessThanOrEqual(108)
        expect(window.high - window.low).toBe(entry.semitones)
      }
    }
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
