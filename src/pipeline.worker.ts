/// Image pre-processing off the main thread: rotate, perspective-crop, deskew, filter.
import { toNormalized, toPixels } from './lib/crop'
import { warpPerspective, type Img } from './lib/homography'
import { applyFilter, detectDocument, downscale, estimateSkew, rotate90, rotateImage } from './lib/imageops'
import type { WorkerRequest, WorkerResponse } from './engine/pipelineTypes'

async function decode(blob: Blob, maxSide: number): Promise<Img> {
  const bmp = await createImageBitmap(blob)
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * scale))
  const h = Math.max(1, Math.round(bmp.height * scale))
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  const d = ctx.getImageData(0, 0, w, h)
  return { data: d.data, width: w, height: h }
}

function post(msg: WorkerResponse, transfer: Transferable[] = []) {
  ;(self as unknown as { postMessage(m: unknown, t: Transferable[]): void }).postMessage(msg, transfer)
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data
  try {
    if (req.kind === 'detect') {
      const img = rotate90(await decode(req.blob, 1600), req.rot)
      const q = detectDocument(img)
      post({ id: req.id, kind: 'detect', quad: q ? toNormalized(q, img.width, img.height) : null })
      return
    }
    let img = rotate90(await decode(req.blob, req.maxSide * 1.6), req.rot)
    if (req.quad) img = warpPerspective(img, toPixels(req.quad, img.width, img.height))
    img = downscale(img, req.maxSide).img
    const angle = req.skew ?? (req.autoDeskew ? estimateSkew(img) : 0)
    if (Math.abs(angle) >= 0.2) img = rotateImage(img, -angle)
    img = applyFilter(img, req.filter)
    const buffer = img.data.buffer as ArrayBuffer
    post({ id: req.id, kind: 'process', buffer, width: img.width, height: img.height, skew: angle }, [buffer])
  } catch (err) {
    post({ id: req.id, kind: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
