/** Flattening and summarising tesseract.js results. */

export interface Bbox {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface WordBox {
  text: string
  confidence: number
  bbox: Bbox
  line: number
}

/** The subset of tesseract.js's Page we rely on. */
export interface RawPage {
  text: string
  confidence: number
  blocks?: {
    paragraphs: { lines: { words: { text: string; confidence: number; bbox: Bbox }[] }[] }[]
  }[] | null
}

export function extractWords(page: RawPage): WordBox[] {
  const out: WordBox[] = []
  let line = 0
  for (const b of page.blocks ?? [])
    for (const p of b.paragraphs)
      for (const l of p.lines) {
        for (const w of l.words) if (w.text.trim()) out.push({ text: w.text, confidence: w.confidence, bbox: w.bbox, line })
        line++
      }
  return out
}

/** Mean word confidence weighted by word length; 0 when there are no words. */
export function meanConfidence(words: readonly WordBox[]): number {
  let sum = 0
  let n = 0
  for (const w of words) {
    const len = w.text.length
    sum += w.confidence * len
    n += len
  }
  return n ? sum / n : 0
}

export type ConfidenceLevel = 'high' | 'medium' | 'low'

export function confidenceLevel(c: number): ConfidenceLevel {
  return c >= 80 ? 'high' : c >= 60 ? 'medium' : 'low'
}

/** Index of the topmost word box containing (x, y), or -1. Later (smaller) boxes win ties. */
export function wordAt(words: readonly WordBox[], x: number, y: number): number {
  let hit = -1
  let area = Infinity
  words.forEach((w, i) => {
    const { x0, y0, x1, y1 } = w.bbox
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1) {
      const a = (x1 - x0) * (y1 - y0)
      if (a <= area) {
        area = a
        hit = i
      }
    }
  })
  return hit
}
