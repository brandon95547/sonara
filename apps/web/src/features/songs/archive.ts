import { unzipSync, strFromU8 } from 'fflate'

/**
 * Getting the score out of the two formats that are really zip files.
 *
 * `.mxl` is compressed MusicXML and `.mscz` is a MuseScore project; both are
 * ordinary zips with the actual document inside. MuseScore saves as `.mscz` by
 * default and exports MusicXML as `.mxl` by default, so between them they are
 * what most people will actually have on disk — the uncompressed forms are the
 * ones you have to go out of your way to produce.
 */

export interface ArchiveEntry {
  readonly name: string
  readonly text: string
}

function open(bytes: Uint8Array): Record<string, Uint8Array> | null {
  try {
    return unzipSync(bytes)
  } catch {
    return null
  }
}

/**
 * The score document inside a `.mxl`.
 *
 * The spec puts a pointer in `META-INF/container.xml` rather than fixing a
 * filename, because the archive may hold several scores and any number of other
 * things. Following the pointer is the correct read; the fallback is for files
 * written by tools that skipped the manifest.
 */
export function readMxl(bytes: Uint8Array): ArchiveEntry | null {
  const zip = open(bytes)
  if (!zip) return null

  const container = zip['META-INF/container.xml']
  const pointed = container ? /full-path="([^"]+)"/.exec(strFromU8(container))?.[1] : undefined

  const name =
    (pointed && zip[pointed] ? pointed : undefined) ??
    Object.keys(zip).find(
      (entry) => !entry.startsWith('META-INF/') && /\.(musicxml|xml)$/i.test(entry),
    )

  const file = name ? zip[name] : undefined
  return file && name ? { name, text: strFromU8(file) } : null
}

/**
 * The score document inside a `.mscz`.
 *
 * MuseScore's own XML, not MusicXML — a different format that happens to live
 * in a similarly shaped box. Newer versions add a `.mscx` alongside thumbnails
 * and audio settings, so the extension is what identifies it rather than the
 * position.
 */
export function readMscz(bytes: Uint8Array): ArchiveEntry | null {
  const zip = open(bytes)
  if (!zip) return null

  const name = Object.keys(zip).find(
    (entry) => /\.mscx$/i.test(entry) && !entry.startsWith('META-INF/'),
  )
  const file = name ? zip[name] : undefined
  return file && name ? { name, text: strFromU8(file) } : null
}

/** True for anything that is a zip, whatever it turns out to hold. */
export const isZip = (bytes: Uint8Array): boolean => bytes[0] === 0x50 && bytes[1] === 0x4b
