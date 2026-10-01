import { circleOfFifths, type KeyMode } from '@sonara/shared'
import { CircleOfFifths } from './CircleOfFifths'
import { Prose, Section } from './parts'

const KEYS = circleOfFifths()

/**
 * "Where this key sits": the circle, with the chosen key on it, and the one
 * sentence that makes the picture worth having.
 */
export function KeyCircle({
  selected,
  onSelect,
}: {
  selected: { pitchClass: number; mode: KeyMode } | null
  onSelect: (pitchClass: number, mode: KeyMode) => void
}) {
  const here = selected
    ? KEYS.find((key) => key[selected.mode].pitchClass === selected.pitchClass)
    : undefined
  const name = (position: number) => {
    const key = KEYS[(position + 12) % 12]!
    return selected?.mode === 'minor' ? `${key.minor.name} minor` : `${key.major.name} major`
  }

  return (
    <Section title="Where this key sits">
      <CircleOfFifths selected={selected} onSelect={onSelect} />
      <Prose>
        The circle of fifths: each key is a fifth above the one before it, and has one more sharp —
        or one flat fewer. Inside each major key is the minor key that shares its signature.
      </Prose>
      {here && (
        <Prose>
          {name(here.position)} is written with {here.signature.toLowerCase()}
          {here.accidentals.length > 0 ? ` (${here.accidentals.join(' ')})` : ''}. Its neighbours,{' '}
          {name(here.position - 1)} and {name(here.position + 1)},{' '}
          {selected?.mode === 'minor'
            ? 'are a fifth below it and a fifth above — its nearest relations'
            : 'are the keys of its IV and V chords'}
          , and the two it is easiest to learn next.
        </Prose>
      )}
      <Prose quiet>Press a key to play in it.</Prose>
    </Section>
  )
}
