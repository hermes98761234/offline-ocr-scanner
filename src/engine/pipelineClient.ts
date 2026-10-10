import type { Quad } from '../lib/crop'
import type { DetectRequest, ProcessRequest, WorkerResponse } from './pipelineTypes'

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (r: WorkerResponse) => void; reject: (e: Error) => void }>()

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../pipeline.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const p = pending.get(e.data.id)
      if (!p) return
      pending.delete(e.data.id)
      if (e.data.kind === 'error') p.reject(new Error(e.data.message))
      else p.resolve(e.data)
    }
    worker.onerror = (e) => {
      for (const p of pending.values()) p.reject(new Error(e.message || 'Image worker failed'))
      pending.clear()
      worker = null
    }
  }
  return worker
}

function call(req: Omit<ProcessRequest, 'id'> | Omit<DetectRequest, 'id'>): Promise<WorkerResponse> {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ ...req, id })
  })
}

export interface Processed {
  canvas: HTMLCanvasElement
  skew: number
}

export async function processPage(req: Omit<ProcessRequest, 'id' | 'kind'>): Promise<Processed> {
  const res = await call({ ...req, kind: 'process' })
  if (res.kind !== 'process') throw new Error('Unexpected worker reply')
  const canvas = document.createElement('canvas')
  canvas.width = res.width
  canvas.height = res.height
  const img = new ImageData(new Uint8ClampedArray(res.buffer), res.width, res.height)
  canvas.getContext('2d')!.putImageData(img, 0, 0)
  return { canvas, skew: res.skew }
}

export async function detectPage(blob: Blob, rot: number): Promise<Quad | null> {
  const res = await call({ kind: 'detect', blob, rot })
  return res.kind === 'detect' ? res.quad : null
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg', quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), type, quality))
}
