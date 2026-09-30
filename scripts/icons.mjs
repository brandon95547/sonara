#!/usr/bin/env node
/**
 * Renders the raster icons from the two SVGs they come from, so a new logo is
 * one command rather than an afternoon in an image editor:
 *
 *   public/favicon.svg        → public/favicon.ico (16, 32 and 48px)
 *   src/assets/sonara-logo.svg → public/apple-touch-icon.png (180px)
 *
 * favicon.svg is drawn by hand for tab size and is not generated: a logo
 * scaled down to 16px loses whatever is under a pixel, and which parts those
 * are is a design call, not a resize. Redraw it for a new logo, then run this.
 *
 * The .ico is what browsers without SVG favicons use, and what every browser
 * requests at /favicon.ico whatever the page links. The touch icon is the
 * home-screen tile on iOS, which does not take SVG and does its own rounding,
 * so it is square, opaque and has the mark inset from the corners.
 *
 * Rendering goes through a real Chrome over the DevTools Protocol, as
 * verify-audio does, so the pixels are the ones a browser draws.
 *
 *   npm run icons
 */
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const WEB = fileURLToPath(new URL('../apps/web/', import.meta.url))
const PORT = 9222 + Math.floor(Math.random() * 500)
const CHROME = process.env.CHROME_BIN ?? 'google-chrome'
const CANVAS = '#101010'

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
    `--user-data-dir=/tmp/sonara-icons-${PORT}`,
    'about:blank',
  ],
  { stdio: 'ignore', detached: true },
)

try {
  const ws = new WebSocket(await devtoolsUrl())
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })

  let nextId = 0
  const pending = new Map()
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result)
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
  // Transparent, so the favicon's own disc is the only thing that is painted.
  await send(
    'Emulation.setDefaultBackgroundColorOverride',
    { color: { r: 0, g: 0, b: 0, a: 0 } },
    sessionId,
  )

  /** One PNG of `svg` at `size` px, drawn at 1:1 so nothing is resampled after. */
  const render = async (svg, size, { background = 'transparent', inset = 0 } = {}) => {
    const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
    const mark = size - inset * 2
    const html = `<body style="margin:0;background:${background}">
      <img src="${src}" style="display:block;margin:${inset}px;width:${mark}px;height:${mark}px"></body>`
    await send(
      'Emulation.setDeviceMetricsOverride',
      { width: size, height: size, deviceScaleFactor: 1, mobile: false },
      sessionId,
    )
    await send(
      'Page.navigate',
      { url: `data:text/html;base64,${Buffer.from(html).toString('base64')}` },
      sessionId,
    )
    await wait(400)
    const { data } = await send(
      'Page.captureScreenshot',
      { format: 'png', clip: { x: 0, y: 0, width: size, height: size, scale: 1 } },
      sessionId,
    )
    return Buffer.from(data, 'base64')
  }

  const favicon = readFileSync(`${WEB}public/favicon.svg`, 'utf8')
  const logo = readFileSync(`${WEB}src/assets/sonara-logo.svg`, 'utf8')

  const sizes = [16, 32, 48]
  const pngs = []
  for (const size of sizes) pngs.push(await render(favicon, size))
  writeFileSync(`${WEB}public/favicon.ico`, ico(sizes, pngs))

  // 180 is the size every current iPhone and iPad asks for. The mark sits at
  // about 70%, clear of the corner rounding iOS applies.
  writeFileSync(
    `${WEB}public/apple-touch-icon.png`,
    await render(logo, 180, { background: CANVAS, inset: 27 }),
  )

  console.log('\n  Wrote public/favicon.ico (16, 32, 48) and public/apple-touch-icon.png (180).\n')
  ws.close()
} finally {
  try {
    process.kill(-chrome.pid, 'SIGKILL')
  } catch {
    // Already gone.
  }
}

/**
 * An .ico holding PNG images: a 6-byte header, a 16-byte entry per image, then
 * the PNGs as they are. Every browser that reads .ico reads PNG entries.
 */
function ico(sizes, pngs) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2) // 1 = icon
  header.writeUInt16LE(pngs.length, 4)
  let offset = 6 + 16 * pngs.length
  const entries = pngs.map((png, index) => {
    const entry = Buffer.alloc(16)
    const size = sizes[index]
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt8(0, 2) // no palette
    entry.writeUInt8(0, 3)
    entry.writeUInt16LE(1, 4) // colour planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += png.length
    return entry
  })
  return Buffer.concat([header, ...entries, ...pngs])
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
