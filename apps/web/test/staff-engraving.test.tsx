import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { writtenValue } from '@sonara/shared'
import { Chord, chordExtent, type DrawnNote } from '@/features/staff/StaffNotes'
import { STEP, yOn } from '@/features/staff/staff-frame'

afterEach(cleanup)

/**
 * The staff, checked as geometry rather than as a picture.
 *
 * Everything here was a bug you could see and not describe: a fingering under
 * a sharp, two numbers merged into one, a stem on a high note trailing off
 * into nothing. None of it broke a render, so nothing failed — the score just
 * looked slightly wrong in a way no assertion was watching.
 *
 * These read the marks back out of the SVG and check they do not touch. It is
 * a coarse model of type — jsdom does no layout, so the glyph boxes below are
 * estimates from the font sizes the stylesheet sets — but the failure it
 * catches is two marks in the same place, which coarse is plenty for.
 */

/*
 * The glyphs, measured in the running app with getBBox at the sizes the
 * stylesheet sets — jsdom does no layout, so it cannot measure them itself.
 *
 * These were guesses once, and both guesses were wrong in the direction that
 * hides a collision: the numeral is taller than it looks and the sharp is
 * narrower. If sonara.css changes a font size, these have to change with it.
 */
const SHARP = { width: 10.46, above: 21.23, below: 5.31 }
const FINGER = { width: 4.27, above: 9.73, below: 2.48 }

interface Box {
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
  readonly what: string
}

const num = (el: Element, name: string) => Number(el.getAttribute(name) ?? 0)

function draw(notes: readonly DrawnNote[], fifths = 0, durationMs = 500) {
  const value = writtenValue(durationMs, 500)
  const { container } = render(
    <svg>
      <Chord x={200} notes={notes} value={value} fifths={fifths} />
    </svg>,
  )
  return container.querySelector('svg')!
}

function boxes(svg: SVGElement): Box[] {
  const out: Box[] = []
  for (const head of svg.querySelectorAll('ellipse')) {
    const [cx, cy, rx, ry] = ['cx', 'cy', 'rx', 'ry'].map((name) => num(head, name)) as number[]
    out.push({ x1: cx! - rx!, y1: cy! - ry!, x2: cx! + rx!, y2: cy! + ry!, what: 'notehead' })
  }
  for (const line of svg.querySelectorAll('.staff__stem, .staff__ledger')) {
    const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map((name) => num(line, name)) as number[]
    out.push({
      x1: Math.min(x1!, x2!) - 0.9,
      y1: Math.min(y1!, y2!) - 0.9,
      x2: Math.max(x1!, x2!) + 0.9,
      y2: Math.max(y1!, y2!) + 0.9,
      what: line.classList.contains('staff__stem') ? 'stem' : 'ledger',
    })
  }
  // Accidentals start at their x; fingerings are centred on theirs.
  for (const text of svg.querySelectorAll('.staff__accidental')) {
    const [x, y] = [num(text, 'x'), num(text, 'y')]
    out.push({
      x1: x,
      y1: y - SHARP.above,
      x2: x + SHARP.width,
      y2: y + SHARP.below,
      what: `accidental@${y.toFixed(0)}`,
    })
  }
  for (const text of svg.querySelectorAll('.staff__finger')) {
    const [x, y] = [num(text, 'x'), num(text, 'y')]
    out.push({
      x1: x - FINGER.width / 2,
      y1: y - FINGER.above,
      x2: x + FINGER.width / 2,
      y2: y + FINGER.below,
      what: `finger ${text.textContent}@${y.toFixed(0)}`,
    })
  }
  return out
}

const hits = (a: Box, b: Box) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2

/** Every pair of marks that share space, named so a failure says what touched. */
function collisions(svg: SVGElement): string[] {
  const all = boxes(svg)
  const found: string[] = []
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const [a, b] = [all[i]!, all[j]!]
      // A stem leaves from inside its own noteheads and crosses the ledger
      // lines on its way out, and a ledger line runs through the head it
      // carries. Those are how notation is drawn, not marks in each other's
      // way. Everything hung off the chord has to keep clear of them.
      const drawn = new Set(['stem', 'ledger', 'notehead'])
      const structural = drawn.has(a.what) && drawn.has(b.what) && a.what !== b.what
      if (!structural && hits(a, b)) found.push(`${a.what} × ${b.what}`)
    }
  }
  return found
}

const fingered = (notes: readonly number[]): DrawnNote[] =>
  notes.map((note, index) => ({ note, finger: (index % 5) + 1 }))

describe('chord engraving', () => {
  it('keeps fingerings off a chord thick with accidentals', () => {
    // Every black key in an octave, in C major, so each one prints its own.
    expect(collisions(draw(fingered([61, 63, 66, 68, 70]), 0))).toEqual([])
  })

  it('keeps fingerings apart when the notes are seconds', () => {
    // Adjacent notes are one step — five units — apart, and the numerals are
    // ten tall. Placed naively, every one of these overlaps its neighbour.
    expect(collisions(draw(fingered([60, 62, 64, 65, 67])))).toEqual([])
  })

  it('keeps fingerings off the ledger lines under a low chord', () => {
    expect(collisions(draw(fingered([36, 40, 43])))).toEqual([])
  })

  it('holds a whole grand-staff chord clear', () => {
    expect(collisions(draw(fingered([37, 41, 44, 61, 66, 70]), 0))).toEqual([])
  })

  it('holds clear when the notes are flagged', () => {
    // A quaver's flag curls out to the side the fingerings are on.
    expect(collisions(draw(fingered([61, 63, 66, 70]), 0, 250))).toEqual([])
  })

  it('holds clear when the notes are dotted', () => {
    // Dots take a column of their own, between the chord and its fingerings.
    expect(collisions(draw(fingered([60, 62, 64, 67]), 0, 750))).toEqual([])
  })

  it('stacks accidentals into columns rather than one on another', () => {
    const svg = draw(fingered([61, 63, 66, 68, 70]), 0)
    const xs = [...svg.querySelectorAll('.staff__accidental')].map((el) => num(el, 'x'))
    // Five sharps inside an octave cannot share one column.
    expect(new Set(xs).size).toBeGreaterThan(1)
  })

  it('keeps the fingering column on the opposite side from the accidentals', () => {
    // Fingerings went outside the accidentals once. It reads fine until a
    // chord carries four sharps, and then the column is driven so far left
    // that it lands on the previous chord — so they sit on the other side.
    const svg = draw(fingered([61, 63, 66, 68, 70]), 0)
    const heads = [...svg.querySelectorAll('ellipse')].map((e) => num(e, 'cx'))
    const finger = Math.min(...[...svg.querySelectorAll('.staff__finger')].map((e) => num(e, 'x')))
    const accidental = Math.max(
      ...[...svg.querySelectorAll('.staff__accidental')].map((e) => num(e, 'x')),
    )
    expect(accidental).toBeLessThan(Math.min(...heads))
    expect(finger).toBeGreaterThan(Math.max(...heads))
  })

  it('never puts a fingering further out than the chord needs', () => {
    // The column stays with the chord it belongs to. When it drifts, it is
    // sitting on a neighbour rather than pointing at anything.
    const svg = draw(fingered([61, 63, 66, 68, 70]), 0)
    const heads = [...svg.querySelectorAll('ellipse')].map((e) => num(e, 'cx'))
    const finger = Math.max(...[...svg.querySelectorAll('.staff__finger')].map((e) => num(e, 'x')))
    expect(finger - Math.max(...heads)).toBeLessThan(4 * STEP)
  })
})

describe('stems', () => {
  it('reaches back to the middle line from far above the staff', () => {
    // C7 is fifteen steps over the middle line. An octave-long stem would stop
    // well short of it and leave the note hanging off the top of the system.
    const svg = draw([{ note: 96 }])
    const stem = svg.querySelector('.staff__stem')!
    expect(num(stem, 'y2')).toBeCloseTo(yOn(6, 'treble'), 5)
  })

  it('is a plain octave when the note is near the staff', () => {
    // E4 sits at the bottom of the treble staff: stem up, no clamp needed.
    const svg = draw([{ note: 64 }])
    const stem = svg.querySelector('.staff__stem')!
    expect(num(stem, 'y1') - num(stem, 'y2')).toBeCloseTo(7 * STEP, 5)
  })

  it('crosses a second to the far side of the stem', () => {
    // Two heads a step apart cannot share a column; one moves across.
    const svg = draw([{ note: 60 }, { note: 62 }])
    const xs = [...svg.querySelectorAll('ellipse')].map((el) => num(el, 'cx'))
    expect(new Set(xs).size).toBe(2)
  })
})

describe('how much room a chord asks for', () => {
  /**
   * The page places chords using `chordExtent`, and grows its frame to fit
   * them. If that under-reports, marks are drawn outside the picture and
   * simply vanish — which is what used to happen to anything in the top
   * octave, noteheads and all, with the staff beneath looking perfectly fine.
   */
  const cases: readonly (readonly number[])[] = [
    [61, 63, 66, 68, 70],
    [36, 40, 43],
    [84, 88, 91],
    [37, 41, 44, 61, 66, 70],
    [60, 62, 64, 65, 67],
  ]

  it.each(cases.map((notes) => [notes.join(' '), notes] as const))(
    'covers every mark it draws: %s',
    (_name, notes) => {
      const drawn = fingered(notes)
      const value = writtenValue(500, 500)
      const svg = draw(drawn)
      const extent = chordExtent(drawn, value, 0)
      const all = boxes(svg)
      // The chord is drawn at x = 200; the extents are relative to that.
      expect(Math.min(...all.map((b) => b.x1))).toBeGreaterThanOrEqual(200 - extent.left)
      expect(Math.max(...all.map((b) => b.x2))).toBeLessThanOrEqual(200 + extent.right)
      expect(Math.min(...all.map((b) => b.y1))).toBeGreaterThanOrEqual(extent.top)
      expect(Math.max(...all.map((b) => b.y2))).toBeLessThanOrEqual(extent.bottom)
    },
  )
})
