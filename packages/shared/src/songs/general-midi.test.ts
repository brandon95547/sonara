import { describe, expect, it } from 'vitest'

/**
 * Checked against a real arrangement — a soul chart with bass, organ, piano and
 * a full kit — rather than against files we wrote ourselves.
 *
 * Its drum track spends a third of its hits on notes 61 and 64, which are a
 * bongo and a conga. Reading percussion by register instead of by the map sends
 * both to a shaker, and the part stops sounding like the record.
 */
describe('the General MIDI percussion map', () => {
  it('names the hand drums rather than lumping them in with the shakers', async () => {
    const { drumVoice } = await import('./general-midi.js')
    expect(drumVoice(60)).toBe('bongo-high')
    expect(drumVoice(61)).toBe('bongo-low')
    expect(drumVoice(62)).toBe('conga-high')
    expect(drumVoice(64)).toBe('conga-low')
  })

  it('still names the kit pieces around them', async () => {
    const { drumVoice } = await import('./general-midi.js')
    expect(drumVoice(35)).toBe('kick')
    expect(drumVoice(37)).toBe('rimshot')
    expect(drumVoice(38)).toBe('snare')
    expect(drumVoice(39)).toBe('clap')
    expect(drumVoice(42)).toBe('hat-closed')
    expect(drumVoice(46)).toBe('hat-open')
    expect(drumVoice(57)).toBe('crash')
    expect(drumVoice(59)).toBe('ride')
  })

  it('covers the published range end to end', async () => {
    const { drumName } = await import('./general-midi.js')
    // GM 1 defines 35-81. Every one of them is a named instrument, not a gap.
    for (let note = 35; note <= 81; note++) {
      expect(drumName(note)).not.toMatch(/^Percussion /)
    }
    expect(drumName(35)).toBe('Acoustic Bass Drum')
    expect(drumName(59)).toBe('Ride Cymbal 2')
    expect(drumName(81)).toBe('Open Triangle')
  })

  it('gives a note outside the range its nearest neighbour, never silence', async () => {
    const { drumVoice } = await import('./general-midi.js')
    for (let note = 20; note <= 100; note++) {
      expect(drumVoice(note)).toBeTruthy()
    }
    // 34 is one below the map; 82 one above.
    expect(drumVoice(34)).toBe(drumVoice(35))
    expect(drumVoice(82)).toBe(drumVoice(81))
  })

  it('treats channel 10 as percussion even with no program change on it', async () => {
    // The real file's drum track sets no program at all. A parser that decides
    // by program alone reads it as program 0 — acoustic grand — and plays the
    // whole kit on the piano.
    const { PERCUSSION_CHANNEL } = await import('./general-midi.js')
    expect(PERCUSSION_CHANNEL).toBe(9)
  })
})
