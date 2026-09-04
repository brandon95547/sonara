#!/usr/bin/env node
/**
 * Refuses to start a second dev stack.
 *
 * Two `npm run dev` stacks at once is the single most confusing failure this
 * project has: the second API cannot bind, dies, and the first one's socket is
 * left accepting connections nobody answers. What you see is not an error —
 * it is an app that loads, renders a keyboard, and says "Loading pianos…" for
 * ever, with the real message buried in a terminal you are no longer watching.
 *
 * Failing here instead costs a second and says exactly what is wrong.
 */
import { createServer } from 'node:net'

const PORTS = [
  { port: Number(process.env.PORT ?? 5175), name: 'API' },
  { port: 5174, name: 'web' },
]

const check = ({ port, name }) =>
  new Promise((resolve) => {
    const server = createServer()
    server.once('error', (error) => resolve(error.code === 'EADDRINUSE' ? { port, name } : null))
    server.listen(port, '0.0.0.0', () => server.close(() => resolve(null)))
  })

const taken = (await Promise.all(PORTS.map(check))).filter(Boolean)

if (taken.length > 0) {
  const busy = taken.map((entry) => `${entry.name} (${entry.port})`).join(' and ')
  const free = PORTS.filter((entry) => !taken.some((t) => t.port === entry.port))

  // Half a stack is the common case — one side crashed, or was stopped — and
  // "already running" is unhelpful there. Name the half that is missing and the
  // command that starts exactly it.
  const advice =
    free.length === 0
      ? `  A full stack is already running. Use it, or stop it first:\n` +
        `    pkill -f "concurrently -n api,web"\n`
      : `  Start only the half that is missing:\n` +
        free.map((entry) => `    npm run dev:${entry.name === 'API' ? 'api' : 'web'}\n`).join('')

  process.stderr.write(
    `\n  Sonara is already using ${busy}.\n\n` +
      `  Two stacks at once does not work: the second API cannot bind, exits, and\n` +
      `  the first socket keeps accepting requests nothing answers — which the app\n` +
      `  shows as "Loading pianos…" and never resolves.\n\n` +
      advice +
      `\n`,
  )
  process.exit(1)
}
