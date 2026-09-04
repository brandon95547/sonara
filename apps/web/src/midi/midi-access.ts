/**
 * Web MIDI access, and the four different ways it can be unavailable.
 *
 * Each one needs a different sentence in the UI, and telling them apart is the
 * difference between a player fixing the problem in ten seconds and concluding
 * the app is broken:
 *
 *   unsupported       this browser has no Web MIDI at all (Safari, Firefox
 *                     without the pref) — the fix is a different browser
 *   insecure-context  the page is not on https or localhost — the fix is the
 *                     address bar, and it is the one that catches people
 *                     testing on a phone against a dev machine's LAN address
 *   denied            the permission prompt was dismissed — the fix is the
 *                     padlock icon
 *   error             something else went wrong — show what the browser said
 */

export type MidiUnavailableReason = 'unsupported' | 'insecure-context'

export type MidiAccessState =
  | { state: 'idle' }
  | { state: 'requesting' }
  | { state: 'ready' }
  | { state: 'denied' }
  | { state: 'unavailable'; reason: MidiUnavailableReason }
  | { state: 'error'; message: string }

export function detectMidiSupport():
  { supported: true } | { supported: false; reason: MidiUnavailableReason } {
  if (typeof navigator === 'undefined' || !('requestMIDIAccess' in navigator)) {
    return { supported: false, reason: 'unsupported' }
  }
  // Web MIDI is gated on a secure context. `isSecureContext` is true for
  // https and for localhost, which is exactly the set we can work in.
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return { supported: false, reason: 'insecure-context' }
  }
  return { supported: true }
}

export async function requestMidiAccess(): Promise<
  { ok: true; access: MIDIAccess } | { ok: false; state: MidiAccessState }
> {
  const support = detectMidiSupport()
  if (!support.supported) {
    return { ok: false, state: { state: 'unavailable', reason: support.reason } }
  }

  try {
    // `sysex: false` keeps the permission prompt to the mild version. Nothing
    // Sonara does needs system-exclusive messages, and asking for them turns a
    // one-click prompt into a scary one.
    const access = await navigator.requestMIDIAccess({ sysex: false })
    return { ok: true, access }
  } catch (error) {
    const name = (error as DOMException)?.name
    if (name === 'SecurityError' || name === 'NotAllowedError') {
      return { ok: false, state: { state: 'denied' } }
    }
    return {
      ok: false,
      state: {
        state: 'error',
        message: error instanceof Error ? error.message : 'MIDI access failed.',
      },
    }
  }
}

export const MIDI_UNAVAILABLE_COPY: Record<
  MidiUnavailableReason,
  { title: string; detail: string }
> = {
  unsupported: {
    title: 'This browser has no MIDI support',
    detail:
      'Web MIDI works in Chrome, Edge and Opera. Safari and Firefox cannot see USB keyboards yet — the on-screen keyboard still plays.',
  },
  'insecure-context': {
    title: 'MIDI needs a secure connection',
    detail:
      'Browsers only allow MIDI on https or on localhost. Open Sonara over https, or on the machine it is running on.',
  },
}
