import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiClientError } from '@/lib/api'

/**
 * The failure paths.
 *
 * A hung server is the one that matters most: `fetch` has no timeout of its
 * own, so a server that accepts the connection and then never answers leaves
 * the promise pending for ever — and what the player sees is not an error but
 * a spinner that never stops. That is indistinguishable from "slow", and it is
 * exactly the state that produced an endless "Loading pianos…".
 */

const realFetch = globalThis.fetch

/** A server that accepts the request and never replies. */
const hangingFetch = () =>
  vi.fn(
    (_url: unknown, init?: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'TimeoutError' }))
        })
      }),
  ) as unknown as typeof fetch

const jsonFetch = (body: unknown, status = 200) =>
  vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  ) as unknown as typeof fetch

afterEach(() => {
  globalThis.fetch = realFetch
  vi.useRealTimers()
})

describe('a server that never answers', () => {
  beforeEach(() => vi.useFakeTimers())

  it('gives up instead of hanging for ever', async () => {
    globalThis.fetch = hangingFetch()
    const pending = api.listInstruments().catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(7_000)
    expect(await pending).toBeInstanceOf(ApiClientError)
  })

  it('says what actually went wrong', async () => {
    globalThis.fetch = hangingFetch()
    const pending = api.listInstruments().catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(7_000)
    const error = (await pending) as ApiClientError

    expect(error.code).toBe('timeout')
    expect(error.message).toMatch(/did not answer/)
    // Status 0 marks "we never got an answer", which the UI may retry once.
    expect(error.isTransient).toBe(true)
  })

  it('has not given up before the timeout is due', async () => {
    globalThis.fetch = hangingFetch()
    let settled = false
    void api.listInstruments().catch(() => {
      settled = true
    })
    await vi.advanceTimersByTimeAsync(3_000)
    expect(settled).toBe(false)
  })
})

describe('other failures', () => {
  it('reports an unreachable server as transient', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.reject(new TypeError('Failed to fetch')),
    ) as unknown as typeof fetch

    const error = (await api.listInstruments().catch((e: unknown) => e)) as ApiClientError
    expect(error.code).toBe('network_error')
    expect(error.isTransient).toBe(true)
  })

  it('does not mark a 404 as worth retrying — the request itself is wrong', async () => {
    globalThis.fetch = jsonFetch({ error: { code: 'not_found', message: 'Nope.' } }, 404)
    const error = (await api.listInstruments().catch((e: unknown) => e)) as ApiClientError
    expect(error.status).toBe(404)
    expect(error.isTransient).toBe(false)
  })

  it('rejects a response this build cannot parse rather than passing it on', async () => {
    // A server and a client that disagree should fail here, with a message
    // naming the endpoint — not three layers down as "undefined is not an object".
    globalThis.fetch = jsonFetch({ items: [{ id: 'x' }] })
    const error = (await api.listInstruments().catch((e: unknown) => e)) as ApiClientError
    expect(error.code).toBe('response_shape_mismatch')
  })

  it('passes a caller’s own cancellation through untouched', async () => {
    const controller = new AbortController()
    globalThis.fetch = hangingFetch()

    const pending = api.listInstruments(controller.signal).catch((e: unknown) => e)
    controller.abort()
    // Not wrapped in an ApiClientError: a deliberate cancellation is not a
    // failure to show anybody.
    expect(await pending).not.toBeInstanceOf(ApiClientError)
  })
})
