import { describe, expect, it } from 'vitest'
import { applyVelocityCurve, clampVelocity, velocityToGain } from './velocity.js'

describe('applyVelocityCurve', () => {
  it('passes linear through untouched', () => {
    expect(applyVelocityCurve(64, 'linear')).toBe(64)
  })

  it('lifts quiet notes on a soft curve and lowers them on a hard one', () => {
    expect(applyVelocityCurve(64, 'soft')).toBeGreaterThan(64)
    expect(applyVelocityCurve(64, 'hard')).toBeLessThan(64)
  })

  it('keeps the endpoints fixed on every curve', () => {
    for (const curve of ['soft', 'hard'] as const) {
      expect(applyVelocityCurve(127, curve)).toBe(127)
      expect(applyVelocityCurve(1, curve)).toBeGreaterThanOrEqual(1)
    }
  })

  it('is monotonic, so a crescendo never dips', () => {
    for (const curve of ['soft', 'hard'] as const) {
      let previous = 0
      for (let v = 1; v <= 127; v++) {
        const out = applyVelocityCurve(v, curve)
        expect(out).toBeGreaterThanOrEqual(previous)
        previous = out
      }
    }
  })

  it('ignores the input entirely when fixed', () => {
    expect(applyVelocityCurve(12, 'fixed', 90)).toBe(90)
    expect(applyVelocityCurve(127, 'fixed', 90)).toBe(90)
  })
})

describe('clampVelocity', () => {
  it('never returns 0, which would be read downstream as a note off', () => {
    expect(clampVelocity(0)).toBe(1)
    expect(clampVelocity(-5)).toBe(1)
    expect(clampVelocity(Number.NaN)).toBe(1)
  })

  it('caps at 127', () => {
    expect(clampVelocity(200)).toBe(127)
  })
})

describe('velocityToGain', () => {
  it('spans 0 to 1', () => {
    expect(velocityToGain(127)).toBeCloseTo(1, 5)
    expect(velocityToGain(1)).toBeGreaterThan(0)
  })
})
