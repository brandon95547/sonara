import * as React from 'react'

/**
 * An icon in the bar with its value on the corner: "R" on the hand, "2" on the
 * octaves, the key on the scale.
 *
 * The bar's settings are icons so that the row fits, and an icon on its own
 * says what a setting is but not what it is set to. The tooltip says both, but
 * a tooltip does not exist on a touch screen — so whatever is short enough to
 * print is printed here, and the icon stays readable at a glance.
 */
export function BarGlyph({ icon, badge }: { icon: React.ReactNode; badge?: string }) {
  return (
    <span className="bar-glyph" aria-hidden>
      {icon}
      {badge && <span className="bar-glyph__badge">{badge}</span>}
    </span>
  )
}
