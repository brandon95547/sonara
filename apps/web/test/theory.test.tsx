import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ScaleTheoryDialog } from '@/features/learning/ScaleTheoryDialog'
import { FundamentalsDrawer } from '@/features/theory/FundamentalsDrawer'
import { KeyTheoryDrawer } from '@/features/theory/KeyTheoryDrawer'
import { useLearningStore } from '@/state/learning-store'
import { usePanelStore } from '@/state/panel-store'

/*
 * The drawer asks whether the screen is narrow, and jsdom has no opinion.
 */
globalThis.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent: () => false,
  onchange: null,
})) as unknown as typeof globalThis.matchMedia

afterEach(cleanup)

const store = () => useLearningStore.getState()
const noop = () => {}

/** The marked key on the circle, as it is written there. */
const marked = () =>
  screen
    .getAllByRole('button', { pressed: true })
    .map((button) => button.textContent)
    .join()

/**
 * "Understand this…" explains what is on the keys, in the key it is in. Each
 * of these checks that the panel is about the selection — a panel that always
 * explained C major would read perfectly well and be wrong eleven times in
 * twelve.
 */
describe('understanding the chords of a key', () => {
  beforeEach(() => {
    store().setTopic('chords')
    store().updateChordSpec({ rootPitchClass: 9, mode: 'minor', tonic: undefined, chord: 'triad' })
  })

  it('builds the triad from the key’s own notes', () => {
    render(<KeyTheoryDrawer open onClose={noop} topic="chords" />)
    const dialog = screen.getByRole('dialog', { name: 'Understand these chords' })
    expect(dialog.textContent).toContain('A to C is a minor 3rd — three half steps')
    expect(dialog.textContent).toContain('That makes Am a minor triad')
    // Root on top in the 1st inversion, in the middle in the 2nd.
    expect(dialog.textContent).toContain('C E A')
    expect(dialog.textContent).toContain('E A C')
  })

  it('lists the chord on every degree, and says why a minor key’s are what they are', () => {
    render(<KeyTheoryDrawer open onClose={noop} topic="chords" />)
    const text = screen.getByRole('dialog').textContent
    for (const chord of ['Am · i', 'Bdim · ii°', 'Caug · III+', 'Dm · iv', 'E · V', 'F · VI'])
      expect(text).toContain(chord)
    expect(text).toContain('takes its chords from the harmonic minor')
    // And its seventh chord is the diminished one, on the raised 7th.
    expect(text).toContain('The diminished seventh')
    expect(text).toContain('G♯ B D F')
  })

  it('explains the dominant seventh instead, in a major key', () => {
    store().updateChordSpec({ rootPitchClass: 0, mode: 'major' })
    render(<KeyTheoryDrawer open onClose={noop} topic="chords" />)
    const text = screen.getByRole('dialog').textContent
    expect(text).toContain('The dominant seventh')
    expect(text).toContain('G B D F')
    expect(text).not.toContain('The diminished seventh')
  })
})

describe('understanding a cadence', () => {
  beforeEach(() => {
    store().setTopic('progressions')
    store().updateCadenceSpec({ rootPitchClass: 7, mode: 'major', tonic: undefined })
  })

  it('names the primary chords and the notes that stay put between them', () => {
    render(<KeyTheoryDrawer open onClose={noop} topic="progressions" />)
    const text = screen.getByRole('dialog', { name: 'Understand this cadence' }).textContent
    expect(text).toContain('G — G B D')
    expect(text).toContain('C — C E G')
    expect(text).toContain('D — D F♯ A')
    // The positions the cadence is actually played in.
    expect(text).toContain('G C E')
    expect(text).toContain('F♯ A D')
    expect(text).toContain('G from G to C, D from G to D')
  })
})

describe('understanding a routine', () => {
  beforeEach(() => store().setTopic('exercises'))

  it('says what the routine is for', () => {
    store().updateRoutineSpec({ routine: 'accelerating', rootPitchClass: 0, mode: 'major' })
    render(<KeyTheoryDrawer open onClose={noop} topic="exercises" />)
    const text = screen.getByRole('dialog', { name: 'Understand this routine' }).textContent
    expect(text).toContain('One pulse, four speeds')
  })

  it('spells the four triads of the chain on the root that was chosen', () => {
    store().updateRoutineSpec({ routine: 'triad-chain', rootPitchClass: 2 })
    render(<KeyTheoryDrawer open onClose={noop} topic="exercises" />)
    const text = screen.getByRole('dialog').textContent
    expect(text).toContain('D — D F♯ A')
    expect(text).toContain('Dm — D F A')
    expect(text).toContain('D° — D F A♭')
    expect(text).toContain('D+ — D F♯ A♯')
    // Built on a note, not in a key: nothing on the circle is marked.
    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0)
  })
})

describe('the circle of fifths in a theory panel', () => {
  it('marks the key being played, and its two neighbours', () => {
    store().setTopic('chords')
    store().updateChordSpec({ rootPitchClass: 2, mode: 'major', tonic: undefined })
    render(<KeyTheoryDrawer open onClose={noop} topic="chords" />)
    expect(marked()).toBe('D')
    const circle = screen.getByRole('group', { name: 'Circle of fifths' })
    expect(circle.textContent).toContain('2♯')
    expect(circle.textContent).toContain('F♯ C♯')
    expect([...circle.querySelectorAll('[data-near]')].map((button) => button.textContent)).toEqual(
      ['G', 'A'],
    )
  })

  it('changes the key when one is pressed', () => {
    store().setTopic('arpeggios')
    store().updateArpeggioSpec({ rootPitchClass: 0, mode: 'major', tonic: undefined })
    render(<KeyTheoryDrawer open onClose={noop} topic="arpeggios" />)
    const circle = screen.getByRole('group', { name: 'Circle of fifths' })

    fireEvent.click(within(circle).getByRole('button', { name: /^E minor/ }))
    expect(store().arpeggioSpec).toMatchObject({ rootPitchClass: 4, mode: 'minor' })
    expect(store().exercise?.title).toBe('E Minor Arpeggio')
    expect(marked()).toBe('Em')
  })

  it('is in the scale’s panel too, and keeps the minor form that was chosen', () => {
    store().setTopic('scales')
    store().updateSpec({ rootPitchClass: 9, scaleTypeId: 'harmonic-minor', tonic: undefined })
    render(<ScaleTheoryDialog open onClose={noop} />)
    expect(marked()).toBe('Am')

    const circle = screen.getByRole('group', { name: 'Circle of fifths' })
    fireEvent.click(within(circle).getByRole('button', { name: /^D minor/ }))
    expect(store().spec).toMatchObject({ rootPitchClass: 2, scaleTypeId: 'harmonic-minor' })

    fireEvent.click(within(circle).getByRole('button', { name: /^F major/ }))
    expect(store().spec).toMatchObject({ rootPitchClass: 5, scaleTypeId: 'major' })
  })

  it('marks nothing for a scale that is not in a key', () => {
    store().setTopic('scales')
    store().updateSpec({ rootPitchClass: 0, scaleTypeId: 'blues', tonic: undefined })
    render(<ScaleTheoryDialog open onClose={noop} />)
    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0)
    expect(screen.getByRole('group', { name: 'Circle of fifths' }).textContent).toContain(
      'Pick a key',
    )
  })
})

describe('the fundamentals', () => {
  beforeEach(() => {
    usePanelStore.getState().open('fundamentals')
    globalThis.location.hash = '#/'
  })

  it('is eleven lessons, in the order the book teaches them', () => {
    render(<FundamentalsDrawer open onClose={noop} />)
    const titles = screen
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent)
    expect(titles).toHaveLength(11)
    expect(titles[0]).toBe('Half steps, whole steps and the tetrachord')
    expect(titles[3]).toBe('The primary triads, and the cadence')
    expect(titles[10]).toBe('The diminished seventh chord')
  })

  it('sets the app to what a lesson is about, with the answers on the keys', () => {
    store().setMode('practice')
    render(<FundamentalsDrawer open onClose={noop} />)

    fireEvent.click(screen.getByRole('button', { name: 'Play the cadence of A minor' }))
    expect(store().progressionType).toBe('cadences')
    expect(store().cadenceSpec).toMatchObject({
      rootPitchClass: 9,
      mode: 'minor',
      form: 'positions',
      position: 0,
      dominant: 'V',
    })
    expect(store().mode).toBe('learn')
    expect(globalThis.location.hash).toBe('#/progressions/cadences')
    expect(usePanelStore.getState().panel).toBeNull()
  })

  it('clears whatever the Scales area was last doing before a scale lesson', () => {
    store().updateSpec({ hand: 'both', motion: 'contrary', notesPerBeat: 4, octaves: 3 })
    render(<FundamentalsDrawer open onClose={noop} />)

    fireEvent.click(screen.getByRole('button', { name: 'Play A harmonic minor' }))
    expect(store().spec).toMatchObject({
      rootPitchClass: 9,
      scaleTypeId: 'harmonic-minor',
      hand: 'right',
      octaves: 1,
      direction: 'up-down',
    })
    expect(store().spec.motion).toBeUndefined()
    expect(store().spec.notesPerBeat).toBeUndefined()
  })
})
