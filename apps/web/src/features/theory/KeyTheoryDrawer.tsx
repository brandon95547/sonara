import * as React from 'react'
import {
  CADENCE_VOICINGS,
  KEY_MODE_LABELS,
  keyChord,
  keyTriads,
  ROUTINE_LABELS,
  routineHasMode,
  type CadenceChord,
  type Exercise,
  type KeyMode,
  type KeyTriads,
  type Routine,
} from '@sonara/shared'
import { Drawer } from '@/ui/Drawer'
import { Divider } from '@/ui/Display'
import { useLearningStore, type LearningTopic } from '@/state/learning-store'
import { KeyCircle } from './KeyCircle'
import { Facts, Panel, Prose, Row, Section } from './parts'

/**
 * "Understand this…" for everything that is not a scale: the key's chords, its
 * arpeggios, its cadence, the practice routines.
 *
 * The same bargain the scale's panel makes. It explains the thing that is on
 * the keys right now, in the key it is in, with that key's own notes — never a
 * chapter about chords in general with C major as the example. And it stops
 * when the questions a player actually has are answered.
 *
 * The explanations follow Part 1 of the Alfred book (Palmer, Manus, Lethco),
 * which is where this ground is covered in the order a learner meets it.
 */

type KeyTopic = Exclude<LearningTopic, 'songs' | 'scales'>

export const THEORY_TITLES: Record<Exercise['kind'], string> = {
  scale: 'Understand this scale',
  chord: 'Understand these chords',
  arpeggio: 'Understand this arpeggio',
  progression: 'Understand this cadence',
  exercise: 'Understand this routine',
}

const mod7 = (degree: number) => ((degree % 7) + 7) % 7

/** The area's key and the action that changes it, whichever area it is. */
function useAreaKey(topic: KeyTopic) {
  const spec = useLearningStore(
    (state) =>
      ({
        chords: state.chordSpec,
        arpeggios: state.arpeggioSpec,
        progressions: state.progressionSpec,
        exercises: state.routineSpec,
      })[topic],
  )
  const update = useLearningStore(
    (state) =>
      ({
        chords: state.updateChordSpec,
        arpeggios: state.updateArpeggioSpec,
        progressions: state.updateProgressionSpec,
        exercises: state.updateRoutineSpec,
      })[topic],
  ) as (patch: { rootPitchClass: number; mode: KeyMode; tonic: undefined }) => void
  return { spec, update }
}

export function KeyTheoryDrawer({
  open,
  onClose,
  topic,
}: {
  open: boolean
  onClose: () => void
  topic: KeyTopic
}) {
  const exercise = useLearningStore((state) => state.exercise)
  const routine = useLearningStore((state) => state.routineSpec.routine)
  const { spec, update } = useAreaKey(topic)
  const key = React.useMemo(
    () => keyTriads(spec.rootPitchClass, spec.mode, spec.tonic),
    [spec.rootPitchClass, spec.mode, spec.tonic],
  )
  if (!exercise) return null

  // A triad chain is built on a note, not in a key: there is no key to mark.
  const inKey = topic !== 'exercises' || routineHasMode(routine)

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={THEORY_TITLES[exercise.kind]}
      description={exercise.title}
    >
      <div className="flex flex-col gap-6">
        {topic === 'chords' && <ChordTheory triads={key} />}
        {topic === 'arpeggios' && <ArpeggioTheory triads={key} />}
        {topic === 'progressions' && <CadenceTheory triads={key} />}
        {topic === 'exercises' && (
          <RoutineTheory triads={key} routine={routine} exercise={exercise} />
        )}

        <Divider />
        <KeyCircle
          selected={inKey ? { pitchClass: spec.rootPitchClass, mode: spec.mode } : null}
          onSelect={(rootPitchClass, mode) => update({ rootPitchClass, mode, tonic: undefined })}
        />
      </div>
    </Drawer>
  )
}

/* ===========================================================================
   THE PIECES
   ======================================================================== */

const names = (tones: readonly { name: string }[]) => tones.map((tone) => tone.name).join(' ')
const keyNameOf = ({ key, mode }: KeyTriads) => `${key.notes[0]!.name} ${KEY_MODE_LABELS[mode]}`

/** How the key's own triad is made, in half steps. */
function TriadBuild({ triads }: { triads: KeyTriads }) {
  const tonic = triads.triads[0]!
  const major = tonic.quality === 'major'
  const [root, third, fifth] = tonic.tones
  return (
    <Section title="How the triad is built">
      <Panel>
        <Row cells={[names(tonic.tones)]} tone="fg" />
        <Row cells={['root', major ? 'major 3rd' : 'minor 3rd', 'perfect 5th']} tone="muted" />
      </Panel>
      <Prose>
        A <strong>triad</strong> is three notes: a root, the 3rd above it and the 5th above it.{' '}
        {root!.name} to {third!.name} is a {major ? 'major' : 'minor'} 3rd —{' '}
        {major ? 'four' : 'three'} half steps — and {root!.name} to {fifth!.name} is a perfect 5th,
        seven. That makes {tonic.symbol} a {tonic.quality} triad.
      </Prose>
      <Prose quiet>
        {major
          ? `Lower the 3rd a half step and it is ${root!.name} minor: the 3rd is the only note that differs.`
          : `Raise the 3rd a half step and it is ${root!.name} major: the 3rd is the only note that differs.`}
      </Prose>
    </Section>
  )
}

/** The triad turned over: which note is at the bottom, and how to find the root. */
function Positions({ triads }: { triads: KeyTriads }) {
  const [root, third, fifth] = triads.triads[0]!.tones.map((tone) => tone.name)
  return (
    <Section title="Its positions">
      <Facts
        wide
        rows={[
          { term: 'Root position', value: `${root} ${third} ${fifth}`, note: 'root at the bottom' },
          { term: '1st inversion', value: `${third} ${fifth} ${root}`, note: 'root on top' },
          { term: '2nd inversion', value: `${fifth} ${root} ${third}`, note: 'root in the middle' },
        ]}
      />
      <Prose>
        Moving the bottom note to the top <strong>inverts</strong> the chord: the same three
        letters, standing on a different one. Out of root position two of the notes are a 4th apart
        instead of a 3rd, and the root is always the upper of those two — here, the {root} above{' '}
        {fifth}.
      </Prose>
    </Section>
  )
}

/** The triad on every degree: the key's whole harmony in one table. */
function KeyChords({ triads }: { triads: KeyTriads }) {
  const minor = triads.mode === 'minor'
  return (
    <Section title="The chords of the key">
      <Facts
        wide
        rows={triads.triads.map((triad) => ({
          term: triad.degreeName,
          value: `${triad.symbol} · ${triad.numeral}`,
          note: triad.primary ? 'primary' : undefined,
        }))}
      />
      <Prose>
        A triad can be built on every note of the scale, using only the scale's own notes. Which
        come out major and which minor is fixed by the scale — the numeral is a capital for a major
        3rd and small for a minor one, with ° for diminished and + for augmented.
      </Prose>
      {minor && (
        <Prose quiet>
          A minor key takes its chords from the harmonic minor, with the 7th raised. That is what
          makes {triads.triads[4]!.symbol} major, {triads.triads[2]!.symbol} augmented and{' '}
          {triads.triads[6]!.symbol} diminished.
        </Prose>
      )}
    </Section>
  )
}

/** The key's seventh chord: dominant in a major key, diminished in a minor one. */
function SeventhChord({ triads }: { triads: KeyTriads }) {
  const tonic = triads.key.notes[0]!
  const seventh = keyChord(tonic.pitchClass, triads.mode, 'seventh', tonic.name)
  const dominant = triads.triads[4]!
  if (triads.mode === 'major') {
    return (
      <Section title="The dominant seventh">
        <Panel>
          <Row cells={[seventh.symbol, names(seventh.tones)]} tone="fg" />
        </Panel>
        <Prose>
          The triad on the 5th degree, {dominant.symbol}, with one more note: the 7th above its
          root, {seventh.tones[3]!.name}. It pulls back to {triads.triads[0]!.symbol} harder than
          the plain triad does, which is why pieces so often use it in the triad's place.
        </Prose>
      </Section>
    )
  }
  return (
    <Section title="The diminished seventh">
      <Panel>
        <Row cells={[seventh.symbol, names(seventh.tones)]} tone="fg" />
      </Panel>
      <Prose>
        Built on the raised 7th of the key, {seventh.tones[0]!.name}, and made entirely of minor
        3rds — three half steps between each note and the next. It is a dominant seventh with every
        note but the root lowered a half step.
      </Prose>
      <Prose quiet>
        Because the 3rds are all the same size, every inversion feels alike under the hand; only the
        black and white keys change.
      </Prose>
    </Section>
  )
}

function ChordTheory({ triads }: { triads: KeyTriads }) {
  return (
    <>
      <TriadBuild triads={triads} />
      <Divider />
      <Positions triads={triads} />
      <Divider />
      <KeyChords triads={triads} />
      <Divider />
      <SeventhChord triads={triads} />
    </>
  )
}

function ArpeggioTheory({ triads }: { triads: KeyTriads }) {
  const tonic = triads.triads[0]!
  const [root, third, fifth] = tonic.tones.map((tone) => tone.name)
  const major = tonic.quality === 'major'
  return (
    <>
      <Section title="What an arpeggio is">
        <Panel>
          <Row cells={[tonic.symbol, names(tonic.tones)]} tone="fg" />
        </Panel>
        <Prose>
          The notes of a chord played one after another instead of together — from the Italian{' '}
          <em>arpeggiare</em>, to play upon a harp. Run up two octaves it is the scale with the
          steps taken out, which is why the thumb has so much further to travel.
        </Prose>
        <Prose quiet>
          Four kinds are studied: major and minor triads, in three positions, and dominant and
          diminished sevenths, in four.
        </Prose>
      </Section>
      <Divider />
      <Positions triads={triads} />
      <Divider />
      <Section title="Third finger or fourth">
        <Prose>
          The one decision in a triad arpeggio. Look at the two notes at the outer end of the hand —
          the two highest in the right hand, the two lowest in the left. A 4th apart, use the 3rd
          finger; a 3rd apart, use the 4th.
        </Prose>
        <Facts
          wide
          rows={[
            {
              term: 'Right hand',
              value: `${fifth} to ${root}`,
              note: 'a 4th — 3rd finger: 1 2 3 5',
            },
            {
              term: 'Left hand',
              value: `${root} to ${third}`,
              note: `a ${major ? 'major' : 'minor'} 3rd — 4th finger: 5 4 2 1`,
            },
          ]}
        />
        <Prose quiet>
          That is the rule for root position on white keys. The fingering on the keys is the one
          your fingering system prints for this key, which is not always the rule's.
        </Prose>
      </Section>
      <Divider />
      <SeventhChord triads={triads} />
    </>
  )
}

/** The notes of one cadence chord in the first position, lowest first. */
const voiced = (triads: KeyTriads, chord: CadenceChord) =>
  CADENCE_VOICINGS[0]![chord].map((degree) => triads.key.notes[mod7(degree)]!.name).join(' ')

function CadenceTheory({ triads }: { triads: KeyTriads }) {
  const [one, four, five] = [triads.triads[0]!, triads.triads[3]!, triads.triads[4]!]
  const tonic = triads.key.notes[0]!.name
  const fifth = triads.key.notes[4]!.name
  const numerals = triads.mode === 'minor' ? 'i, iv and V' : 'I, IV and V'
  return (
    <>
      <Section title="The primary chords">
        <Facts
          rows={[one, four, five].map((triad) => ({
            term: triad.numeral,
            value: `${triad.symbol} — ${names(triad.tones)}`,
            note: triad.degreeName.toLowerCase(),
          }))}
        />
        <Prose>
          The three most important chords of {keyNameOf(triads)} are the triads on its 1st, 4th and
          5th notes: {numerals}. Between them they hold every note of the scale, so a tune in this
          key can be harmonized with these three alone.
        </Prose>
        {triads.mode === 'minor' && (
          <Prose quiet>
            In every minor key i and iv are minor and V is major: V takes the raised 7th of the
            harmonic minor.
          </Prose>
        )}
      </Section>
      <Divider />
      <Section title="Why the positions">
        <Facts
          rows={(['I', 'IV', 'V', 'V7'] as const).map((chord) => ({
            term: triads.mode === 'minor' && chord.startsWith('I') ? chord.toLowerCase() : chord,
            value: voiced(triads, chord),
          }))}
        />
        <Prose>
          With all three in root position the hand has to leap from each to the next. Moved to the
          nearest position instead — the top note of {four.numeral} dropped an octave, the top two
          of {five.numeral} — a note stays where it is each time: {tonic} from {one.symbol} to{' '}
          {four.symbol}, {fifth} from {one.symbol} to {five.symbol}.
        </Prose>
        <Prose quiet>
          A change from one chord to another is a chord progression. This one, ending on the tonic,
          is a <strong>cadence</strong>: the way a key says it is home.
        </Prose>
      </Section>
      <Divider />
      <Section title="V or V7">
        <Prose>
          Add the 7th above its root to {five.symbol} and it is {five.symbol}7. To keep it three
          notes and under the hand, the 5th is left out and the 7th takes its place.
        </Prose>
        <Prose quiet>
          Out of root position a seventh chord has two notes a 2nd apart, and the root is the upper
          one.
        </Prose>
      </Section>
    </>
  )
}

/** What each routine is for, and how to practise it. */
const ROUTINE_NOTES: Record<Routine, { trains: string; how: string }> = {
  blocked: {
    trains:
      'Each thumb note is played alone and the fingers that follow it are struck together, so every hand position in the scale is felt as one shape. A scale is a few positions joined by the thumb; this is the scale with the joins taken out.',
    how: 'Drop the whole hand onto each block rather than rolling it, and move to the next thumb note without looking for it.',
  },
  'expanding-1': {
    trains:
      'The scale is added a note at a time: up to the 3rd and back, then the 4th, the 5th, and on to the whole octave. The thumb crossing arrives once everything before it is already easy.',
    how: 'Keep one even pulse through every turn. The top note of each expansion is the one to listen for.',
  },
  'expanding-2': {
    trains:
      'The same idea from the middle of two octaves — a note further up, then a note further down, each time. The turn at the bottom gets as much practice as the turn at the top.',
    how: 'It begins on the finger that starts the second octave, so the hand is in mid-scale from the first note.',
  },
  accelerating: {
    trains:
      'One pulse, four speeds: a note to the beat, then two, three and four. The beat never changes, which makes it a test of evenness rather than of nerve.',
    how: 'Set the metronome and leave it alone. If the sixteenths are uneven, the tempo is too fast for all four lines.',
  },
  'grand-form': {
    trains:
      'The routine conservatories use: the hands together, apart, together again and back, without stopping. It is similar and contrary motion in one breath.',
    how: 'As printed each leg is two octaves, which needs five octaves of keyboard from the tonic. Where there is not that much, a leg is one octave.',
  },
  'harmonized-bass': {
    trains:
      'The scale against its own harmony. Each bar of the tune sits over one of the key’s primary chords, held through the bar by the other hand.',
    how: 'Play the chord and the first note of the bar together, and keep the chord down while the scale moves.',
  },
  'harmonized-treble': {
    trains:
      'The scale against its own harmony, with the hands’ jobs exchanged: the left hand has the tune and the right hand holds the chords above it.',
    how: 'Play the chord and the first note of the bar together, and keep the chord down while the scale moves.',
  },
  'triad-chain': {
    trains:
      'Four kinds of triad on one root, each made from the last by moving a single note a half step. It is the quickest way to learn what major, minor, diminished and augmented feel and sound like.',
    how: 'The left hand breaks each triad and the right hand answers; then all seven are struck as chords.',
  },
}

function RoutineTheory({
  triads,
  routine,
  exercise,
}: {
  triads: KeyTriads
  routine: Routine
  exercise: Exercise
}) {
  const notes = ROUTINE_NOTES[routine]
  const harmonized = routine === 'harmonized-bass' || routine === 'harmonized-treble'

  return (
    <>
      <Section title={ROUTINE_LABELS[routine]}>
        <Prose>{notes.trains}</Prose>
        <Prose>{notes.how}</Prose>
        <Prose quiet>
          Printed once, in C, in the book it comes from — to be carried into every key being
          studied.
        </Prose>
      </Section>

      {harmonized && (
        <>
          <Divider />
          <Section title="Why three chords are enough">
            <Facts
              rows={[triads.triads[0]!, triads.triads[3]!, triads.triads[4]!].map((triad) => ({
                term: triad.numeral,
                value: `${triad.symbol} — ${names(triad.tones)}`,
              }))}
            />
            <Prose>
              Every note of the scale is in at least one of them, so each bar has a primary chord
              that fits what the tune is doing: the tonic chord under the 1st, 3rd and 5th notes,
              the subdominant under the 4th, the dominant under the 5th, 7th and 2nd.
            </Prose>
          </Section>
        </>
      )}

      {routine === 'triad-chain' && (
        <>
          <Divider />
          <Section title="One note at a time">
            <Facts
              wide
              rows={(['Major', 'Minor', 'Diminished', 'Augmented'] as const).map((quality) => {
                // The chords struck at the end carry each triad's own note names.
                const chord = exercise.steps.find(
                  (step) => step.cue === quality && step.notes.length > 3,
                )
                return {
                  term: quality,
                  value: `${chord?.label ?? ''} — ${chord?.noteLabels?.slice(0, 3).join(' ') ?? ''}`,
                }
              })}
            />
            <Prose>
              Lower the 3rd of a major triad and it is minor. Lower the 5th as well and it is
              diminished. Go back to major and raise the 5th instead, and it is augmented.
            </Prose>
            <Prose quiet>
              The notes keep their letters whatever is done to them: a lowered 5th is a flat on the
              same letter, never the note below spelled with a sharp.
            </Prose>
          </Section>
        </>
      )}
    </>
  )
}
