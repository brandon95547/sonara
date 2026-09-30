import { ArrowRight, Lock } from 'lucide-react'
import { useLearningStore } from '@/state/learning-store'
import { useCurrentSong } from '@/state/song-store'
import { pageActions } from '@/state/page-store'
import { AREAS, COMING_NEXT, type Area } from './areas'

/**
 * The first page: every area of the app, each a card that opens it.
 *
 * Cards on the stage the way the staff is — paper on the lavender — because
 * they are the same kind of thing: something laid out to be picked up. The
 * areas that are open say what is waiting in them, so the dashboard is also
 * how you get back to where you were; the ones that are not yet say so,
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
        <header className="flex flex-col gap-1.5">
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
        <Icon size={20} />
      </span>
      <span className="flex min-w-0 flex-col gap-1.5">
        <span className="area-card__name">{area.label}</span>
        <span className="area-card__description">{area.description}</span>
      </span>
      <span className="area-card__foot">
        {area.available ? (
          <>
            <span className="area-card__current">{current ?? 'Open'}</span>
            <ArrowRight size={16} aria-hidden />
          </>
        ) : (
          <>
            <Lock size={14} aria-hidden />
            <span>Coming soon</span>
          </>
        )}
      </span>
    </>
  )

  if (!area.available) {
    return (
      <div className="area-card" data-locked="true" title={COMING_NEXT} aria-disabled="true">
        {body}
      </div>
    )
  }

  return (
    <button
      type="button"
      className="area-card"
      title={`Open ${area.label}`}
      onClick={() => pageActions.openArea(area.topic)}
    >
      {body}
    </button>
  )
}
