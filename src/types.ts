import type { Quad } from './lib/crop'
import type { WordBox } from './lib/ocrdata'

export interface PageResult {
  /** Editable text (starts as the cleaned OCR output). */
  text: string
  words: WordBox[]
  confidence: number
  /** Object URL of the processed image the OCR ran on; word boxes are in its pixel coordinates. */
  imageUrl: string
  imgW: number
  imgH: number
  pdf: Uint8Array | null
  langs: string[]
  skew: number
}

export type PageStatus = 'idle' | 'working' | 'done' | 'error'

export interface Page {
  id: string
  name: string
  /** Source image (JPEG, capped in size). */
  blob: Blob
  width: number
  height: number
  thumb: string
  /** Clockwise quarter turns. */
  rot: number
  /** Crop quad (normalised, in the rotated frame); null = no crop. */
  quad: Quad | null
  /** Manual skew in degrees; null = automatic. */
  skew: number | null
  status: PageStatus
  progress: number
  statusText: string
  error?: string
  result?: PageResult
}
