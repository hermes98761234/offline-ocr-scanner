import { canvasToBlob } from './pipelineClient'

export const MAX_SOURCE_SIDE = 4000

export interface LoadedImage {
  blob: Blob
  width: number
  height: number
  thumb: string
}

/** Decodes any browser-supported image (honouring EXIF orientation), caps its size and re-encodes as JPEG. */
export async function loadImage(source: Blob): Promise<LoadedImage> {
  const bmp = await createImageBitmap(source, { imageOrientation: 'from-image' })
  try {
    return await fromBitmap(bmp)
  } finally {
    bmp.close()
  }
}

export async function fromCanvas(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<LoadedImage> {
  const bmp = await createImageBitmap(canvas)
  try {
    return await fromBitmap(bmp)
  } finally {
    bmp.close()
  }
}

async function fromBitmap(bmp: ImageBitmap): Promise<LoadedImage> {
  const scale = Math.min(1, MAX_SOURCE_SIDE / Math.max(bmp.width, bmp.height))
  const width = Math.max(1, Math.round(bmp.width * scale))
  const height = Math.max(1, Math.round(bmp.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bmp, 0, 0, width, height)
  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92)
  const ts = Math.min(1, 160 / Math.max(width, height))
  const thumb = document.createElement('canvas')
  thumb.width = Math.max(1, Math.round(width * ts))
  thumb.height = Math.max(1, Math.round(height * ts))
  thumb.getContext('2d')!.drawImage(canvas, 0, 0, thumb.width, thumb.height)
  return { blob, width, height, thumb: URL.createObjectURL(await canvasToBlob(thumb, 'image/jpeg', 0.8)) }
}

/** Renders every page of a PDF to an image (pdf.js is loaded on demand). */
export async function loadPdf(file: Blob, onPage: (img: LoadedImage, index: number, total: number) => void): Promise<void> {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const doc = await task.promise
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const base = page.getViewport({ scale: 1 })
      // Target ~300 dpi for a typical page (72 dpi base), capped by the maximum source size.
      const scale = Math.min(300 / 72, MAX_SOURCE_SIDE / Math.max(base.width, base.height))
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      await page.render({ canvas, viewport }).promise
      onPage(await fromCanvas(canvas), i, doc.numPages)
      page.cleanup()
    }
  } finally {
    await task.destroy()
  }
}

export function download(data: Blob | Uint8Array, name: string, type = 'application/octet-stream'): void {
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
