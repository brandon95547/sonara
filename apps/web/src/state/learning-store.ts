import { create } from 'zustand'
import {
  buildScaleExercise,
  DEFAULT_SCALE_SPEC,
  IDLE_SESSION,
  isInExercise,
  normalisePitchClass,
  PIANO_HIGHEST_NOTE,
  PIANO_LOWEST_NOTE,
  accuracy,
  sessionReducer,
  tempo,
  WRONG_NOTE_FLASH_MS,
  type Exercise,
  type LearningMode,
  type ScaleSpec,
  type SessionState,
} from '@sonara/shared'

/**
 * The learning session, and the keyboard annotations that come out of it.
 *
 * The engine itself lives in `@sonara/shared` as a pure reducer; this store is
 * the thin React-facing shell around it. Everything derived — which keys light
 * up, in what role, with which finger — is computed here, once per change, into
 * a plain map keyed by MIDI note.
 *
 * That map is the whole interface between the learning system and the keyboard.
 * A key subscribes to `annotations[note]` and re-renders only when its own
 * entry changes, so a 61-key keyboard costs one re-render per note event rather
 * than sixty-one. It is also why the keyboard knows nothing about scales: when
 * chords and progressions arrive they produce the same map.
 */

export const LEARNING_TOPICS = [
  'songs',
  'scales',
  'chords',
  'arpeggios',
  'progressions',
  'exercises',
] as const
export type LearningTopic = (typeof LEARNING_TOPICS)[number]

export const LEARNING_TOPIC_LABELS: Record<LearningTopic, string> = {
  songs: 'Songs',
  scales: 'Scales',
  chords: 'Chords',
  arpeggios: 'Arpeggios',
  progressions: 'Progressions',
  exercises: 'Exercises',
}

/** Topics with a builder. The rest are announced honestly rather than faked. */
export const AVAILABLE_TOPICS: readonly LearningTopic[] = ['songs', 'scales']

export type KeyRole = 'scale' | 'root' | 'upcoming' | 'target' | 'wrong'

export interface KeyAnnotation {
  readonly role: KeyRole
  /** Recommended finger, 1-5. Never a claim about which finger was used. */
  readonly finger?: number
  /** `Thumb under` — shown only on the key it applies to, while it is current. */
  readonly cue?: string
  /** The spelled note name, e.g. `E♭`. */
  readonly label?: string
  /** This note's scale degree — `1`, `♭3`. Shown when key labels are set to it. */
  readonly degree?: string
  /** Which of the scale's two four-note groups this key belongs to, if either. */
  readonly group?: 'lower' | 'upper'
}

/**
 * What the keys say on them. One at a time, on purpose.
 *
 * Note names, degrees and fingers are three answers to three different
 * questions, and printing two of them at once produces a key labelled 4 with a
 * 3 above it — two answers to a question nobody asked together.
 */
export type KeyLabels = 'off' | 'notes' | 'degrees' | 'fingers'

interface LearningState {
  topic: LearningTopic
  mode: LearningMode
  spec: ScaleSpec
  exercise: Exercise | null
  session: SessionState
  annotations: Readonly<Record<number, KeyAnnotation>>
  /** Beats per minute the practice controls are set to. A target, not a metronome. */
  targetBpm: number
  /** Let a clean run raise the target and a scrappy one lower it. */
  autoTempo: boolean
  /**
   * Which step the demonstration is sounding, or null when it is not playing.
   *
   * Separate from `session.stepIndex` because the two answer different
   * questions: the session's index is how far the *player* has got and feeds
   * the score, while this is only where the playback head is. Guidance reads
   * whichever is live, so the finger that lights up during a demonstration is
   * the same finger Start would light on that note.
   */
  demoStepIndex: number | null
  /** View settings. What is drawn on the keys, not what the keys mean. */
  keyLabels: KeyLabels
  showStructure: boolean
  /**
   * What the keyboard shows while a song is being learned.
   *
   * Held beside the scale annotations rather than replacing them, so switching
   * tabs does not throw away either one. The keyboard reads whichever belongs
   * to the topic it is on.
   */
  songAnnotations: Readonly<Record<number, KeyAnnotation>>

  setTopic: (topic: LearningTopic) => void
  setMode: (mode: LearningMode) => void
  updateSpec: (patch: Partial<ScaleSpec>) => void
  start: () => void
  reset: () => void
  setDemoStep: (index: number | null) => void
  setSongAnnotations: (annotations: Record<number, KeyAnnotation>) => void
  setKeyLabels: (labels: KeyLabels) => void
  setShowStructure: (show: boolean) => void
  setTargetBpm: (bpm: number) => void
  setAutoTempo: (enabled: boolean) => void
  noteOn: (note: number) => void
  expireWrongNotes: () => void
}

/** How many notes ahead carry a finger badge in Learn mode. */
const LOOKAHEAD = 6

function buildExercise(topic: LearningTopic, spec: ScaleSpec): Exercise | null {
  // One switch, and it is the only place that maps a topic to a builder. Adding
  // chords is a case here plus a builder in shared — no other file changes.
  return topic === 'scales' ? buildScaleExercise(spec) : null
}

function buildAnnotations(
  exercise: Exercise | null,
  mode: LearningMode,
  session: SessionState,
  demoStepIndex: number | null = null,
): Record<number, KeyAnnotation> {
  const annotations: Record<number, KeyAnnotation> = {}
  if (!exercise) return annotations

  const nameFor = (note: number) => exercise.pitchNames[normalisePitchClass(note)]

  if (mode === 'explore') {
    // Every octave, because "the notes of A minor" is a fact about the whole
    // keyboard, not about the two octaves this exercise happens to walk.
    for (let note = PIANO_LOWEST_NOTE; note <= PIANO_HIGHEST_NOTE; note++) {
      if (!isInExercise(exercise, note)) continue
      annotations[note] = {
        role: normalisePitchClass(note) === exercise.rootPitchClass ? 'root' : 'scale',
        label: nameFor(note),
      }
    }
    return annotations
  }

  if (mode === 'practice') {
    // The guidance goes away. Only your own mistakes come back.
    for (const note of Object.keys(session.wrongNotes)) {
      annotations[Number(note)] = { role: 'wrong' }
    }
    return annotations
  }

  // Learn: the exercise's own notes, in the octaves it actually walks.
  // The demonstration's playback head stands in for the player's position while
  // it is running, so the same target, finger and cue appear on the same note.
  const here = demoStepIndex ?? session.stepIndex
  exercise.steps.forEach((step, index) => {
    const ahead = index - here
    step.notes.forEach((note, i) => {
      const existing = annotations[note]
      // A note played twice in a scale keeps the annotation of its earliest
      // remaining occurrence, which is the one the player is heading for.
      if (existing && existing.role !== 'scale') return
      annotations[note] = {
        // Notes already played keep the quiet wash and lose their badge. The
        // shape of the scale stays on the keyboard — a keybed that empties out
        // behind you takes away the very thing you are learning to see.
        role:
          ahead < 0 ? 'scale' : ahead === 0 ? 'target' : ahead <= LOOKAHEAD ? 'upcoming' : 'scale',
        finger: ahead < 0 ? undefined : step.fingers[i]?.finger,
        cue: ahead === 0 ? step.cue : undefined,
        label: step.label,
      }
    })
  })

  for (const note of Object.keys(session.wrongNotes)) {
    annotations[Number(note)] = { role: 'wrong' }
  }

  return describe(annotations, exercise)
}

/**
 * Adds the facts a key can be labelled with, whatever the mode decided.
 *
 * Always, rather than when a toolbar switch is on: these are properties of the
 * note, not of the view, and computing them here keeps the toolbar a rendering
 * decision instead of a reason to rebuild every annotation.
 */
function describe(
  annotations: Record<number, KeyAnnotation>,
  exercise: Exercise,
): Record<number, KeyAnnotation> {
  const groups = exercise.tetrachordGroups

  for (const [key, annotation] of Object.entries(annotations)) {
    const note = Number(key)
    const pitchClass = normalisePitchClass(note)
    const degree = exercise.pitchDegrees?.[pitchClass]
    // The tonic both opens the lower group and closes the upper one. It reads
    // as the start of the scale, so the lower group keeps it.
    const group = groups?.lower.includes(pitchClass)
      ? ('lower' as const)
      : groups?.upper.includes(pitchClass)
        ? ('upper' as const)
        : undefined

    if (degree || group) annotations[note] = { ...annotation, degree, group }
  }

  return annotations
}

const initialExercise = buildScaleExercise(DEFAULT_SCALE_SPEC)

export const useLearningStore = create<LearningState>((set, get) => {
  const rebuild = (
    topic: LearningTopic,
    spec: ScaleSpec,
    mode: LearningMode,
    session: SessionState,
  ) => {
    const exercise = buildExercise(topic, spec)
    // Any rebuild is a new exercise or a new mode, and the demonstration does
    // not survive either — so the playback head resets with it.
    // A new scale is a new question; whatever was drawn on the keys was about
    // the old one.
    return {
      exercise,
      session,
      demoStepIndex: null,
      annotations: buildAnnotations(exercise, mode, session),
    }
  }

  return {
    topic: 'scales',
    mode: 'learn',
    spec: DEFAULT_SCALE_SPEC,
    exercise: initialExercise,
    session: IDLE_SESSION,
    annotations: buildAnnotations(initialExercise, 'learn', IDLE_SESSION),
    targetBpm: initialExercise.defaultBpm,
    autoTempo: false,
    demoStepIndex: null,
    keyLabels: 'notes',
    showStructure: false,
    songAnnotations: {},

    setTopic: (topic) =>
      set((state) => ({ topic, ...rebuild(topic, state.spec, state.mode, IDLE_SESSION) })),

    setMode: (mode) =>
      // Changing mode ends the run. Half a scale learned with the answers on
      // screen is not half a scale practised, and merging the two scores would
      // say it was.
      set((state) => ({ mode, ...rebuild(state.topic, state.spec, mode, IDLE_SESSION) })),

    updateSpec: (patch) =>
      set((state) => {
        const spec = { ...state.spec, ...patch }
        return { spec, ...rebuild(state.topic, spec, state.mode, IDLE_SESSION) }
      }),

    start: () =>
      set((state) => {
        const session = sessionReducer(
          state.session,
          { type: 'start', at: Date.now() },
          state.exercise,
        )
        return {
          session,
          // Starting a run ends the demonstration: one head at a time, and from
          // here the position that matters is the player's.
          demoStepIndex: null,
          annotations: buildAnnotations(state.exercise, state.mode, session, null),
        }
      }),

    reset: () =>
      set((state) => ({
        session: IDLE_SESSION,
        demoStepIndex: null,
        annotations: buildAnnotations(state.exercise, state.mode, IDLE_SESSION, null),
      })),

    setDemoStep: (index) =>
      set((state) => ({
        demoStepIndex: index,
        annotations: buildAnnotations(state.exercise, state.mode, state.session, index),
      })),

    setSongAnnotations: (songAnnotations) => set({ songAnnotations }),

    setKeyLabels: (keyLabels) => set({ keyLabels }),

    setShowStructure: (showStructure) => set({ showStructure }),

    setTargetBpm: (bpm) => set({ targetBpm: clampBpm(bpm) }),

    setAutoTempo: (autoTempo) => set({ autoTempo }),

    noteOn: (note) => {
      const state = get()
      if (state.session.status !== 'running') return
      const session = sessionReducer(
        state.session,
        { type: 'noteOn', note, at: Date.now() },
        state.exercise,
      )
      if (session === state.session) return

      set({
        session,
        annotations: buildAnnotations(state.exercise, state.mode, session, state.demoStepIndex),
        // Auto tempo moves the target only at the end of a run, and only on
        // evidence: a clean pass at or above the current target earns a nudge
        // up, a scrappy one earns a nudge down, and anything in between leaves
        // it alone. Adjusting mid-scale would chase the player's own hesitation.
        ...(session.status === 'complete' && state.autoTempo
          ? { targetBpm: nextTargetBpm(state.targetBpm, session) }
          : {}),
      })
    },

    expireWrongNotes: () => {
      const state = get()
      if (Object.keys(state.session.wrongNotes).length === 0) return
      const session = sessionReducer(
        state.session,
        { type: 'expireWrong', before: Date.now() - WRONG_NOTE_FLASH_MS },
        state.exercise,
      )
      if (session === state.session) return
      set({
        session,
        annotations: buildAnnotations(state.exercise, state.mode, session, state.demoStepIndex),
      })
    },
  }
})

function clampBpm(bpm: number): number {
  return Math.min(208, Math.max(30, Math.round(bpm)))
}

const AUTO_TEMPO_STEP = 4

function nextTargetBpm(target: number, session: SessionState): number {
  const score = accuracy(session)
  const measured = tempo(session)
  if (score >= 0.95 && measured !== null && measured >= target * 0.95) {
    return clampBpm(target + AUTO_TEMPO_STEP)
  }
  if (score < 0.85) return clampBpm(target - AUTO_TEMPO_STEP)
  return target
}

/** For hot paths and event handlers — no subscription, no re-render. */
export const learningActions = {
  noteOn: (note: number) => useLearningStore.getState().noteOn(note),
  setDemoStep: (index: number | null) => useLearningStore.getState().setDemoStep(index),
}
