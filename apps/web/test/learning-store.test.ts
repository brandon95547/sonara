import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_ARPEGGIO_SPEC,
  DEFAULT_CHORD_SPEC,
  DEFAULT_SCALE_SPEC,
  tempo,
} from '@sonara/shared'
import { useLearningStore } from '@/state/learning-store'

/**
 * The annotation map is the entire interface between the learning system and
 * the keyboard. If it is wrong, the right key does not light up — and no test
 * of the engine underneath would notice, because the engine is fine.
 */

const store = () => useLearningStore.getState()
const roles = () =>
  Object.entries(store().annotations).map(([note, annotation]) => [Number(note), annotation.role])
const roleOf = (note: number) => store().annotations[note]?.role
const notes = () => store().exercise!.notes

beforeEach(() => {
  useLearningStore.setState({ autoTempo: false })
  store().setTopic('scales')
  // Every optional setting cleared as well: a patch only changes what it names,
  // and one test's double thirds must not become the next one's.
  store().updateSpec({
    ...DEFAULT_SCALE_SPEC,
    tonic: undefined,
    motion: undefined,
    texture: undefined,
    cadence: undefined,
  })
  store().setMode('learn')
})

describe('learn mode', () => {
  it('marks the first step as the target and the rest as upcoming', () => {
    const [first, second] = notes()
    expect(roleOf(first!)).toBe('target')
    expect(roleOf(second!)).toBe('upcoming')
  })

  it('puts a recommended finger on every step it lights', () => {
    for (const note of notes()) {
      expect(store().annotations[note]?.finger).toBeGreaterThanOrEqual(1)
    }
  })

  it('shows the movement cue only on the key it applies to', () => {
    const cued = Object.values(store().annotations).filter((a) => a.cue)
    // Exactly one cue can be current at a time — the one on the target.
    expect(cued.length).toBeLessThanOrEqual(1)
    if (cued.length === 1) expect(cued[0]!.role).toBe('target')
  })

  it('moves the target forward as notes are played, and keeps the played ones lit', () => {
    const [first, second] = notes()
    store().start()
    store().noteOn(first!)

    expect(roleOf(second!)).toBe('target')
    // The scale does not empty out behind you — the shape stays visible.
    expect(roleOf(first!)).toBe('scale')
    expect(store().annotations[first!]?.finger).toBeUndefined()
  })

  it('does not move the target on a wrong note, and flashes it instead', () => {
    const [first] = notes()
    store().start()
    store().noteOn(first! + 1)

    expect(roleOf(first!)).toBe('target')
    expect(roleOf(first! + 1)).toBe('wrong')
    expect(store().session.mistakes).toBe(1)
  })

  it('ignores notes before the session is started', () => {
    store().noteOn(notes()[0]!)
    expect(store().session.completedSteps).toBe(0)
  })

  it('lights only the octaves the exercise walks', () => {
    // An A two octaves below the exercise is still an A, but it is not part of
    // this run — Learn is about a specific path, not about the scale in general.
    expect(roleOf(33)).toBeUndefined()
  })
})

describe('explore mode', () => {
  beforeEach(() => store().setMode('explore'))

  it('lights every octave of the scale', () => {
    expect(roleOf(33)).toBe('root') // A1
    expect(roleOf(45)).toBe('root') // A2
    expect(roleOf(35)).toBe('scale') // B1
    expect(roleOf(34)).toBeUndefined() // A♯ is not in A minor
  })

  it('marks the tonic differently from the rest', () => {
    const rootCount = roles().filter(([, role]) => role === 'root').length
    expect(rootCount).toBeGreaterThan(4)
  })

  it('shows no target and no finger numbers', () => {
    expect(roles().some(([, role]) => role === 'target')).toBe(false)
    expect(Object.values(store().annotations).some((a) => a.finger !== undefined)).toBe(false)
  })

  it('names every lit key with its spelled note', () => {
    store().updateSpec({ rootPitchClass: 4, scaleTypeId: 'major' })
    // E major's third black key is D♯, not E♭.
    const names = new Set(Object.values(store().annotations).map((a) => a.label))
    expect(names).toContain('D♯')
    expect(names).not.toContain('E♭')
  })
})

describe('practice mode', () => {
  beforeEach(() => store().setMode('practice'))

  it('takes the guidance away entirely', () => {
    expect(Object.keys(store().annotations)).toHaveLength(0)
  })

  it('still keeps score', () => {
    const [first] = notes()
    store().start()
    store().noteOn(first!)
    store().noteOn(first!) // wrong now — the step has moved on
    expect(store().session.completedSteps).toBe(1)
    expect(store().session.mistakes).toBe(1)
  })

  it('shows a wrong note and nothing else', () => {
    store().start()
    store().noteOn(notes()[0]! + 1)
    expect(roles()).toEqual([[notes()[0]! + 1, 'wrong']])
  })
})

describe('changing the exercise', () => {
  it('starts the run again on the new scale rather than carrying the score across', () => {
    store().start()
    store().noteOn(notes()[0]!)
    expect(store().session.completedSteps).toBe(1)

    store().updateSpec({ rootPitchClass: 0 })
    expect(store().session.status).toBe('running')
    expect(store().session.completedSteps).toBe(0)
    expect(store().session.stepIndex).toBe(0)
  })

  it('counts a run finished after the direction is turned round mid-run', () => {
    // The reported bug: switch to descending partway up, play the scale down,
    // and the run never knew you had finished — every note after the switch
    // went to a run that had silently stopped.
    store().start()
    for (const note of notes().slice(0, 4)) store().noteOn(note)

    store().updateSpec({ direction: 'down' })
    for (const step of store().exercise!.steps) store().noteOn(step.notes[0]!)

    expect(store().session.status).toBe('complete')
    expect(store().session.completedSteps).toBe(store().exercise!.steps.length)
  })

  it('leaves a run that was not going alone', () => {
    store().updateSpec({ direction: 'down' })
    expect(store().session.status).toBe('idle')

    store().start()
    for (const step of store().exercise!.steps) store().noteOn(step.notes[0]!)
    expect(store().session.status).toBe('complete')
    // A finished run is looked at, not restarted: changing the scale after it
    // waits for Start like any other.
    store().updateSpec({ direction: 'up' })
    expect(store().session.status).toBe('idle')
  })

  it('ends the run when the guidance level changes', () => {
    // Half a scale learned with the answers on screen is not half a scale
    // practised, and one score covering both would say it was.
    store().start()
    store().noteOn(notes()[0]!)
    store().setMode('practice')
    expect(store().session.status).toBe('idle')
  })

  it('builds something to play in every area that has exercises', () => {
    for (const topic of ['scales', 'chords', 'arpeggios', 'progressions', 'exercises'] as const) {
      store().setTopic(topic)
      expect(store().exercise, topic).not.toBeNull()
      expect(Object.keys(store().annotations).length, topic).toBeGreaterThan(0)
    }
  })
})

describe('auto tempo', () => {
  // The engine reads the clock, so the clock has to be real enough to read.
  // Playing every note in the same millisecond produces no measurable tempo at
  // all — which is itself correct, and is why this needs fake timers rather
  // than a looser assertion.
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  /** Plays the whole exercise correctly, one note every `gap` ms. */
  const playCleanly = (gap: number) => {
    store().start()
    for (const note of notes()) {
      vi.advanceTimersByTime(gap)
      store().noteOn(note)
    }
  }

  it('leaves the target alone when it is off', () => {
    useLearningStore.setState({ autoTempo: false, targetBpm: 72 })
    playCleanly(500)
    expect(store().targetBpm).toBe(72)
  })

  it('raises the target after a clean run at or above it', () => {
    // 500ms a note is 120 BPM, comfortably past a target of 72.
    useLearningStore.setState({ autoTempo: true, targetBpm: 72 })
    playCleanly(500)
    expect(store().targetBpm).toBe(76)
  })

  it('leaves it alone after a clean run that was slower than the target', () => {
    // Clean, but at 60 BPM against a target of 120. Nothing has been earned.
    useLearningStore.setState({ autoTempo: true, targetBpm: 120 })
    playCleanly(1000)
    expect(store().targetBpm).toBe(120)
  })

  it('eases off after a scrappy run', () => {
    useLearningStore.setState({ autoTempo: true, targetBpm: 72 })
    store().start()
    for (const note of notes()) {
      vi.advanceTimersByTime(500)
      store().noteOn(note + 1) // a wrong note before every right one
      store().noteOn(note)
    }
    expect(store().targetBpm).toBe(68)
  })

  it('moves only at the end of a run, never mid-scale', () => {
    useLearningStore.setState({ autoTempo: true, targetBpm: 72 })
    store().start()
    for (const note of notes().slice(0, -1)) {
      vi.advanceTimersByTime(500)
      store().noteOn(note)
    }
    expect(store().targetBpm).toBe(72)
  })
})

/**
 * Both hands is the first exercise whose steps are more than one note. The
 * engine has always allowed that; this is the keyboard being told about it.
 */
describe('both hands together', () => {
  const step = (index: number) => store().exercise!.steps[index]!

  beforeEach(() => store().updateSpec({ hand: 'both', octaves: 1 }))

  it('lights a target for each hand, with that hand’s finger', () => {
    const [left, right] = step(0).notes
    expect(roleOf(left!)).toBe('target')
    expect(roleOf(right!)).toBe('target')
    // A minor: the left hand starts on its little finger, the right on its thumb.
    expect(store().annotations[left!]?.finger).toBe(5)
    expect(store().annotations[right!]?.finger).toBe(1)
  })

  it('waits for both hands before moving on, in either order', () => {
    const [left, right] = step(0).notes
    store().start()

    store().noteOn(right!)
    expect(store().session.stepIndex).toBe(0)
    expect(store().session.mistakes).toBe(0)

    store().noteOn(left!)
    expect(store().session.stepIndex).toBe(1)
    expect(step(1).notes.map(roleOf)).toEqual(['target', 'target'])
  })

  it('counts the other hand running ahead as a mistake, not as progress', () => {
    store().start()
    store().noteOn(step(0).notes[1]!)
    // The right hand goes on to its next note while the left has not played.
    store().noteOn(step(1).notes[1]!)
    expect(store().session.stepIndex).toBe(0)
    expect(store().session.mistakes).toBe(1)
  })

  it('draws a crossing cue on the key of the hand that crosses, and only there', () => {
    // A minor, one octave: the right thumb passes under on D, the fourth step.
    store().start()
    for (const index of [0, 1, 2]) for (const note of step(index).notes) store().noteOn(note)

    const [left, right] = step(3).notes
    expect(step(3).label).toBe('D')
    expect(store().annotations[right!]?.cue).toBe('Thumb under')
    expect(store().annotations[left!]?.cue).toBeUndefined()
  })
})

/**
 * The fingering system is a setting beside the music, not part of it: it puts
 * numbers on the notes the spec already chose.
 */
describe('the fingering system', () => {
  const rightHand = () => store().exercise!.steps.map((step) => step.fingers[0]!.finger)

  it('is Traditional / Orthodox unless told otherwise', () => {
    expect(store().fingeringSystem).toBe('traditional')
  })

  it('fingers a scale the way the Brown Scale Book prints it', () => {
    // A♭ major, right hand: opened on 2 3, and 3 4 on those notes an octave up.
    store().updateSpec({ rootPitchClass: 8, scaleTypeId: 'major', octaves: 2 })
    expect(rightHand().join('')).toBe('231231234123123')
    expect(store().exercise!.fingerings[0]!.source).toBe('standard')
    // And it reaches the keys: the first target carries the book's finger.
    const first = store().exercise!.steps[0]!.notes[0]!
    expect(store().annotations[first]?.finger).toBe(2)
  })

  it('re-fingers the same notes without ending the run', () => {
    store().start()
    store().noteOn(notes()[0]!)
    const before = { notes: notes(), session: store().session }

    store().setFingeringSystem('traditional')

    expect(notes()).toEqual(before.notes)
    expect(store().session).toBe(before.session)
    expect(window.localStorage.getItem('sonara.fingering.system')).toBe('traditional')
  })
})

/**
 * D♯ minor and E♭ minor are the same piano keys and two different keys. The
 * book prints the first; the player may be reading the second.
 */
describe('a key and its enharmonic twin', () => {
  beforeEach(() => store().updateSpec({ rootPitchClass: 3, scaleTypeId: 'harmonic-minor' }))

  it('is D♯ minor first, as the book has it', () => {
    expect(store().exercise!.title).toBe('D♯ Harmonic Minor')
    expect(store().exercise!.keyFifths).toBe(6)
  })

  it('can be written as E♭ minor: other names, other signature, same keys and fingers', () => {
    const sharp = store().exercise!
    store().updateSpec({ tonic: 'E♭' })
    const flat = store().exercise!

    expect(flat.title).toBe('E♭ Harmonic Minor')
    expect(flat.keyFifths).toBe(-6)
    expect(flat.id).not.toBe(sharp.id)
    expect(
      flat.steps
        .map((step) => step.label)
        .slice(0, 8)
        .join(' '),
    ).toBe('E♭ F G♭ A♭ B♭ C♭ D E♭')
    expect(flat.notes).toEqual(sharp.notes)
    expect(flat.steps.map((step) => step.fingers[0]!.finger)).toEqual(
      sharp.steps.map((step) => step.fingers[0]!.finger),
    )
  })

  it('leaves the other name behind when the key changes', () => {
    store().updateSpec({ tonic: 'E♭' })
    // C has one name. A leftover E♭ must not follow the player there.
    store().updateSpec({ rootPitchClass: 0 })
    expect(store().exercise!.title).toBe('C Harmonic Minor')
    // Nor wait there for them: back on this key it is D♯ minor again.
    store().updateSpec({ rootPitchClass: 3 })
    expect(store().exercise!.title).toBe('D♯ Harmonic Minor')
  })
})

/**
 * Two hands on two different notes: contrary motion, and the hands a third or
 * a sixth apart. Each key is labelled with its own note, not with the pair.
 */
describe('the hands on different notes', () => {
  const step = (index: number) => store().exercise!.steps[index]!

  it('labels each key with the note that hand plays', () => {
    store().updateSpec({ rootPitchClass: 0, scaleTypeId: 'major', hand: 'both', motion: 'third' })
    const [left, right] = step(0).notes
    expect(step(0).label).toBe('C + E')
    expect(store().annotations[left!]?.label).toBe('C')
    expect(store().annotations[right!]?.label).toBe('E')
  })

  it('runs contrary motion a pair of notes at a time', () => {
    store().updateSpec({
      rootPitchClass: 0,
      scaleTypeId: 'major',
      hand: 'both',
      motion: 'contrary',
      octaves: 1,
    })
    store().start()
    // Both hands share the first note, so one key press is the whole step.
    expect(step(0).notes).toEqual([60, 60])
    store().noteOn(60)
    expect(store().session.stepIndex).toBe(1)
    // Then they part: B below and D above.
    expect(step(1).notes).toEqual([59, 62])
    store().noteOn(62)
    expect(store().session.stepIndex).toBe(1)
    store().noteOn(59)
    expect(store().session.stepIndex).toBe(2)
    expect(store().session.mistakes).toBe(0)
  })
})

describe('the keys the player has', () => {
  afterEach(() => store().setPlayableRange(null))

  it('puts an exercise where the book prints it once the keyboard reaches', () => {
    // G major in contrary motion: the page starts on the G below middle C and
    // the left hand goes two octaves down from there, off the end of a 61.
    store().updateSpec({
      rootPitchClass: 7,
      scaleTypeId: 'major',
      hand: 'both',
      motion: 'contrary',
      octaves: 2,
    })
    expect(store().exercise!.steps[0]!.notes).toEqual([67, 67])

    store().setPlayableRange({ low: 21, high: 108 })
    expect(store().exercise!.steps[0]!.notes).toEqual([55, 55])

    // Unplugged, it comes back onto the keys there are.
    store().setPlayableRange(null)
    expect(store().exercise!.steps[0]!.notes).toEqual([67, 67])
  })

  it('leaves a run alone when the exercise has not moved', () => {
    store().updateSpec({ ...DEFAULT_SCALE_SPEC })
    store().start()
    store().noteOn(notes()[0]!)
    const session = store().session
    store().setPlayableRange({ low: 21, high: 108 })
    expect(store().session).toBe(session)
  })
})

/**
 * Chords and arpeggios are areas of their own, with their own settings, built
 * by the same store and drawn on the same keys.
 */
describe('the chords and arpeggios areas', () => {
  afterEach(() => {
    store().updateChordSpec({ ...DEFAULT_CHORD_SPEC, tonic: undefined })
    store().updateArpeggioSpec({ ...DEFAULT_ARPEGGIO_SPEC, tonic: undefined })
  })

  it('builds the area that is open from that area’s own settings', () => {
    store().setTopic('chords')
    expect(store().exercise!.kind).toBe('chord')
    expect(store().exercise!.title).toBe('C Major Triads')

    store().setTopic('arpeggios')
    expect(store().exercise!.kind).toBe('arpeggio')

    // And the scale is as it was left.
    store().setTopic('scales')
    expect(store().exercise!.title).toBe('A Natural Minor')
  })

  it('lights a whole chord as one target, each key with its own note and finger', () => {
    store().setTopic('chords')
    const [c, e, g] = store().exercise!.steps[0]!.notes
    for (const note of [c, e, g]) expect(roleOf(note!)).toBe('target')
    expect(store().annotations[c!]).toMatchObject({ label: 'C', finger: 1 })
    expect(store().annotations[e!]).toMatchObject({ label: 'E', finger: 3 })
    expect(store().annotations[g!]).toMatchObject({ label: 'G', finger: 5 })
  })

  it('moves on only when every note of the chord has been played', () => {
    store().setTopic('chords')
    store().start()
    const [c, e, g] = store().exercise!.steps[0]!.notes
    store().noteOn(c!)
    store().noteOn(g!)
    expect(store().session.stepIndex).toBe(0)
    store().noteOn(e!)
    expect(store().session.stepIndex).toBe(1)
    expect(store().session.mistakes).toBe(0)
  })

  it('runs an arpeggio a note at a time, with the book’s fingers on the keys', () => {
    store().setTopic('arpeggios')
    store().updateArpeggioSpec({ rootPitchClass: 3, direction: 'up' })
    // E♭ major: the thumb waits for G.
    const steps = store().exercise!.steps
    expect(steps.map((step) => step.fingers[0]!.finger).join('')).toBe('2124124')
    expect(store().annotations[steps[0]!.notes[0]!]?.finger).toBe(2)
  })

  it('forgets a key’s other name when the key changes, in these areas too', () => {
    store().setTopic('arpeggios')
    store().updateArpeggioSpec({ rootPitchClass: 3, mode: 'minor', tonic: 'E♭' })
    expect(store().exercise!.title).toBe('E♭ Minor Arpeggio')
    store().updateArpeggioSpec({ rootPitchClass: 9 })
    expect(store().arpeggioSpec.tonic).toBeUndefined()
  })
})

/**
 * A hand playing two notes at once, and a scale that ends on chords: the same
 * engine and the same keys, asked for more than one note a step.
 */
describe('thirds, octaves and the cadence', () => {
  const step = (index: number) => store().exercise!.steps[index]!

  it('lights both notes of a third, each with its own name and finger', () => {
    store().updateSpec({
      rootPitchClass: 0,
      scaleTypeId: 'major',
      hand: 'right',
      texture: 'double-thirds',
    })
    const [c, e] = step(0).notes
    expect(store().annotations[c!]).toMatchObject({ role: 'target', label: 'C', finger: 1 })
    expect(store().annotations[e!]).toMatchObject({ role: 'target', label: 'E', finger: 3 })

    // Both have to be played before the hand moves on.
    store().start()
    store().noteOn(e!)
    expect(store().session.stepIndex).toBe(0)
    store().noteOn(c!)
    expect(store().session.stepIndex).toBe(1)
  })

  it('falls back to single notes when the scale changes to one with no double thirds', () => {
    store().updateSpec({ rootPitchClass: 0, scaleTypeId: 'major', texture: 'double-thirds' })
    expect(step(0).notes).toHaveLength(2)
    store().updateSpec({ scaleTypeId: 'blues' })
    expect(step(0).notes).toHaveLength(1)
    // And comes back when the scale does: the choice was not thrown away.
    store().updateSpec({ scaleTypeId: 'major' })
    expect(step(0).notes).toHaveLength(2)
  })

  it('runs the cadence as four chords after the last note of the scale', () => {
    store().updateSpec({
      rootPitchClass: 0,
      scaleTypeId: 'major',
      hand: 'right',
      octaves: 1,
      direction: 'up-down',
      cadence: true,
    })
    const steps = store().exercise!.steps
    expect(steps).toHaveLength(19)
    store().start()
    for (const each of steps) for (const note of new Set(each.notes)) store().noteOn(note)
    expect(store().session.status).toBe('complete')
    expect(store().session.mistakes).toBe(0)
  })
})

describe('the Progressions area', () => {
  beforeEach(() => store().setTopic('progressions'))

  it('opens on the cadence of C major in its three positions', () => {
    expect(store().exercise?.kind).toBe('progression')
    expect(store().exercise?.title).toBe('C Major Cadence')
    expect(store().exercise?.steps).toHaveLength(15)
  })

  it('keeps its own settings, apart from the other areas', () => {
    store().updateProgressionSpec({ rootPitchClass: 9, mode: 'minor', position: 0 })
    expect(store().exercise?.title).toBe('A Minor Cadence')
    expect(store().exercise?.steps).toHaveLength(5)

    store().setTopic('chords')
    expect(store().chordSpec.rootPitchClass).toBe(0)
    store().setTopic('progressions')
    expect(store().exercise?.title).toBe('A Minor Cadence')
  })

  it('lights each chord as the target, every key with its own note name', () => {
    store().setMode('learn')
    const first = store().exercise!.steps[0]!
    for (const [index, note] of first.notes.entries()) {
      expect(store().annotations[note]?.role).toBe('target')
      expect(store().annotations[note]?.label).toBe(first.noteLabels![index])
    }
  })
})

describe('the Exercises area', () => {
  beforeEach(() => {
    store().setTopic('exercises')
    store().updateRoutineSpec({
      routine: 'blocked',
      hand: 'right',
      rootPitchClass: 0,
      mode: 'major',
    })
  })

  it('opens on the blocked scale of C major', () => {
    expect(store().exercise?.kind).toBe('exercise')
    expect(store().exercise?.title).toBe('C Major Blocked Scale')
  })

  it('asks for every note of a block before it moves on', () => {
    store().setMode('learn')
    store().start()
    const [tonic, block] = store().exercise!.steps
    store().noteOn(tonic!.notes[0]!)
    expect(store().session.stepIndex).toBe(1)
    store().noteOn(block!.notes[0]!)
    expect(store().session.stepIndex).toBe(1)
    store().noteOn(block!.notes[1]!)
    expect(store().session.stepIndex).toBe(2)
    expect(store().session.mistakes).toBe(0)
  })

  it('measures the tempo in beats, however many notes go to one', () => {
    vi.useFakeTimers()
    store().updateRoutineSpec({ routine: 'grand-form' })
    store().setMode('practice')
    store().start()
    // The grand form at 60: an eighth is half a second, a sixteenth a quarter.
    const steps = store().exercise!.steps
    for (const step of steps.slice(0, 14)) {
      for (const note of step.notes) store().noteOn(note)
      vi.advanceTimersByTime((step.beats ?? 1) * 1000)
    }
    expect(tempo(store().session, store().exercise)).toBe(60)
    vi.useRealTimers()
  })
})
