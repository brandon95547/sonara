import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CADENCE_SPEC, PROGRESSION_TYPE_LABELS, PROGRESSION_TYPES } from '@sonara/shared'
import { ProgressionSettings } from '@/features/learning/ChordControls'
import { useLearningStore } from '@/state/learning-store'

/**
 * Progressions is a category, and Cadences is the first thing in it.
 *
 * The area used to be the cadence and nothing else, so its bar was the
 * cadence's settings. Now the bar opens with which type of progression is
 * being practised and the rest belongs to that type. What is pinned here is
 * that the move changed where the cadence lives and nothing about it: every
 * setting it had is still there, under the same name, on the same value.
 */

const store = () => useLearningStore.getState()
const settings = () =>
  screen
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label'))
    .filter((label): label is string => label !== null)

beforeEach(() => {
  store().setTopic('progressions')
  store().setProgressionType('cadences')
  store().updateCadenceSpec(DEFAULT_CADENCE_SPEC)
})

afterEach(() => {
  cleanup()
  globalThis.location.hash = ''
})

describe('the Progressions bar', () => {
  it('opens with the type of progression, and Cadences is the first', () => {
    render(<ProgressionSettings />)
    expect(PROGRESSION_TYPES[0]).toBe('cadences')
    expect(settings()[0]).toBe('Progression: Cadences')
  })

  it('offers every type there is, by name', () => {
    render(<ProgressionSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Progression: Cadences' }))
    const offered = screen.getAllByRole('menuitemradio').map((item) => item.textContent)
    expect(offered).toHaveLength(PROGRESSION_TYPES.length)
    for (const [index, type] of PROGRESSION_TYPES.entries())
      expect(offered[index]).toContain(PROGRESSION_TYPE_LABELS[type])
  })

  it('keeps every setting the cadence had, on the value it opens with', () => {
    render(<ProgressionSettings />)
    expect(settings()).toEqual([
      'Progression: Cadences',
      'Key: C Major — C Major Cadence',
      'Cadence: Three Positions',
      'Position: All Three',
      'Dominant: Dominant seventh',
      'Hands: Both Hands',
    ])
  })

  it('changes the cadence through its settings, as it did before', () => {
    render(<ProgressionSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Cadence: Three Positions' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Root in the Bass/ }))
    expect(store().cadenceSpec.form).toBe('root-in-bass')
    expect(store().exercise?.subtitle).toContain('Root in the Bass')
    // The rooted forms take both hands, so the hand setting steps aside.
    expect(settings()).not.toContain('Hands: Both Hands')
  })
})
