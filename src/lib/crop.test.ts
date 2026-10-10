import { describe, expect, it } from 'vitest'
import { FULL_QUAD, isFullQuad, moveCorner, rotateNormPoint, rotateQuad, toNormalized, toPixels, type Quad } from './crop'

describe('rotateNormPoint', () => {
  it('moves the top-left corner to the top-right on a clockwise turn', () => {
    expect(rotateNormPoint({ x: 0, y: 0 }, 1)).toEqual({ x: 1, y: 0 })
    expect(rotateNormPoint({ x: 1, y: 0 }, 1)).toEqual({ x: 1, y: 1 })
  })
  it('four turns are the identity; -1 is three turns', () => {
    const p = { x: 0.2, y: 0.7 }
    const r = rotateNormPoint(p, 4)
    expect(r.x).toBeCloseTo(0.2, 12)
    expect(r.y).toBeCloseTo(0.7, 12)
    expect(rotateNormPoint(p, -1)).toEqual(rotateNormPoint(p, 3))
  })
})

describe('rotateQuad', () => {
  it('keeps tl, tr, br, bl ordering after rotation', () => {
    const q: Quad = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.2 }, { x: 0.8, y: 0.9 }, { x: 0.2, y: 0.8 }]
    const r = rotateQuad(q, 1)
    // The old top-left (0.1, 0.1) is now near the top-right.
    expect(r[1].x).toBeCloseTo(0.9, 9)
    expect(r[1].y).toBeCloseTo(0.1, 9)
    expect(r[0].x).toBeLessThan(0.5)
    expect(r[0].y).toBeLessThan(0.5)
  })
})

describe('toNormalized / toPixels', () => {
  it('clamps and orders', () => {
    const q = toNormalized([{ x: 200, y: 100 }, { x: -5, y: 0 }, { x: 200, y: 0 }, { x: 0, y: 100 }], 200, 100)
    expect(q).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }])
    expect(toPixels(FULL_QUAD, 201, 101)[2]).toEqual({ x: 200, y: 100 })
  })
})

describe('moveCorner', () => {
  it('moves a corner and clamps to the image', () => {
    expect(moveCorner(FULL_QUAD, 0, { x: -1, y: 0.2 })[0]).toEqual({ x: 0, y: 0.2 })
  })
  it('refuses moves that flatten the quad (corner lands on the line between its neighbours)', () => {
    const q: Quad = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }]
    expect(moveCorner(q, 0, { x: 0.5, y: 0.5 })).toBe(q) // collinear with its neighbours
  })
  it('refuses to cross over the opposite corner', () => {
    const q: Quad = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }]
    expect(moveCorner(q, 0, { x: 0.95, y: 0.95 })).toBe(q)
  })
})

describe('isFullQuad', () => {
  it('recognises the full frame', () => {
    expect(isFullQuad(null)).toBe(true)
    expect(isFullQuad(FULL_QUAD)).toBe(true)
    expect(isFullQuad([{ x: 0.1, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }])).toBe(false)
  })
})
