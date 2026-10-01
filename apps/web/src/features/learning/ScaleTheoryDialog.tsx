import * as React from 'react'
import {
  crossings,
  degreeNames,
  findScaleType,
  fourthFingerAnchors,
  octaveNotes,
  ordinal,
  relativeKey,
  scaleFingering,
  spellScale,
  tetrachordNotes,
  type Hand,
  type KeyMode,
} from '@sonara/shared'
import { Drawer } from '@/ui/Drawer'
import { Divider } from '@/ui/Display'
import { useLearningStore } from '@/state/learning-store'
import { KeyCircle } from '@/features/theory/KeyCircle'
import { Disclosure, Row, Section } from '@/features/theory/parts'

/**
 * "Understand this scale."
 *
 * The single place the theory behind the *current* selection lives, and
 * deliberately not a chapter of one. It answers four questions in the order a
 * player runs into them — what the scale is made of, what its notes are called,
 * what else shares them, and why the fingering is the shape it is — and stops.
 *
 * Everything is derived from the selected scale, so nothing here can drift out
 * of step with what the keyboard is doing. Where an answer is easier to see
 * than to read, it hands the question to the keys and gets out of the way.
 */
export function ScaleTheoryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const spec = useLearningStore((state) => state.spec)
  const updateSpec = useLearningStore((state) => state.updateSpec)

  const type = findScaleType(spec.scaleTypeId)
  const system = useLearningStore((state) => state.fingeringSystem)
  const scale = type ? spellScale(spec.rootPitchClass, type, spec.tonic) : null
  if (!type || !scale) return null

  const noteNames = scale.notes.map((note) => note.name)
  const halves = tetrachordNotes(noteNames, type)
  const names = degreeNames(type)
  const relative = relativeKey(spec.rootPitchClass, type, spec.tonic)
  // One principle per hand that plays: the two hands anchor on different
  // degrees and cross in different places, so both hands is two answers.
  const hands: readonly Hand[] = spec.hand === 'both' ? ['left', 'right'] : [spec.hand]
  const principles = hands
    .map((hand) => {
      const fingering = scaleFingering({
        rootName: scale.root.name,
        scaleTypeId: type.id,
        hand,
        octaves: 1,
        // The notes matter for every scale with no published fingering — which
        // is most of them, the modes and pentatonics included. Passing none
        // left this dialog showing an empty hand for all of them.
        notes: octaveNotes(spec.rootPitchClass, type),
        system,
      })
      return {
        hand,
        label: hand === 'right' ? 'Right hand' : 'Left hand',
        source: fingering.source,
        anchors: fourthFingerAnchors(fingering, hand),
        moves: crossings(fingering.fingers, hand, noteNames),
      }
    })
    .filter((principle) => principle.source === 'standard' && principle.anchors.length > 0)
  const once = principles.every((principle) => principle.anchors.length === 1)
  // A major or minor scale is in a key and has a place on the circle. A mode or
  // a pentatonic is not, and is shown the circle with nothing marked on it.
  const mode: KeyMode | null =
    type.family === 'major' ? 'major' : type.family === 'minor' ? 'minor' : null
  const chooseKey = (rootPitchClass: number, next: KeyMode) =>
    updateSpec({
      rootPitchClass,
      tonic: undefined,
      // The minor form already chosen is kept; from anything else it is the
      // natural minor, which is the one the signature describes.
      scaleTypeId: next === 'major' ? 'major' : mode === 'minor' ? type.id : 'natural-minor',
    })

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Understand this scale"
      description={`${scale.root.name} ${type.name}`}
    >
      <div className="flex flex-col gap-6">
        {halves && (
          <Section title="Scale construction">
            <div className="flex flex-col gap-1.5 rounded-[var(--radius-md)] bg-[var(--ds-surface-inset)] px-3 py-2.5">
              <Row cells={[halves.lower.join(' – '), halves.upper.join(' – ')]} tone="fg" />
              <Row
                cells={[halves.steps.split(' ').join(' – '), halves.steps.split(' ').join(' – ')]}
                tone="muted"
                join={halves.join}
              />
            </div>
            <p className="text-body-sm text-[var(--ds-fg-secondary)]">
              Those two four-note groups are called <strong>tetrachords</strong>. They are the same
              shape — {spellSteps(halves.steps)} — joined by a {stepWord(halves.join)} step. So the
              scale is one shape learned twice, not seven steps memorised once.
            </p>
            <p className="text-body-sm text-[var(--ds-fg-muted)]">
              The upper group is also the lower group of the next scale a fifth up, which is how the
              circle of fifths is built.
            </p>
          </Section>
        )}

        {halves && <Divider />}

        <Section title="Scale degrees">
          <div className="flex flex-col gap-1.5 rounded-[var(--radius-md)] bg-[var(--ds-surface-inset)] px-3 py-2.5">
            <Row cells={[noteNames.join(' ')]} tone="fg" />
            <Row cells={[type.degrees.join(' ')]} tone="muted" />
          </div>
          {names.length > 0 && (
            <Disclosure label="What each degree is called">
              <dl className="flex flex-col gap-1">
                {names.map((name, index) => (
                  <div key={name} className="flex gap-3 text-body-sm">
                    <dt className="w-[8.5rem] shrink-0 text-[var(--ds-fg-muted)]">{name}</dt>
                    <dd className="text-[var(--ds-fg-secondary)]" data-tabular>
                      {noteNames[index]} · {type.degrees[index]}
                    </dd>
                  </div>
                ))}
              </dl>
            </Disclosure>
          )}
        </Section>

        {relative && (
          <>
            <Divider />
            <Section title={relative.typeName === 'Major' ? 'Relative major' : 'Relative minor'}>
              <p className="text-body text-[var(--ds-fg)]">
                {relative.name} {relative.typeName}
              </p>
              <p className="text-body-sm text-[var(--ds-fg-secondary)]">
                {scale.root.name} {type.name} and {relative.name} {relative.typeName} contain the
                same seven notes and share a key signature. What differs is where home is: the same
                notes resolve to {scale.root.name} in one and to {relative.name} in the other.
              </p>
            </Section>
          </>
        )}

        {principles.length > 0 && (
          <>
            <Divider />
            <Section title="Fingering principle">
              {principles.map(({ hand, label, anchors }) => (
                <p key={hand} className="text-body text-[var(--ds-fg)]">
                  {label} 4th-finger anchor:{' '}
                  {anchors.map((degree) => noteNames[degree]).join(' and ')}{' '}
                  <span className="text-[var(--ds-fg-muted)]">
                    ({anchors.map((degree) => ordinal(degree + 1)).join(' and ')}{' '}
                    {anchors.length === 1 ? 'degree' : 'degrees'})
                  </span>
                </p>
              ))}
              <p className="text-body-sm text-[var(--ds-fg-secondary)]">
                The fourth finger is the one that only lands {once ? 'once' : 'twice'} in the
                octave. Put it {once ? 'there' : 'in those places'} and the rest of the hand has
                nowhere else to go — which is why this is worth remembering instead of the eight
                numbers it produces.
              </p>
              {principles.map(({ hand, label, moves }) =>
                moves.length === 0 ? null : (
                  <p key={hand} className="text-body-sm text-[var(--ds-fg-secondary)]">
                    {principles.length > 1 && `${label}: `}
                    {moves.map((move, index) => (
                      <React.Fragment key={`${move.from}-${move.to}`}>
                        {index > 0 && ' Then '}
                        {move.kind === 'thumb-under'
                          ? `Going up, pass your thumb under the hand after ${move.from} to reach ${move.to}.`
                          : `Going up, cross your hand over the thumb after ${move.from} to reach ${move.to}.`}
                      </React.Fragment>
                    ))}{' '}
                    Coming back down it happens in reverse, at the same place.
                  </p>
                ),
              )}
            </Section>
          </>
        )}

        <Divider />
        <KeyCircle
          selected={mode ? { pitchClass: spec.rootPitchClass, mode } : null}
          onSelect={chooseKey}
        />
      </div>
    </Drawer>
  )
}

/** `W` and `H` read fine on the diagram and not at all in a sentence. */
const stepWord = (step: string) => (step === 'W' ? 'whole' : step === 'H' ? 'half' : step)
const spellSteps = (steps: string) => steps.split(' ').map(stepWord).join(', ')
