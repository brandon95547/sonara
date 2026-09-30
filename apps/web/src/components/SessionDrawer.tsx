import { Drawer } from '@/ui/Drawer'
import { useLearningStore } from '@/state/learning-store'
import { usePanelStore } from '@/state/panel-store'
import { SessionPanelContent } from '@/features/learning/LearningDashboard'
import { SongHandCard } from '@/features/songs/SongHandCard'

/**
 * Where the run is, how it is going, and what the material is — the cards that
 * used to sit under the keyboard. For a song, the hand position: which fingers
 * are on the keys now and where the fingering came from.
 */
export function SessionDrawer() {
  const open = usePanelStore((state) => state.panel === 'session')
  const close = usePanelStore((state) => state.close)
  const topic = useLearningStore((state) => state.topic)
  const title = useLearningStore((state) => state.exercise?.title)
  const songs = topic === 'songs'

  return (
    <Drawer
      open={open}
      onClose={close}
      title={songs ? 'Hand position' : 'Progress'}
      description={songs ? 'The fingers for what you are playing now.' : title}
    >
      {songs ? <SongHandCard /> : <SessionPanelContent />}
    </Drawer>
  )
}
