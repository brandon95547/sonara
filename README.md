# Sonara — Next Level Piano Mastery

A virtual piano for the browser. Pick an instrument, play it with a mouse, a
touchscreen or a USB MIDI keyboard, and watch every note land on the keys.

<!-- The keyboard is the product. Everything else on the screen exists to get
     out of its way. -->

## What it does today

### The instrument

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
- **A live grand staff** above the keyboard, and view controls beneath it —
  follow, key labels (off, notes, degrees or fingers), scale structure, and the
  staff itself.

### Learning a scale

- **Explore, Learn, Practice.** Explore lights every note of the scale across
  the whole keyboard; Learn walks you through one note at a time with the
  recommended finger on the key; Practice takes the guidance away and keeps
  score.
- **Fourteen scale types** — major, all three minors, the five modes, both
  pentatonics, blues, chromatic and whole tone — in every key, either hand, one
  to three octaves, ascending, descending or both.
- **Play it to hear it.** A demo button walks the scale at a learnable tempo,
  driving the same finger and target guidance Learn uses.
- **"Understand this scale"** explains the one you have selected: how it is
  built from its tetrachords, its degrees, its relative key, and the fingering
  principle behind the hand you are being shown.

### Songs

- **Import MusicXML (`.musicxml`, `.xml`), Compressed MusicXML (`.mxl`),
  MuseScore (`.mscz`) and MIDI (`.mid`, `.midi`)** — normalised into one score
  model on the way in, so playback, the keyboard, the staff and Learn never know
  which format a song came from. Formats are identified by their first bytes,
  not their extension.
- **It tells you what the file did not carry.** Notes, rhythm, hands, dynamics,
  pedal and fingering are each recorded as present or absent, and the library
  says so rather than quietly filling gaps.
- **Fingering is worked out for files that have none** — see below.
- **Drums are played as drums.** A MIDI file's percussion channel is routed to a
  synthesised kit rather than onto the piano, and accompaniment parts sound
  without lighting keys you are not being asked to play.
- **Explore and Learn for songs**, with part selection, tempo, a metronome and a
  progress bar over the staff. The library persists between sessions.

### Recording

- **Record what you play**, with a three-second countdown, and export the take as
  **MIDI** or **MusicXML**.

### Fingering on import

MIDI has nowhere to record which finger plays a note — the format has no field
for it — and plenty of scores are published unfingered. Sonara works it out.

- A **fingered score is never touched.** Whoever edited it knew more than this
  does.
- Otherwise each hand's part is cut into runs of single notes and each run is
  fingered by searching every possibility against a published model of what a
  hand finds difficult (Parncutt et al., _Music Perception_ 14(4), 1997 — twelve
  weighted rules the authors tested against fingerings pianists wrote on Czerny
  studies).
- **Chords are fingered too**, from the shapes the method books print — keyed by
  the intervals between the notes, so no key or root has to be worked out first.
  That table is needed because the hand model cannot reach it: `1 3 5` and
  `1 2 4` cost a C major triad exactly the same, so the spans leave the choice
  open and only a book closes it.
- **A chord too wide to hold is rolled, not refused.** A bass note a tenth under
  a grip is ordinary piano writing and a printed edition fingers it without
  comment. A chord whose _inner_ notes are out of reach is two hands, and gets
  nothing.
- **You can always tell which you are looking at.** Worked-out fingering is
  labelled _Suggested_; fingering an editor wrote is labelled _Fingered score_.

Imported through the real path, a MIDI C major scale up and back down comes out
`1 2 3 1 2 3 4 5 · 4 3 2 1 3 2 1` — the fingering a method book prints, from a
file that could not have contained it. On a real four-part arrangement, 735 of
its 737 keyboard notes come out fingered; the two that do not are a nineteenth
in one hand, which is not a chord.

The full reference for all of this — the twelve rules, the span tables, the
published scale fingerings and how they were verified — is
`piano-fingering-reference.md`, kept alongside this repo rather than inside it
because it is source material for more than one project.

## Getting started

Node **24** — pinned in `.nvmrc` / `.node-version` and used by CI. With
[nvm](https://github.com/nvm-sh/nvm), identically on macOS and Linux:

```bash
nvm install && nvm use
```

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

Node 24 is the pinned version; 22.12+ also works. Node **23 does not** — it is
end-of-life and several dependencies exclude it, which shows up as `EBADENGINE`
warnings on install. API docs are served at
<http://localhost:5175/docs> from the OpenAPI document the routes generate.

### If the app says "Loading pianos…" and stays there

The API is not answering. Almost always that is **two `npm run dev` stacks at
once**: the second one's API cannot bind port 5175, dies, and leaves the first
one's socket in place — so requests are accepted and never answered.

```bash
ps aux | grep concurrently      # should show exactly one stack
ss -tln | grep 517              # 5174 and 5175, one owner each
curl --max-time 5 localhost:5175/api/v1/health
```

The app now says so rather than spinning: the client gives a request six
seconds, the app bar switches to _Pianos unavailable_ on the first failure, and
the page shows what went wrong with a Try again once the retry is spent.

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
packages/shared   the domain: MIDI decoding, note maths, scales and
                  fingering, the score model and its importers' output,
                  velocity curves, device profiles, and the zod schemas the
                  API and the app both validate against
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

### The learning system

Everything Sonara can teach reduces to the same thing: an ordered list of steps,
where a step is a set of notes that has to sound before the next one is due. A
scale is a sequence of one-note steps; a chord is one step of three notes; a
progression is a sequence of chord-shaped steps.

```
packages/shared/src/music/      pitch spelling, scale definitions, fingering
packages/shared/src/learning/   the Exercise model, builders, the session engine
```

Nothing downstream — not the engine, not the keyboard, not the dashboard — knows
which of those it is looking at. Adding Chords, Arpeggios, Progressions or
Exercises is a builder that returns steps; the highlighting, the finger badges,
the scoring and the dashboard already work on them. The topic tabs for those are
shown and disabled rather than hidden, because the shape of the thing is the
promise.

The session engine is a **pure reducer over note events**, deliberately:
everything interesting in it — when a step advances, what counts as a mistake,
how tempo is inferred — is logic that has to be right, and logic that is right is
logic you can test without a browser, an AudioContext or a MIDI cable.

**Notes are spelled properly.** A MIDI note number knows its pitch but not its
name: note 6 is F♯ in D major and G♭ in D♭ major. Each degree takes the letter
its _number_ implies and whatever accidental makes that letter sound right, so
A♭ major comes out as A♭ B♭ C D♭ E♭ F G rather than G♯ A♯ C C♯ D♯ F G, C blues
keeps its traditional G♭ and G♮ on the same letter, and G♯ harmonic minor gets
the F𝄪 it actually has. The root spelling is chosen the way a musician would —
whichever of the two enharmonics needs fewer accidentals — which is how pitch
class 1 comes out as D♭ _major_ and C♯ _minor_.

**Fingering is a recommendation, never a reading.** MIDI reports which note was
played and how hard. It does not report which finger played it, and Sonara does
not pretend otherwise — the cards say so.

Two sources answer two different questions, and which one applies decides what
the answer is labelled.

_Published tables_ cover major, all three minor forms and the chromatic scale,
in every key and both hands, checked against the degree each page names for its
4th finger — which is how the source indexes a scale, and what catches a wrong
pattern that happens to be playable. Three of those keys are exceptions worth
knowing about: G♯ minor's left hand differs between its natural and harmonic
forms, and F♯ and C♯ **melodic** minor move the right hand's 4th finger onto the
raised sixth going up. A melodic minor descends as a natural minor and is
fingered as one, because mirroring the ascent lands the same finger on both
notes either side of the turn. Tables are keyed by pitch class rather than by
name: D♯ minor and E♭ minor are one scale, and a caller will ask for whichever
name you did not store.

_Worked out_ covers everything else. For scales with no published fingering the
thumb positions are planned across the whole passage by shortest path and the
fingers filled in afterwards, which makes the result playable by construction —
no finger reachable twice, the little finger only at an end. Run over the notes
of the 24 published scales it reproduces every one, exactly or as the primary
where the table stores the variant that continues into the next octave. Two
rules do that work, and their order is the whole point: "the thumb avoids black
keys" is a preference, "the hand has five fingers" is anatomy, and enforcing the
first absolutely while letting the second slide produces fingerings that ask the
little finger for three rising notes in a row.

Anything worked out is labelled _Suggested_ rather than _Standard_, because
those are different claims.

### Songs

Four formats in, one score model out. `read-song.ts` is the only way in and
sniffs the first bytes rather than trusting an extension — a `.xml` that is
really MIDI and a `.mid` that is really XML both happen when files come out of
other programs.

`.mxl` and `.mscz` are both zips. The MusicXML one is read through the manifest
its spec requires; the MuseScore one is **not**, because MuseScore 4 lists every
file in the archive as a `<rootfile>` with the style sheet first, so following
the pointer hands back `score_style.mss`. The score is found by extension
instead. MuseScore 3 happens to put it first and survives either reading, which
is why both are kept as fixtures.

A staff is only a hand when one `<Part>` owns two of them. Two single-staff
parts are two instruments, and reading the lower one as a left hand puts a
melody where no left hand plays — and, worse, claims the score said so.

Fingering that the file did not carry is worked out on import by
`songs/song-fingering.ts`, over the hand model in `music/hand-model.ts` and the
search in `music/finger-passage.ts`. Runs break at chords and at rests long
enough to move the hand.

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
