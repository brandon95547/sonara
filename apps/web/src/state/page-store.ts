import * as React from 'react'
import { create } from 'zustand'
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
 * Which area is open is still the learning store's `topic`; this only says
 * whether we are in it.
 */
export type Page = 'dashboard' | 'area'

interface PageState {
  page: Page
}

/** The area a hash names, if it is one that can be opened. */
function areaIn(hash: string): LearningTopic | null {
  const name = hash.replace(/^#\/?/, '')
  return AVAILABLE_TOPICS.find((topic) => topic === name) ?? null
}

// Read before the first render, so a reload on an area does not flash the
// dashboard while an effect catches up.
const initialArea = areaIn(globalThis.location?.hash ?? '')
if (initialArea) useLearningStore.getState().setTopic(initialArea)

export const usePageStore = create<PageState>(() => ({
  page: initialArea ? 'area' : 'dashboard',
}))

function apply(hash: string) {
  const area = areaIn(hash)
  if (!area) {
    // Leaving an area stops what it was playing. Left alone, the song's own
    // engine unmounts but the song still says it is playing, and it would set
    // off again by itself the moment the player came back.
    if (useSongStore.getState().playing) useSongStore.getState().setPlaying(false)
    usePageStore.setState({ page: 'dashboard' })
    return
  }
  const learning = useLearningStore.getState()
  if (learning.topic !== area) learning.setTopic(area)
  usePageStore.setState({ page: 'area' })
}

function go(hash: string) {
  // Assigning the hash it already has fires nothing, so apply it by hand.
  if (globalThis.location.hash === hash) apply(hash)
  else globalThis.location.hash = hash
}

export const pageActions = {
  openDashboard: () => go('#/'),
  openArea: (topic: LearningTopic) => go(`#/${topic}`),
}

/** Follows the address bar. Mounted once, by the shell. */
export function usePageSync() {
  React.useEffect(() => {
    const follow = () => apply(globalThis.location.hash)
    globalThis.addEventListener('hashchange', follow)
    return () => globalThis.removeEventListener('hashchange', follow)
  }, [])
}
