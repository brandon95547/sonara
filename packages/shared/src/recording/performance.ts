/**
 * A recorded performance: what was played, when, and for how long.
 *
 * Kept as raw on/off events while recording — that is the shape the keyboard
 * produces and the cheapest thing to append to on a hot path — and paired into
 * notes only when the recording stops and something wants to write it out.
 */

export interface PerformanceEvent {
  readonly note: number
  /** 1-127. Kept for MIDI, which records how hard a note was struck. */
  readonly velocity: number
  readonly on: boolean
  /** Milliseconds since the recording started. */
  readonly at: number
}

export interface RecordedNote {
  readonly note: number
  readonly velocity: number
  readonly startMs: number
  readonly durationMs: number
}

/** The shortest note worth keeping. Below this it is a bounced key, not a note. */
const MIN_DURATION_MS = 20

/**
 * Pairs note-ons with their note-offs.
 *
 * A pitch can legitimately be struck again before the first one is released —
 * a repeated note under a held pedal, or two fingers on one key during a hand
 * change — so ons are held in a queue per pitch and the *earliest* unmatched
 * one is closed first. Taking the latest instead would give the repeat the
 * long duration and the held note the short one.
 */
export function notesFromEvents(
  events: readonly PerformanceEvent[],
  endMs?: number,
): RecordedNote[] {
  const open = new Map<number, PerformanceEvent[]>()
  const notes: RecordedNote[] = []
  const last = endMs ?? events.at(-1)?.at ?? 0

  for (const event of events) {
    if (event.on) {
      const queue = open.get(event.note) ?? []
      queue.push(event)
      open.set(event.note, queue)
      continue
    }
    const started = open.get(event.note)?.shift()
    if (!started) continue
    notes.push({
      note: event.note,
      velocity: started.velocity,
      startMs: started.at,
      durationMs: Math.max(MIN_DURATION_MS, event.at - started.at),
    })
  }

  // A key still down when the recording stopped is a note that ends there.
  for (const queue of open.values()) {
    for (const started of queue) {
      notes.push({
        note: started.note,
        velocity: started.velocity,
        startMs: started.at,
        durationMs: Math.max(MIN_DURATION_MS, last - started.at),
      })
    }
  }

  return notes.sort((a, b) => a.startMs - b.startMs || a.note - b.note)
}

/** Total length of the performance, in milliseconds. */
export function performanceLength(notes: readonly RecordedNote[]): number {
  return notes.reduce((longest, note) => Math.max(longest, note.startMs + note.durationMs), 0)
}
