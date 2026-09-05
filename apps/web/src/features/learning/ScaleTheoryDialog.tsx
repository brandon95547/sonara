import * as React from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import {
  crossings,
  degreeNames,
  findScaleType,
  fourthFingerDegrees,
  ordinal,
  relativeKey,
  scaleFingering,
  spellScale,
  tetrachordNotes,
} from '@sonara/shared'
import { Drawer } from '@/ui/Drawer'
import { Divider } from '@/ui/Display'
import { useLearningStore } from '@/state/learning-store'

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

  const type = findScaleType(spec.scaleTypeId)
  const scale = type ? spellScale(spec.rootPitchClass, type) : null
  if (!type || !scale) return null

  const noteNames = scale.notes.map((note) => note.name)
  const halves = tetrachordNotes(noteNames, type)
  const names = degreeNames(type)
  const relative = relativeKey(spec.rootPitchClass, type)
  const fingering = scaleFingering({
    rootName: scale.root.name,
    scaleTypeId: type.id,
    hand: spec.hand,
    octaves: 1,
    notes: [],
  })
  const anchors = fourthFingerDegrees(fingering.fingers, spec.hand)
  const moves = crossings(fingering.fingers, spec.hand, noteNames)
  const handLabel = spec.hand === 'right' ? 'Right hand' : 'Left hand'

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

        {fingering.source === 'standard' && anchors.length > 0 && (
          <>
            <Divider />
            <Section title="Fingering principle">
              <p className="text-body text-[var(--ds-fg)]">
                {handLabel} 4th-finger anchor:{' '}
                {anchors.map((degree) => noteNames[degree]).join(' and ')}{' '}
                <span className="text-[var(--ds-fg-muted)]">
                  ({anchors.map((degree) => ordinal(degree + 1)).join(' and ')}{' '}
                  {anchors.length === 1 ? 'degree' : 'degrees'})
                </span>
              </p>
              <p className="text-body-sm text-[var(--ds-fg-secondary)]">
                The fourth finger is the one that only lands{' '}
                {anchors.length === 1 ? 'once' : 'twice'} in the octave. Put it{' '}
                {anchors.length === 1 ? 'there' : 'in those places'} and the rest of the hand has
                nowhere else to go — which is why this is worth remembering instead of the eight
                numbers it produces.
              </p>
              {moves.length > 0 && (
                <p className="text-body-sm text-[var(--ds-fg-secondary)]">
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
              )}
            </Section>
          </>
        )}
      </div>
    </Drawer>
  )
}

/** `W` and `H` read fine on the diagram and not at all in a sentence. */
const stepWord = (step: string) => (step === 'W' ? 'whole' : step === 'H' ? 'half' : step)
const spellSteps = (steps: string) => steps.split(' ').map(stepWord).join(', ')

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="text-label text-[var(--ds-accent-text)]">{title}</h3>
      {children}
    </section>
  )
}

/** One line of the built-from panel: cells separated by the joining step. */
function Row({ cells, tone, join }: { cells: string[]; tone: 'fg' | 'muted'; join?: string }) {
  return (
    <div
      className={`flex flex-wrap items-baseline gap-x-2 text-ui ${
        tone === 'fg' ? 'text-[var(--ds-fg)]' : 'text-[var(--ds-fg-muted)]'
      }`}
      data-tabular
    >
      {cells.map((cell, index) => (
        <React.Fragment key={index}>
          {index > 0 && (
            <span className="text-[var(--ds-fg-muted)]">{join ? `| ${join} |` : '|'}</span>
          )}
          <span>{cell}</span>
        </React.Fragment>
      ))}
    </div>
  )
}

function Disclosure({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-fit items-center gap-1 text-label-sm text-[var(--ds-fg-secondary)] hover:text-[var(--ds-fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-focus-ring)]"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {label}
      </button>
      {open && children}
    </div>
  )
}
