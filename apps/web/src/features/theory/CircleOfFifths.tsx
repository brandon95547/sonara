import { circleOfFifths, type KeyMode } from '@sonara/shared'
import { cn } from '@/lib/cn'

/**
 * The circle of fifths, as something to read and something to press.
 *
 * Twelve major keys round the outside, a fifth apart, and inside each the
 * minor key that shares its signature. Clockwise adds a sharp, anticlockwise a
 * flat; the middle says how many the chosen key has, and which.
 *
 * The keys are buttons because the circle is the best key picker there is for
 * someone learning what the keys are: the next one to learn is always the one
 * beside the last. The two neighbours of the chosen key are marked for that —
 * they are its dominant and its subdominant, the keys of its V and IV chords.
 */

const KEYS = circleOfFifths()

/** Where a key sits: `radius` is a fraction of the circle's own half-width. */
function at(position: number, radius: number) {
  const angle = (position / 12) * 2 * Math.PI
  return {
    left: `${50 + Math.sin(angle) * radius * 50}%`,
    top: `${50 - Math.cos(angle) * radius * 50}%`,
  }
}

export function CircleOfFifths({
  selected,
  onSelect,
}: {
  /** The key to mark, or null where what is being played is not in one. */
  selected: { pitchClass: number; mode: KeyMode } | null
  onSelect: (pitchClass: number, mode: KeyMode) => void
}) {
  const current = selected
    ? (KEYS.find((key) => key[selected.mode].pitchClass === selected.pitchClass) ?? null)
    : null
  const near = (position: number) =>
    current !== null && [1, 11].includes((position - current.position + 12) % 12)

  return (
    <div className="circle-of-fifths" role="group" aria-label="Circle of fifths">
      <span className="circle-of-fifths__ring circle-of-fifths__ring--outer" aria-hidden />
      <span className="circle-of-fifths__ring circle-of-fifths__ring--inner" aria-hidden />

      {KEYS.map((key) =>
        (['major', 'minor'] as const).map((mode) => {
          const on = current === key && selected?.mode === mode
          const name = mode === 'major' ? key.major.name : `${key.minor.name}m`
          const label = `${key[mode].name} ${mode}, ${key.signature.toLowerCase()}`
          return (
            <button
              key={`${key.position}-${mode}`}
              type="button"
              className={cn(
                'choice circle-of-fifths__key',
                mode === 'minor' && 'circle-of-fifths__key--minor',
                on && 'choice--on',
              )}
              style={at(key.position, mode === 'major' ? 0.84 : 0.52)}
              aria-pressed={on}
              aria-label={label}
              title={label}
              data-near={
                near(key.position) && mode === (selected?.mode ?? 'major') ? true : undefined
              }
              onClick={() => onSelect(key[mode].pitchClass, mode)}
            >
              {name}
            </button>
          )
        }),
      )}

      {/* What the chosen key is written with. Said in words as well as counted,
          because "3 sharps" is the fact and "F♯ C♯ G♯" is how to use it. */}
      <div className="circle-of-fifths__centre" aria-live="polite">
        {current ? (
          <>
            <span className="text-label text-[var(--ds-fg)]" data-tabular>
              {current.fifths === 0
                ? '0'
                : `${Math.abs(current.fifths)}${current.fifths > 0 ? '♯' : '♭'}`}
            </span>
            <span className="text-caption text-[var(--ds-fg-muted)]">
              {current.accidentals.length > 0
                ? current.accidentals.join(' ')
                : 'no sharps or flats'}
            </span>
          </>
        ) : (
          <span className="text-caption text-[var(--ds-fg-muted)]">Pick a key</span>
        )}
      </div>
    </div>
  )
}
