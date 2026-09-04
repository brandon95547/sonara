#!/usr/bin/env node
/**
 * Proves that clicking an on-screen key actually makes a sound.
 *
 * A silent app and a working one are identical in the DOM: the key lights up
 * either way, the store updates either way, and every unit test passes either
 * way. The only honest check is to measure the signal reaching the output.
 *
 * So this drives a real Chrome over the DevTools Protocol (no Puppeteer — Node's
 * built-in WebSocket is enough), taps every connection into `ctx.destination`
 * with an AnalyserNode, clicks middle C, and reads the RMS.
 *
 * Deliberately does NOT pass --autoplay-policy=no-user-gesture-required. The
 * browser's real policy is part of what is being tested: a page loads with its
 * AudioContext suspended, and the click on a piano key has to both unlock the
 * audio and play the note. Relaxing the policy would hide exactly that bug.
 *
 *   npm run dev            # in another terminal
 *   npm run verify:audio
 */
import { spawn } from 'node:child_process'

const APP_URL = process.argv[2] ?? 'http://localhost:5174/'
const PORT = 9222 + Math.floor(Math.random() * 500)
const CHROME = process.env.CHROME_BIN ?? 'google-chrome'

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    // Without this Chrome can block on the system keyring and never start.
    '--password-store=basic',
    '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=/tmp/sonara-verify-audio-${PORT}`,
    'about:blank',
  ],
  { stdio: 'ignore', detached: true },
)

const fail = (message) => {
  console.error(`\n  FAIL  ${message}\n`)
  process.exitCode = 1
}

try {
  const ws = new WebSocket(await devtoolsUrl())
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })

  let nextId = 0
  const pending = new Map()
  const consoleLines = []
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result)
    } else if (message.method === 'Runtime.exceptionThrown') {
      consoleLines.push(
        `uncaught: ${message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text}`,
      )
    }
  }
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++nextId
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params, sessionId }))
    })

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  await send('Page.enable', {}, sessionId)
  await send('Runtime.enable', {}, sessionId)
  await send(
    'Emulation.setDeviceMetricsOverride',
    { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false },
    sessionId,
  )

  // The tap, installed before any app code runs. Subclassing AudioContext keeps
  // `instanceof` and the prototype chain intact, which a plain function wrapper
  // does not.
  await send(
    'Page.addScriptToEvaluateOnNewDocument',
    {
      source: `
        window.__audio = { contexts: [], analysers: [] };
        const RealContext = window.AudioContext;
        const realConnect = AudioNode.prototype.connect;
        AudioNode.prototype.connect = function (target, ...rest) {
          try {
            if (this.context && target === this.context.destination && this.context.__tap) {
              realConnect.call(this, this.context.__tap);
            }
          } catch {}
          return realConnect.call(this, target, ...rest);
        };
        class TappedAudioContext extends RealContext {
          constructor(...args) {
            super(...args);
            const analyser = this.createAnalyser();
            analyser.fftSize = 2048;
            this.__tap = analyser;
            window.__audio.contexts.push(this);
            window.__audio.analysers.push(analyser);
          }
        }
        window.AudioContext = TappedAudioContext;
        window.webkitAudioContext = TappedAudioContext;
        window.__rms = () => Math.max(0, ...window.__audio.analysers.map((analyser) => {
          const samples = new Float32Array(analyser.fftSize);
          analyser.getFloatTimeDomainData(samples);
          let sum = 0;
          for (const sample of samples) sum += sample * sample;
          return Math.sqrt(sum / samples.length);
        }));
      `,
    },
    sessionId,
  )

  await send('Page.navigate', { url: APP_URL }, sessionId)
  await wait(5000)

  const evaluate = async (expression) => {
    const result = await send(
      'Runtime.evaluate',
      { expression, returnByValue: true, awaitPromise: true },
      sessionId,
    )
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ?? result.exceptionDetails.text,
      )
    }
    return result.result?.value
  }
  const mouse = (type, x, y) =>
    send(
      'Input.dispatchMouseEvent',
      { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 },
      sessionId,
    )

  const loaded = await evaluate(`document.querySelectorAll('.piano-key').length`)
  if (loaded === 0) {
    fail('no keys rendered — is the app running, and can it reach the API?')
    throw new Error('nothing to click')
  }

  const before = await evaluate(
    `({ contexts: window.__audio.contexts.length, state: window.__audio.contexts[0]?.state ?? null })`,
  )
  console.log(`  keys rendered      ${loaded}`)
  console.log(`  audio contexts     ${before.contexts} (${before.state})`)

  const key = await evaluate(`
    (() => {
      const el = document.querySelector('.piano-key[data-note="60"]');
      const box = el.getBoundingClientRect();
      return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height * 0.7) };
    })()`)

  await mouse('mousePressed', key.x, key.y)
  await wait(350)
  const held = await evaluate(
    `({ rms: window.__rms(), state: window.__audio.contexts[0]?.state ?? null, lit: !!document.querySelector('.piano-key[data-note="60"][data-active="true"]') })`,
  )
  await mouse('mouseReleased', key.x, key.y)
  await wait(1200)
  const after = await evaluate(`window.__rms()`)

  console.log(`  context after click ${held.state}`)
  console.log(`  key lit            ${held.lit}`)
  console.log(`  RMS while held     ${held.rms.toFixed(5)}`)
  console.log(`  RMS after release  ${after.toFixed(5)}`)

  if (!held.lit) fail('the key did not light up')
  if (held.state !== 'running')
    fail(`AudioContext is "${held.state}" — the click did not unlock it`)
  // Well above the noise floor of an idle analyser, well below a clipped signal.
  if (!(held.rms > 0.001)) fail(`no signal reached the output (RMS ${held.rms})`)
  if (!(after < held.rms)) fail('the note never decayed after release')

  for (const line of consoleLines) console.error(`  page: ${line}`)
  if (process.exitCode !== 1) console.log('\n  PASS  clicking a key produces sound.\n')

  ws.close()
} finally {
  try {
    process.kill(-chrome.pid, 'SIGKILL')
  } catch {
    // Already gone.
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function devtoolsUrl() {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      if (response.ok) return (await response.json()).webSocketDebuggerUrl
    } catch {
      // Chrome is still starting.
    }
    await wait(250)
  }
  throw new Error(`Chrome never opened a debugging port. Is ${CHROME} installed?`)
}
