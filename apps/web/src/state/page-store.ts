import * as React from 'react'
import { create } from 'zustand'
import { findProgressionType, type ProgressionType } from '@sonara/shared'
import { AVAILABLE_TOPICS, useLearningStore, type LearningTopic } from './learning-store'
import { useSongStore } from './song-store'

/**
 * Which page is up: the dashboard, or one of the areas it leads to.
 *
 * The address bar is the source of truth — `#/scales`, `#/songs`, and nothing
 * (or `#/`) for the dashboard — so Back leaves an area for the dashboard the
 * way it would leave any page, and a reload lands where the player was. A hash
 * rather than a path because nothing on the server has to know about it.
 *
 * An area with types of its own carries the type as a second step —
 * `#/progressions/cadences` — for the same reason: a reload should land on the
 * kind of progression that was open, not on whichever comes first. The area's
 * bare address still opens it, on the type it was last left on.
 *
 * Which area is open is still the learning store's `topic`, and which type its
 * `progressionType`; this only says whether we are in it.
 */
export type Page = 'dashboard' | 'area'

interface PageState {
  page: Page
}

interface Place {
  readonly area: LearningTopic
  /** The type of progression the address names, where it names one. */
  readonly progression: ProgressionType | null
}

/** The area a hash names, if it is one that can be opened. */
function placeIn(hash: string): Place | null {
  const [name, type] = hash.replace(/^#\/?/, '').split('/')
  const area = AVAILABLE_TOPICS.find((topic) => topic === name)
  if (!area) return null
  return { area, progression: area === 'progressions' ? findProgressionType(type) : null }
}

/** Puts the learning store where an address says to be. */
function enter(place: Place) {
  const learning = useLearningStore.getState()
  if (place.progression) learning.setProgressionType(place.progression)
  if (learning.topic !== place.area) learning.setTopic(place.area)
}

// Read before the first render, so a reload on an area does not flash the
// dashboard while an effect catches up.
const initialPlace = placeIn(globalThis.location?.hash ?? '')
if (initialPlace) enter(initialPlace)

export const usePageStore = create<PageState>(() => ({
  page: initialPlace ? 'area' : 'dashboard',
}))

function apply(hash: string) {
  const place = placeIn(hash)
  if (!place) {
    // Leaving an area stops what it was playing. Left alone, the song's own
    // engine unmounts but the song still says it is playing, and it would set
    // off again by itself the moment the player came back.
    if (useSongStore.getState().playing) useSongStore.getState().setPlaying(false)
    usePageStore.setState({ page: 'dashboard' })
    return
  }
  enter(place)
  usePageStore.setState({ page: 'area' })
}

function go(hash: string) {
  // Assigning the hash it already has fires nothing, so apply it by hand.
  if (globalThis.location.hash === hash) apply(hash)
  else globalThis.location.hash = hash
}

export const pageActions = {
  openDashboard: () => go('#/'),
  openArea: (topic: LearningTopic) =>
    go(
      topic === 'progressions'
        ? `#/progressions/${useLearningStore.getState().progressionType}`
        : `#/${topic}`,
    ),
  /** One of Progressions' types — which is also how the area's own menu changes it. */
  openProgression: (type: ProgressionType) => go(`#/progressions/${type}`),
}

/** Follows the address bar. Mounted once, by the shell. */
export function usePageSync() {
  React.useEffect(() => {
    const follow = () => apply(globalThis.location.hash)
    globalThis.addEventListener('hashchange', follow)
    return () => globalThis.removeEventListener('hashchange', follow)
  }, [])
}
