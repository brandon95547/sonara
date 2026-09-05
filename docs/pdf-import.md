# Scope: PDF sheet music import

Turning a PDF of a score into something Sonara can teach from. Written after
probing what is actually installable rather than what the packages claim.

## Correction to an earlier claim

I previously said `onnxruntime` "publishes nothing for Python 3.14". That was
wrong, and wrong in a way that matters here.

`onnxruntime` 1.29.0 publishes wheels for **cp311 through cp314** — the Python
version is not the problem. What it publishes for macOS is
`macosx_14_0_arm64`: **Apple Silicon only**. This machine is an Intel Core i5
(`x86_64`, Homebrew at `/usr/local`), so there is no wheel for it at any Python
version.

And `oemer` declares **`onnxruntime-gpu`**, which ships `manylinux` and
`win_amd64` and nothing else — no macOS wheel of any kind, on either
architecture.

So the constraint is not the Python version. It is:

| Host                           | oemer installable                                       |
| ------------------------------ | ------------------------------------------------------- |
| Linux x86_64 / aarch64 (prod)  | yes                                                     |
| macOS Apple Silicon            | only with `--no-deps` and CPU `onnxruntime` substituted |
| **macOS Intel (this machine)** | **no** — no wheel exists                                |

That decides the architecture before anything else does: **the converter cannot
run on this laptop.** It runs on the Linux host, and local development talks to
it or stubs it.

## Pipeline

`oemer` takes an **image**, not a PDF. The full path is four steps, and only the
middle one is oemer:

```
score.pdf
  → pdftoppm -r 300 -png        rasterise, one PNG per page   [poppler]
  → oemer page-N.png            per page → MusicXML           [oemer]
  → merge parts across pages    ours
  → importMusicXml()            already built, already tested
```

Two things fall out of that shape:

- **Poppler is a system dependency**, not a pip one — exactly the class of thing
  `phansora-api`'s Makefile documents at the top of the file and checks in
  `make doctor`. A fresh host without it fails on the first PDF.
- **Merging is ours to write.** oemer reads one image with no idea it is page 3
  of 6. Parts, measure numbering and clefs have to be stitched, and this is
  where multi-page scores will go wrong first.

## Setup — following `phansora-api/Makefile`

Sonara has no Makefile today; it is pure npm workspaces. Python needs one, and
the conventions are already set next door, so this copies them rather than
inventing a second style:

```make
# Sonara — developer tasks
#
# SYSTEM DEPENDENCIES (not installable by pip):
#   poppler-utils — rasterises a PDF into the PNGs oemer reads.
#     Debian/Ubuntu:  apt install -y poppler-utils
#     RHEL/CentOS:    dnf install -y poppler-utils
#     macOS:          brew install poppler
#   Run `make doctor` on a freshly provisioned box to find these before users do.

VENV   ?= .venv-omr
# oemer's onnxruntime has no macOS x86_64 wheel at any version, so this target
# is Linux-only by nature, not by choice. 3.12 because it is the newest with
# wheels for every dependency in the chain.
PYTHON ?= python3.12

.PHONY: help doctor install-omr omr-check clean-omr

help:        ## List targets
doctor:      ## Check poppler and the venv — run on a new box
install-omr: ## Linux: venv + oemer (CPU onnxruntime substituted for the GPU pin)
omr-check:   ## Convert docs/fixtures/one-bar.pdf and diff against the expected MusicXML
clean-omr:   ## Remove the venv and the model cache
```

`install-omr` has to do what `install-tts` does for CosyVoice: install with
`--no-deps` and re-assert the dependencies by hand, because `onnxruntime-gpu`
is an explicit pin that a constraints file cannot override and that pulls CUDA
onto a box that may not have it.

`uv` is not installed on this machine; `phansora-api` prefers it and falls back
to `python -m venv`. Same fallback here.

## API

One endpoint on the existing Fastify app, because the browser cannot do this
and the API is already the only server we run.

```
POST /api/v1/scores/convert    multipart: file=<pdf>
  → 202 { jobId }

GET  /api/v1/scores/convert/:jobId
  → { status: 'running', page: 2, pages: 6 }
  → { status: 'done', musicxml: '<score-partwise…' }
  → { status: 'failed', reason: '…' }
```

Asynchronous because OMR is **tens of seconds to minutes per page** — far past
any sensible request timeout. The job runs as a child process; the endpoint
polls it. That is also the first real background job in this API, so it needs a
job store (in-memory is honest for v1, and says so on restart).

Guards worth writing on day one: a page cap, a file-size cap, a hard timeout,
and cleanup of the temporary PNGs, which are large and numerous.

## Client

The import drawer already recognises a PDF and explains why it cannot read it.
That branch becomes: upload, show progress per page, then hand the returned
MusicXML to `importMusicXml()` — which is built, tested, and now reads fingering
and key signatures.

Everything downstream is unchanged. That is the payoff of having made MusicXML
the interchange format: PDF import is a new _front end_ on a path that already
works.

## What this will and will not do

OMR accuracy is the part no engineering here improves. Cleanly engraved modern
scores come out usable; anything scanned, handwritten, or dense comes out
needing correction. **Fingering is among the first things lost**, so the very
thing that makes MusicXML worth preferring is the thing PDF import is worst at.

The output should therefore be labelled as recognised rather than read — the
same distinction the app already draws between a standard fingering and a
suggested one, and between a declared key and an estimated one.

## Effort and sequence

1. **`.mxl` support** — half a day. Unzip, hand the XML to the existing parser.
   Independent of all of this, and it unblocks the MuseScore workflow the app
   currently recommends: MuseScore's _default save format is the one we reject_.
2. **Makefile + `install-omr` + `doctor`** — a day, mostly dependency wrangling.
3. **Endpoint + job runner + guards** — two to three days.
4. **Page merging** — hard to bound; the first multi-page score will teach us
   more than an estimate would.
5. **Client flow** — a day, since the drawer and the importer both exist.

## Decisions needed

- **Where does the converter run?** Prod host, or a container? It cannot be this
  laptop, so local development needs an answer either way: point at a deployed
  endpoint, or stub the conversion.
- **Is step 1 worth doing first on its own?** It is small, it removes the most
  likely import failure today, and it does not depend on any of the rest.
