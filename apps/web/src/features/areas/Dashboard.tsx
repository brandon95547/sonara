import { ArrowRight, Lock } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useLearningStore } from '@/state/learning-store'
import { useCurrentSong } from '@/state/song-store'
import { pageActions } from '@/state/page-store'
import { AREAS, COMING_NEXT, type Area } from './areas'

/**
 * The first page: every area of the app, each a card that opens it.
 *
 * Drawn to the dashboard mock (reference.png, 2026-09-30) at the Bible's
 * standard card size, centred: the practice room behind everything, and each
 * area a dark card with its own photograph on the right, fading out under the
 * words on the left, in its own accent. The
 * photographs and the accents live in the stylesheet, keyed on `data-area`.
 *
 * The areas that are open say what is waiting in them, so the dashboard is
 * also how you get back to where you were; the ones that are not yet say so,
 * rather than being missing, so the shape of the app is visible from day one.
 */
export function Dashboard() {
  const scale = useLearningStore((state) => state.exercise?.title)
  const song = useCurrentSong()
  const where: Partial<Record<Area['topic'], string>> = {
    scales: scale,
    songs: song?.title,
  }

  return (
    <main className="dashboard" aria-labelledby="dashboard-title">
      <div className="dashboard__inner">
        <header className="dashboard__header">
          <h1 id="dashboard-title" className="dashboard__title">
            Dashboard
          </h1>
          <p className="dashboard__lede">Pick an area to practise.</p>
        </header>

        <ul className="area-grid">
          {AREAS.map((area) => (
            <li key={area.topic} className="flex">
              <AreaCard area={area} current={where[area.topic]} />
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}

function AreaCard({ area, current }: { area: Area; current?: string }) {
  const Icon = area.icon

  const body = (
    <>
      <span className="area-card__icon" aria-hidden>
        <Icon size={22} strokeWidth={2} />
      </span>
      <span className="area-card__name">{area.label}</span>
      <span className="area-card__rule" aria-hidden />
      <span className="area-card__description">{area.description}</span>
      <span className="area-card__foot">
        {area.available ? (
          // Where you left off, in small capitals; or, with nothing to go
          // back to, the invitation — larger, and in white.
          <span className={cn('area-card__status', !current && 'area-card__status--open')}>
            {current ?? 'Open'}
          </span>
        ) : (
          <span className="area-card__status">
            <Lock size={14} aria-hidden />
            Coming soon
          </span>
        )}
        <span className="area-card__go" aria-hidden>
          <ArrowRight size={18} />
        </span>
      </span>
    </>
  )

  if (!area.available) {
    return (
      <div
        className="area-card"
        data-area={area.topic}
        data-locked="true"
        title={COMING_NEXT}
        aria-disabled="true"
      >
        {body}
      </div>
    )
  }

  return (
    <button
      type="button"
      className="area-card"
      data-area={area.topic}
      title={`Open ${area.label}`}
      onClick={() => pageActions.openArea(area.topic)}
    >
      {body}
    </button>
  )
}
