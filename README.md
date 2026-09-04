# Sonara — Next Level Piano Mastery

A virtual piano for the browser. Pick an instrument, play it with a mouse, a
touchscreen or a USB MIDI keyboard, and watch every note land on the keys.

<!-- The keyboard is the product. Everything else on the screen exists to get
     out of its way. -->

## What it does today

- **A virtual keyboard on centre stage**, responsive from 320px to a 4K monitor.
  It is sized in the sizes keyboards are sold in — 25, 32, 37, 49, 61, 76, 88 —
  defaulting to **61 key**, and each one keeps the range that size really has
  (a 32 starts on F, a 76 on E). Auto narrows when the screen cannot show 61 at
  a playable key width, and never widens past it: a 4K monitor has room for all
  88, but that is not a reason to hand someone a keyboard twice the size of the
  one they own. The view follows what you play, so a note off-screen still
  shows up.
- **Seven pianos** — a sampled concert grand, an upright, a honky-tonk, a Rhodes,
  a Wurlitzer, and a fully synthesised one that needs no network at all.
- **USB MIDI in**, with per-keyboard detection and configuration: transpose,
  octave shift, velocity curve, channel filter and sustain pedal, saved against
  the keyboard and restored the next time it is plugged in.

## Getting started

```bash
npm install
npm run dev
```

That starts both halves: the API on **:5175** and the app on **:5174**. Vite
proxies `/api` to the API, so the browser only ever talks to one origin — no
CORS in development and no difference from production.

| Command             | What it does                         |
| ------------------- | ------------------------------------ |
| `npm run dev`       | API + web, both in watch mode        |
| `npm run build`     | Type-check and build every workspace |
| `npm test`          | Every workspace's tests              |
| `npm run typecheck` | Type-check without emitting          |
| `npm run format`    | Prettier over the repo               |

Node 22.12 or newer (see `.nvmrc`). API docs are served at
<http://localhost:5175/docs> from the OpenAPI document the routes generate.

### Checking that it actually makes a sound

A silent app and a working one are identical in the DOM — the key lights up
either way, and every unit test passes either way. `npm run verify:audio`
(with `npm run dev` already running) drives real Chrome over the DevTools
Protocol, taps every connection into the audio destination with an analyser,
clicks middle C and reads the RMS.

It deliberately does **not** relax Chrome's autoplay policy. Browsers refuse to
start audio before a user gesture, so a freshly loaded page sits with a
suspended AudioContext and the first click on a key has to both unlock the
audio and play the note. That is the interesting case, and relaxing the policy
would hide it. Until that first gesture the app says so, on the instrument
itself, rather than being quietly silent.

## Layout

```
packages/shared   the domain: MIDI decoding, note maths, velocity curves,
                  device profiles, and the zod schemas the API and the app
                  both validate against
apps/api          Fastify + SQLite. The piano catalogue, the controller
                  profile database, and per-device configuration
apps/web          React + Vite + Tailwind v4. The keyboard, the audio
                  engines, and the Web MIDI integration
```

`@sonara/shared` is the contract. Both sides import the same zod schemas, so a
response the server can emit and the client cannot parse is a build error
rather than a runtime one.

## How it is put together

### The design system

The interface follows the [UI Bible](https://ui.skylanex.com), which is the
interface standard across these products. `apps/web/src/styles/tokens.css` is a
verbatim copy of its token layer — three tiers, primitive → semantic →
component, and a component that reaches past the semantic tier is a bug. Fix
values upstream and re-copy rather than editing them here.

Sonara's own additions live in `sonara.css`, in the component tier. The
keyboard is the one deliberate exception to reasoning from the elevation ramp:
a piano key is a depiction of a physical object, and a "white key" assigned
`--ds-surface-raised` because that is where it sits in the hierarchy is a piano
nobody recognises. The reasoning is written next to the values.

### Audio

Two engines behind one interface.

`SynthEngine` is additive synthesis in the browser — a bank of decaying sine
partials through a velocity-tracking low-pass, plus a noise transient for the
hammer. No network, no licence, always available.

`SampledEngine` wraps [smplr](https://github.com/danigb/smplr) and streams real
piano samples from a CDN.

Selecting a sampled piano does **both**: the built-in engine is built
immediately from that instrument's own voicing so the keyboard is playable on
the very next keystroke, and the samples are swapped in underneath when they
arrive. If they never arrive — an offline laptop, a captive portal, a blocked
CDN — nothing swaps, the UI says so, and the piano still plays. Every catalogue
entry carries a voicing for exactly this reason.

The sustain pedal is held by the provider rather than by either engine: it is a
property of the performance, not of the instrument, so every engine gets
identical pedal behaviour and an engine swap mid-pedal cannot strand a note.

### MIDI

Web MIDI needs a secure context, so the app must be on `https` or `localhost` —
opening a dev server's LAN address on a phone will report MIDI as unavailable,
and the UI says which of the four possible reasons applies.

Every connected port is listened to, not just a selected one: a player with a
controller and a digital piano plugged in at once expects both to work. Each
port carries its own configuration, and messages go through the same pipeline in
the same order — decode, channel filter, velocity curve, transpose. Downstream,
the keyboard and the engines see notes that are already correct and know nothing
about devices.

Devices are identified by a **fingerprint of manufacturer plus product name**,
not by `MIDIInput.id`. The Web MIDI id is implementation-defined: Chrome derives
it from the USB port, so it changes when you move the cable to the other socket,
and settings keyed on it vanish. The fingerprint also strips the trailing port
index browsers append, so Chrome's `P-125` and Firefox's `P-125 MIDI 1` are one
keyboard.

### Device profiles

`apps/api/src/data/device-profiles.ts` holds around thirty controller profiles,
seeded into SQLite on boot. Detection runs in three tiers — a curated profile, a
key count read out of the product name, then a 61-key default — and the tier is
returned to the client so an auto-guess is never presented as a fact.

A profile marked `keyCountFromName` lets the product name override its size, so
one `Launchkey` row covers the 25, 37, 49 and 61. Profiles without it keep their
own size, because a Yamaha NP-32 has 76 keys and reading "32" out of the model
number is exactly the mistake the flag exists to prevent.

## Database

SQLite, migrated by `user_version` so the schema version travels inside the file.
Migrations are append-only and each one runs in its own transaction.

WAL mode means the newest writes live in the `-wal` file, not the main one:
`cp sonara.sqlite` silently loses them. Back up with
`VACUUM INTO 'backup.sqlite'` instead.

## Browser support

Playing, and everything on screen, works everywhere. **MIDI input needs Chrome,
Edge or Opera** — Safari and Firefox have no Web MIDI. The app detects this and
says so rather than appearing to ignore the keyboard.
