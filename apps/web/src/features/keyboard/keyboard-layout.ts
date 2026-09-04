import {
  countWhiteKeys,
  isBlackKey,
  PIANO_HIGHEST_NOTE,
  PIANO_LOWEST_NOTE,
  pitchClass,
  snapRangeToWhiteKeys,
  whiteKeyIndex,
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
  readonly id: string
  readonly label: string
  /** Semitones from the window's lowest note to its highest. */
  readonly semitones: number
}

/**
 * The spans the keyboard can show, smallest first. Whole octaves so the window
 * always starts on a C and the player's mental map of the keyboard survives a
 * resize — except the full span, which is a real 88-key piano, A0 to C8.
 */
export const KEYBOARD_SPANS: readonly KeyboardSpan[] = [
  { id: '1', label: '1 octave', semitones: 12 },
  { id: '2', label: '2 octaves', semitones: 24 },
  { id: '3', label: '3 octaves', semitones: 36 },
  { id: '4', label: '4 octaves', semitones: 48 },
  { id: '5', label: '5 octaves', semitones: 60 },
  { id: '6', label: '6 octaves', semitones: 72 },
  { id: 'full', label: 'Full 88', semitones: PIANO_HIGHEST_NOTE - PIANO_LOWEST_NOTE },
]

export const FULL_PIANO: KeyboardWindow = { low: PIANO_LOWEST_NOTE, high: PIANO_HIGHEST_NOTE }

/** White keys in a window of this many semitones, anchored on a C. */
function whiteKeysInSpan(span: KeyboardSpan): number {
  if (span.id === 'full') return countWhiteKeys(PIANO_LOWEST_NOTE, PIANO_HIGHEST_NOTE)
  return countWhiteKeys(60, 60 + span.semitones)
}

/**
 * The largest span whose keys stay wide enough to play at this width.
 *
 * Falls back to the smallest span rather than returning nothing: on a very
 * narrow screen the keys end up under the ideal width, which is a compromise —
 * showing no keyboard at all is not.
 */
export function chooseSpan(availableWidth: number, coarsePointer: boolean): KeyboardSpan {
  const minWidth = coarsePointer ? MIN_WHITE_KEY_WIDTH.coarse : MIN_WHITE_KEY_WIDTH.fine
  let best: KeyboardSpan = KEYBOARD_SPANS[0] as KeyboardSpan
  for (const span of KEYBOARD_SPANS) {
    if (whiteKeysInSpan(span) * minWidth <= availableWidth) best = span
  }
  return best
}

/** The lowest C on an 88-key piano. A0 and B0 sit below it. */
const LOWEST_C = 24

/**
 * Builds a window of `span` starting at or below `anchor`, snapped down to a C.
 *
 * Anchoring on a C is what keeps a resize from disorienting the player: the
 * window changes size, but the shape under their eyes is still the shape they
 * already read. A window starting on an F# is a piano nobody has seen.
 */
export function windowForSpan(span: KeyboardSpan, anchor: number): KeyboardWindow {
  if (span.id === 'full') return FULL_PIANO

  const highestStart = PIANO_HIGHEST_NOTE - span.semitones
  const desired = Math.min(Math.max(anchor, PIANO_LOWEST_NOTE), highestStart)
  let low = Math.max(LOWEST_C, desired - pitchClass(desired))
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
