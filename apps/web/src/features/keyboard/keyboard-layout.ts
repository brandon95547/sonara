import {
  countWhiteKeys,
  isBlackKey,
  KEY_COUNTS,
  PIANO_HIGHEST_NOTE,
  PIANO_LOWEST_NOTE,
  pitchClass,
  snapRangeToWhiteKeys,
  STANDARD_RANGES,
  whiteKeyIndex,
  type KeyCount,
} from '@sonara/shared'

/**
 * Keyboard geometry.
 *
 * Pure functions over numbers, with no DOM and no React, because this is the
 * part that is easy to get subtly wrong and easy to test: a black key half a
 * key-width out is invisible in code review and glaring on screen.
 *
 * Everything is emitted as a percentage of the keybed's width. The keybed then
 * scales with its container with no re-measure and no re-layout — which is
 * what makes the keyboard responsive down to 320px without a media query.
 */

export interface KeyboardWindow {
  readonly low: number
  readonly high: number
}

export interface KeyGeometry {
  readonly note: number
  readonly black: boolean
  /** Left edge as a percentage of the keybed. White keys are laid out by flex and ignore this. */
  readonly leftPercent: number
  readonly widthPercent: number
}

export interface KeyboardLayout {
  readonly window: KeyboardWindow
  readonly whiteKeys: readonly KeyGeometry[]
  readonly blackKeys: readonly KeyGeometry[]
  readonly whiteCount: number
}

/**
 * Black keys are not centred on the boundary between their neighbours.
 *
 * On a real piano the three white keys under a two-black group and the four
 * under a three-black group are each slightly different widths, so the blacks
 * sit off-centre by a consistent amount. These offsets — as a fraction of one
 * white key — are the standard approximation of that, and they are the
 * difference between a keyboard that looks like a piano and one that looks
 * like a diagram of a piano.
 */
const BLACK_KEY_OFFSET: Readonly<Record<number, number>> = {
  1: -0.1, // C#
  3: 0.1, // D#
  6: -0.13, // F#
  8: 0, // G#
  10: 0.13, // A#
}

/** A black key is a little under two thirds the width of a white one. */
const BLACK_KEY_WIDTH_RATIO = 0.58

/**
 * How narrow a white key may get before it stops being playable.
 *
 * Keyed to the pointer, not the viewport — the UI Bible's rule. A 1180px
 * tablet is a finger and a 900px desktop window is a mouse, and it is the
 * finger that needs the extra millimetres.
 */
export const MIN_WHITE_KEY_WIDTH = { fine: 20, coarse: 22 } as const

export interface KeyboardSpan {
  /** The key count, as a string, so it can be a `<select>` value. */
  readonly id: string
  readonly keyCount: KeyCount
  /** How players name these: "61 key", not "5 octaves". */
  readonly label: string
  /** Semitones from the window's lowest note to its highest. */
  readonly semitones: number
  readonly whiteKeys: number
}

/**
 * The sizes the keyboard can show, built from the standard key counts the rest
 * of the app already speaks in.
 *
 * Named the way keyboards are sold and the way players talk — "61 key", not
 * "5 octaves". It is also the same vocabulary the device settings use for a
 * connected controller, so "my keyboard is a 61" and "show me 61 keys" are
 * visibly the same idea rather than two systems that happen to line up.
 *
 * Each size keeps its real range, which is why they are not all whole octaves:
 * a 32-key controller starts on F and a 76 starts on E, exactly as the hardware
 * does.
 */
export const KEYBOARD_SPANS: readonly KeyboardSpan[] = KEY_COUNTS.map((keyCount) => {
  const range = STANDARD_RANGES[keyCount]
  return {
    id: String(keyCount),
    keyCount,
    label: `${keyCount} key`,
    semitones: range.high - range.low,
    whiteKeys: countWhiteKeys(range.low, range.high),
  }
})

/**
 * What the keyboard shows unless the player says otherwise, and the ceiling on
 * what auto will choose.
 *
 * 61 is the most common size sold and covers the large majority of teaching
 * material. Auto never goes above it — a 4K monitor has room for all 88, but
 * "there is space" is not a reason to hand someone a keyboard twice the size of
 * the one they own. Picking 76 or 88 from the list is one click away.
 */
export const DEFAULT_KEY_COUNT: KeyCount = 61

export const DEFAULT_SPAN: KeyboardSpan = KEYBOARD_SPANS.find(
  (span) => span.keyCount === DEFAULT_KEY_COUNT,
) as KeyboardSpan

export const FULL_PIANO: KeyboardWindow = { low: PIANO_LOWEST_NOTE, high: PIANO_HIGHEST_NOTE }

export function spanForKeyCount(keyCount: KeyCount): KeyboardSpan {
  return KEYBOARD_SPANS.find((span) => span.keyCount === keyCount) ?? DEFAULT_SPAN
}

/**
 * The largest size whose keys stay wide enough to play at this width, never
 * larger than the default.
 *
 * Falls back to the smallest size rather than returning nothing: on a very
 * narrow screen the keys end up under the ideal width, which is a compromise —
 * showing no keyboard at all is not.
 */
export function chooseSpan(availableWidth: number, coarsePointer: boolean): KeyboardSpan {
  const minWidth = coarsePointer ? MIN_WHITE_KEY_WIDTH.coarse : MIN_WHITE_KEY_WIDTH.fine
  let best: KeyboardSpan = KEYBOARD_SPANS[0] as KeyboardSpan
  for (const span of KEYBOARD_SPANS) {
    if (span.keyCount > DEFAULT_KEY_COUNT) break
    if (span.whiteKeys * minWidth <= availableWidth) best = span
  }
  return best
}

/**
 * Positions a window of `span` at or below `anchor`.
 *
 * The window always starts on the same note name its size starts on in the real
 * world — C for most, F for a 32, E for a 76, A for a full 88. That is what
 * keeps a resize from disorienting the player: the window changes size, but the
 * shape under their eyes is still the shape they already read, and it is the
 * shape of an actual keyboard rather than an arbitrary slice of one.
 */
export function windowForSpan(span: KeyboardSpan, anchor: number): KeyboardWindow {
  const standard = STANDARD_RANGES[span.keyCount]
  const highestStart = PIANO_HIGHEST_NOTE - span.semitones
  if (highestStart <= PIANO_LOWEST_NOTE) return FULL_PIANO

  const desired = Math.min(Math.max(anchor, PIANO_LOWEST_NOTE), highestStart)
  // Snap down to the pitch class this size starts on.
  const offset = (pitchClass(desired) - pitchClass(standard.low) + 12) % 12
  let low = desired - offset
  if (low < PIANO_LOWEST_NOTE) low += 12
  if (low + span.semitones > PIANO_HIGHEST_NOTE) low -= 12
  return { low, high: low + span.semitones }
}

/** Moves the window by whole octaves, stopping at the ends of the piano. */
export function shiftWindow(window: KeyboardWindow, octaves: number): KeyboardWindow {
  const span = window.high - window.low
  const low = window.low + octaves * 12
  if (low < PIANO_LOWEST_NOTE) return { low: PIANO_LOWEST_NOTE, high: PIANO_LOWEST_NOTE + span }
  if (low + span > PIANO_HIGHEST_NOTE) {
    return { low: PIANO_HIGHEST_NOTE - span, high: PIANO_HIGHEST_NOTE }
  }
  return { low, high: low + span }
}

/**
 * The smallest octave shift that brings `note` into view, or the window
 * unchanged if it is already there.
 *
 * Whole octaves rather than "scroll until it fits": a keyboard that jumps by
 * three semitones leaves the player looking at a C where a D used to be, and
 * they lose their place. An octave jump keeps every key under the same finger.
 */
export function windowIncluding(window: KeyboardWindow, note: number): KeyboardWindow {
  if (note >= window.low && note <= window.high) return window
  const octaves =
    note < window.low ? -Math.ceil((window.low - note) / 12) : Math.ceil((note - window.high) / 12)
  return shiftWindow(window, octaves)
}

export function canShift(window: KeyboardWindow, octaves: number): boolean {
  const moved = shiftWindow(window, octaves)
  return moved.low !== window.low
}

/** Turns a window into positioned keys. */
export function buildLayout(window: KeyboardWindow): KeyboardLayout {
  const { low, high } = snapRangeToWhiteKeys(window.low, window.high)
  const whiteCount = countWhiteKeys(low, high)
  const whiteFraction = whiteCount > 0 ? 100 / whiteCount : 100
  const blackWidthPercent = whiteFraction * BLACK_KEY_WIDTH_RATIO

  const whiteKeys: KeyGeometry[] = []
  const blackKeys: KeyGeometry[] = []

  for (let note = low; note <= high; note++) {
    if (!isBlackKey(note)) {
      whiteKeys.push({
        note,
        black: false,
        leftPercent: whiteKeyIndex(note, low) * whiteFraction,
        widthPercent: whiteFraction,
      })
      continue
    }

    // A black key sits at the boundary above the white key below it, nudged by
    // the offset for its pitch class.
    const boundary = (whiteKeyIndex(note, low) + 1) * whiteFraction
    const offset = (BLACK_KEY_OFFSET[pitchClass(note)] ?? 0) * whiteFraction
    blackKeys.push({
      note,
      black: true,
      leftPercent: boundary + offset - blackWidthPercent / 2,
      widthPercent: blackWidthPercent,
    })
  }

  return { window: { low, high }, whiteKeys, blackKeys, whiteCount }
}
