import type { Filter } from '../lib/imageops'
import type { Quad } from '../lib/crop'

export interface ProcessRequest {
  id: number
  kind: 'process'
  blob: Blob
  /** Clockwise quarter turns. */
  rot: number
  /** Normalised crop quad in the rotated frame, or null for the whole image. */
  quad: Quad | null
  /** Manual skew in degrees, or null to estimate it (when `autoDeskew`). */
  skew: number | null
  autoDeskew: boolean
  filter: Filter
  /** Longest side of the output, never upscaled. */
  maxSide: number
}

export interface DetectRequest {
  id: number
  kind: 'detect'
  blob: Blob
  rot: number
}

export type WorkerRequest = ProcessRequest | DetectRequest

export type WorkerResponse =
  | { id: number; kind: 'process'; buffer: ArrayBuffer; width: number; height: number; skew: number }
  | { id: number; kind: 'detect'; quad: Quad | null }
  | { id: number; kind: 'error'; message: string }
