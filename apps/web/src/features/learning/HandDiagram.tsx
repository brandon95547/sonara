import { cn } from '@/lib/cn'
import type { Hand } from '@sonara/shared'

/**
 * A hand with its fingers lit.
 *
 * Deliberately schematic. The job is to answer "which finger is 4?" at a
 * glance while the other hand is on the keys — an anatomically careful drawing
 * would be slower to read, not faster.
 *
 * More than one finger at a time, because a chord is played with more than one
 * finger. Showing only the first — which is what this did — answers the wrong
 * question for every chord in a song: the player needs the shape of the hand,
 * not one number out of three.
 *
 * It shows a RECOMMENDATION. MIDI carries the note and the velocity and
 * nothing about the hand that produced them, so this can never be a readout of
 * what the player actually did, and the card it sits in says so.
 */

interface FingerShape {
  readonly finger: number
  readonly d: string
}

/** Right hand, palm away, thumb on the left. The left hand is the mirror. */
const FINGERS: readonly FingerShape[] = [
  { finger: 1, d: 'M18 74 q-9 -6 -11 -16 q-2 -9 6 -11 q7 -2 11 7 l6 16 z' },
  { finger: 2, d: 'M31 66 v-40 q0-7 7-7 t7 7 v40 z' },
  { finger: 3, d: 'M48 66 v-48 q0-7 7-7 t7 7 v48 z' },
  { finger: 4, d: 'M65 66 v-42 q0-7 7-7 t7 7 v42 z' },
  { finger: 5, d: 'M82 66 v-28 q0-7 6.5-7 t6.5 7 v28 z' },
]

export function HandDiagram({
  hand,
  fingers,
  className,
}: {
  hand: Hand
  /** The recommended fingers, 1-5, low note first. Empty when nothing is due. */
  fingers: readonly number[]
  className?: string
}) {
  const lit = new Set(fingers)
  const side = hand === 'right' ? 'Right' : 'Left'
  return (
    <svg
      viewBox="0 0 104 108"
      className={cn('h-full w-full', className)}
      role="img"
      aria-label={
        fingers.length > 0
          ? `${side} hand, ${fingers.length === 1 ? 'finger' : 'fingers'} ${fingers.join(', ')}`
          : `${side} hand`
      }
      // The left hand is the right hand seen in a mirror. Drawing it twice
      // would be two things to keep in step for no gain.
      style={hand === 'left' ? { transform: 'scaleX(-1)' } : undefined}
    >
      <g fill="none" stroke="var(--ds-border-strong)" strokeWidth="2" strokeLinejoin="round">
        <path d="M22 62 h62 q8 0 8 10 v14 q0 18 -20 18 h-38 q-20 0 -20 -18 v-14 q0 -10 8 -10 z" />
        {FINGERS.map((shape) => (
          <path
            key={shape.finger}
            d={shape.d}
            fill={lit.has(shape.finger) ? 'var(--ds-accent)' : 'transparent'}
            stroke={lit.has(shape.finger) ? 'var(--ds-accent)' : 'var(--ds-border-strong)'}
          />
        ))}
      </g>
      {fingers.length > 0 && (
        <text
          x="52"
          y="92"
          textAnchor="middle"
          // One finger gets the full-size digit it always had. A chord's worth
          // shrinks to fit rather than overflowing the palm.
          fontSize={fingers.length > 2 ? 15 : 20}
          fontWeight="650"
          fill="var(--ds-accent-text)"
          // Un-mirrored so a left-hand diagram does not print a reversed digit,
          // and so a chord's fingers read low to high rather than backwards.
          style={
            hand === 'left' ? { transform: 'scaleX(-1)', transformOrigin: '52px 92px' } : undefined
          }
        >
          {fingers.join(' ')}
        </text>
      )}
    </svg>
  )
}
