import { describe, expect, it } from 'vitest'
import { confidenceLevel, extractWords, meanConfidence, wordAt, type RawPage } from './ocrdata'

const bb = (x0: number, y0: number, x1: number, y1: number) => ({ x0, y0, x1, y1 })
const page: RawPage = {
  text: 'Hello world\nfoo',
  confidence: 90,
  blocks: [
    {
      paragraphs: [
        {
          lines: [
            { words: [{ text: 'Hello', confidence: 96, bbox: bb(0, 0, 50, 20) }, { text: 'world', confidence: 80, bbox: bb(60, 0, 110, 20) }] },
            { words: [{ text: 'foo', confidence: 50, bbox: bb(0, 30, 30, 50) }, { text: ' ', confidence: 0, bbox: bb(30, 30, 31, 50) }] },
          ],
        },
      ],
    },
  ],
}

describe('extractWords', () => {
  it('flattens blocks, skips blank words and numbers lines', () => {
    const w = extractWords(page)
    expect(w.map((x) => x.text)).toEqual(['Hello', 'world', 'foo'])
    expect(w.map((x) => x.line)).toEqual([0, 0, 1])
  })
  it('copes with missing blocks', () => {
    expect(extractWords({ text: '', confidence: 0, blocks: null })).toEqual([])
  })
})

describe('meanConfidence', () => {
  it('weights by word length', () => {
    // (96*5 + 80*5 + 50*3) / 13
    expect(meanConfidence(extractWords(page))).toBeCloseTo((480 + 400 + 150) / 13, 9)
    expect(meanConfidence([])).toBe(0)
  })
})

describe('confidenceLevel', () => {
  it('buckets at 80 and 60', () => {
    expect([confidenceLevel(95), confidenceLevel(80), confidenceLevel(79.9), confidenceLevel(60), confidenceLevel(10)]).toEqual(['high', 'high', 'medium', 'medium', 'low'])
  })
})

describe('wordAt', () => {
  it('hit-tests word boxes', () => {
    const w = extractWords(page)
    expect(wordAt(w, 10, 10)).toBe(0)
    expect(wordAt(w, 70, 5)).toBe(1)
    expect(wordAt(w, 55, 5)).toBe(-1)
  })
})
