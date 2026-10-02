import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CADENCE_SPEC, PROGRESSION_TYPE_LABELS, PROGRESSION_TYPES } from '@sonara/shared'
import { ProgressionOptions } from '@/features/learning/ChordControls'
import { useLearningStore } from '@/state/learning-store'

/**
 * Progressions is a category, and Cadences is the first thing in it.
 *
 * The area used to be the cadence and nothing else, so its settings were the
 * cadence's. Now they open with which type of progression is being practised
 * and the rest belongs to that type. What is pinned here is that neither that
 * move, nor the later one from icons on the bar to fields in the options
 * panel, changed anything about the cadence: every setting it had is still
 * there, under the same name, on the same value.
 */

const store = () => useLearningStore.getState()

/** Every setting in the panel, as "name: value", in the order it is shown. */
const settings = () =>
  [...document.querySelectorAll<HTMLElement>('select, [role="radiogroup"]')].map((control) => {
    if (control instanceof HTMLSelectElement) {
      const name = control.labels?.[0]?.textContent ?? control.getAttribute('aria-label')
      return `${name}: ${control.selectedOptions[0]?.textContent}`
    }
    const chosen = control.querySelector('[aria-checked="true"]')
    return `${control.getAttribute('aria-label')}: ${chosen?.textContent}`
  })

beforeEach(() => {
  store().setTopic('progressions')
  store().setProgressionType('cadences')
  store().updateCadenceSpec(DEFAULT_CADENCE_SPEC)
})

afterEach(() => {
  cleanup()
  globalThis.location.hash = ''
})

describe('the Progressions options', () => {
  it('open with the type of progression, and Cadences is the first', () => {
    render(<ProgressionOptions />)
    expect(PROGRESSION_TYPES[0]).toBe('cadences')
    expect(settings()[0]).toBe('Progression: Cadences')
  })

  it('offer every type there is, by name', () => {
    render(<ProgressionOptions />)
    const offered = [...screen.getByLabelText<HTMLSelectElement>('Progression').options].map(
      (option) => option.textContent,
    )
    expect(offered).toEqual(PROGRESSION_TYPES.map((type) => PROGRESSION_TYPE_LABELS[type]))
  })

  it('keep every setting the cadence had, on the value it opens with', () => {
    render(<ProgressionOptions />)
    expect(settings()).toEqual([
      'Progression: Cadences',
      'Key: C',
      'Major or minor: Major',
      'Voicing: Three Positions',
      'Position: All Three',
      'Dominant: Dominant seventh',
      'Hands: Both',
    ])
  })

  it('call how the cadence is laid out Voicing, so only one setting is called Position', () => {
    render(<ProgressionOptions />)
    const named = settings().map((label) => label.split(':')[0])
    expect(named.filter((name) => name === 'Position')).toHaveLength(1)
    expect(named).toContain('Voicing')
    expect(named).not.toContain('Cadence')
  })

  it('change the cadence through its settings, as they did before', () => {
    render(<ProgressionOptions />)
    fireEvent.change(screen.getByLabelText('Voicing'), { target: { value: 'root-in-bass' } })
    expect(store().cadenceSpec.form).toBe('root-in-bass')
    expect(store().exercise?.subtitle).toContain('Root in the Bass')
    // The rooted forms take both hands and play one position with both
    // dominants in turn, so the settings they have decided step aside.
    const named = settings().map((label) => label.split(':')[0])
    expect(named).not.toContain('Hands')
    expect(named).not.toContain('Position')
    expect(named).not.toContain('Dominant')
  })
})
