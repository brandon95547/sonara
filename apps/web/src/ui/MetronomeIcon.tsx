/**
 * A metronome, drawn in the icon set's own hand — 24 units, a 2-unit stroke,
 * round caps — because the set has none, and a stopwatch standing in for it
 * reads as "timer", which is a different thing.
 */
export function MetronomeIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* The body: a tapering case on a flat foot. */}
      <path d="M9.5 3h5l4 18h-13z" />
      <path d="M7.5 16h9" />
      {/* The pendulum, swung off true. */}
      <path d="M12 16 16.5 6.5" />
    </svg>
  )
}
