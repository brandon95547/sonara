#!/usr/bin/env node
/**
 * Starts whichever halves of the dev stack are not already running.
 *
 * ## Why this is not just `concurrently`
 *
 * Two `npm run dev` stacks at once is the most confusing failure this project
 * has. The second API cannot bind 5175, exits, and the first socket keeps
 * accepting connections nobody answers — so the app loads, renders a keyboard,
 * and says "Loading pianos…" for ever, with the real message buried in a
 * terminal nobody is watching any more.
 *
 * Refusing to start would prevent that, but it trades one dead end for
 * another: the everyday case is half a stack — one side crashed, or was
 * stopped — and "already running" is no help when what you want is the missing
 * half.
 *
 * So this identifies what is already there before deciding. A port answering
 * as Sonara is reused, and said so out loud; a port held by something else is
 * refused with the reason. `npm run dev` becomes idempotent: run it as often
 * as you like and you end up with exactly one stack.
 */
import { createServer } from 'node:net'
import { spawn } from 'node:child_process'

const API_PORT = Number(process.env.PORT ?? 5175)
const WEB_PORT = Number(process.env.WEB_PORT ?? 5174)

const isFree = (port) =>
  new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.listen(port, '0.0.0.0', () => server.close(() => resolve(true)))
  })

/** Asks whatever is on the port whether it is us. */
async function identify(url, matches) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2500) })
    if (!response.ok) return false
    return matches(await response.text())
  } catch {
    // Bound but not answering is the wedged case, and it is not ours to reuse.
    return false
  }
}

const halves = [
  {
    name: 'api',
    port: API_PORT,
    task: 'npm:dev:api',
    colour: 'magenta',
    identify: () =>
      identify(`http://127.0.0.1:${API_PORT}/api/v1/health`, (body) =>
        /"status":"(ok|degraded)"/.test(body),
      ),
  },
  {
    name: 'web',
    port: WEB_PORT,
    task: 'npm:dev:web',
    colour: 'cyan',
    identify: () => identify(`http://127.0.0.1:${WEB_PORT}/`, (body) => /Sonara/.test(body)),
  },
]

const toStart = []
const reused = []

for (const half of halves) {
  if (await isFree(half.port)) {
    toStart.push(half)
    continue
  }
  if (await half.identify()) {
    reused.push(half)
    continue
  }
  process.stderr.write(
    `\n  Port ${half.port} is in use, but whatever is on it is not Sonara's ${half.name}.\n\n` +
      `  It may be another project, or a Sonara ${half.name} that has stopped\n` +
      `  answering. Find it and free the port:\n` +
      `    lsof -nP -iTCP:${half.port} -sTCP:LISTEN\n\n`,
  )
  process.exit(1)
}

for (const half of reused) {
  process.stdout.write(`  reusing the ${half.name} already running on ${half.port}\n`)
}

if (toStart.length === 0) {
  process.stdout.write(`\n  Sonara is already running - http://localhost:${WEB_PORT}\n\n`)
  process.exit(0)
}

const child = spawn(
  'npx',
  [
    'concurrently',
    '-n',
    toStart.map((half) => half.name).join(','),
    '-c',
    toStart.map((half) => half.colour).join(','),
    ...toStart.map((half) => half.task),
  ],
  { stdio: 'inherit' },
)

child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)))
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}
