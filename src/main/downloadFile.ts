import { createWriteStream } from 'fs'
import { PassThrough, Readable } from 'stream'
import { pipeline } from 'stream/promises'

/**
 * Streams a URL to a local file, reporting progress along the way. Shared by
 * minecraftDownloader.ts and the content manager so there's exactly one copy
 * of this logic — it's easy to get subtly wrong (see the comment below) and
 * we've already shipped that bug once.
 */
export async function downloadFile(
  url: string,
  destPath: string,
  onProgress?: (downloadedBytes: number, totalBytes: number | null) => void
): Promise<void> {
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Descarga falló: HTTP ${res.status}`)
  const totalBytes = Number(res.headers.get('content-length')) || null

  let downloaded = 0
  const nodeStream = Readable.fromWeb(res.body as unknown as import('stream/web').ReadableStream)
  // Track progress as a stage *inside* the pipeline rather than a separate
  // `.on('data', ...)` on the source stream — attaching a data listener puts a
  // Node stream into flowing mode immediately, before pipeline() gets a chance
  // to start reading it, so any chunks that arrive in that gap are consumed by
  // the listener and never reach the write stream. That silently
  // truncated/corrupted downloaded jars (bad zip, hash mismatch on retry).
  const progress = new PassThrough()
  progress.on('data', (chunk: Buffer) => {
    downloaded += chunk.length
    onProgress?.(downloaded, totalBytes)
  })

  await pipeline(nodeStream, progress, createWriteStream(destPath))
}
