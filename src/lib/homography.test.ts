import { describe, expect, it } from 'vitest'
import {
  applyHomography, homographyFromPoints, invertMat3, isConvexQuad, orderCorners, polygonArea, quadSize, solveLinear,
  warpPerspective, type Img, type Pt,
} from './homography'

const close = (a: Pt, b: Pt) => {
  expect(a.x).toBeCloseTo(b.x, 6)
  expect(a.y).toBeCloseTo(b.y, 6)
}
const unit: Pt[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]

describe('solveLinear', () => {
  it('solves a 3x3 system', () => {
    // 2x + y - z = 8; -3x - y + 2z = -11; -2x + y + 2z = -3  ->  (2, 3, -1)
    const x = solveLinear([[2, 1, -1], [-3, -1, 2], [-2, 1, 2]], [8, -11, -3])!
    expect(x[0]).toBeCloseTo(2, 9)
    expect(x[1]).toBeCloseTo(3, 9)
    expect(x[2]).toBeCloseTo(-1, 9)
  })
  it('returns null for a singular system', () => {
    expect(solveLinear([[1, 2], [2, 4]], [1, 2])).toBeNull()
  })
})

describe('homographyFromPoints', () => {
  it('is the identity for identical point sets', () => {
    const H = homographyFromPoints(unit, unit)!
    const id = [1, 0, 0, 0, 1, 0, 0, 0, 1]
    H.forEach((v, i) => expect(v).toBeCloseTo(id[i], 9))
  })
  it('recovers a pure translation and scale', () => {
    const dst = unit.map((p) => ({ x: 2 * p.x + 5, y: 3 * p.y - 1 }))
    const H = homographyFromPoints(unit, dst)!
    close(applyHomography(H, { x: 0.5, y: 0.5 }), { x: 6, y: 0.5 })
  })
  it('maps each source corner onto its destination (projective case)', () => {
    const dst: Pt[] = [{ x: 10, y: 20 }, { x: 110, y: 5 }, { x: 140, y: 130 }, { x: -5, y: 100 }]
    const H = homographyFromPoints(unit, dst)!
    unit.forEach((p, i) => close(applyHomography(H, p), dst[i]))
  })
  it('matches the textbook example (unit square to a trapezoid)', () => {
    // (0,0)->(0,0) (1,0)->(2,0) (1,1)->(2,1) (0,1)->(0,1) is affine; check the centre
    const dst: Pt[] = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 1 }]
    close(applyHomography(homographyFromPoints(unit, dst)!, { x: 0.5, y: 0.5 }), { x: 1, y: 0.5 })
    // A square onto a trapezoid with top width 2 and bottom width 4. Homographies map lines to lines,
    // so the square's centre (where its diagonals cross) lands where the trapezoid's diagonals cross.
    const trap: Pt[] = [{ x: 1, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 2 }, { x: 0, y: 2 }]
    const H = homographyFromPoints(unit, trap)!
    const c = applyHomography(H, { x: 0.5, y: 0.5 })
    // Diagonals of a trapezoid cross at height * top / (top + bottom) below the top side.
    expect(c.y).toBeCloseTo(2 * (2 / 6), 9)
    expect(c.x).toBeCloseTo(2, 9)
  })
  it('rejects collinear points', () => {
    const line: Pt[] = [0, 1, 2, 3].map((i) => ({ x: i, y: i }))
    expect(homographyFromPoints(unit, line)).toBeNull()
  })
})

describe('invertMat3', () => {
  it('round-trips points', () => {
    const dst: Pt[] = [{ x: 10, y: 20 }, { x: 110, y: 5 }, { x: 140, y: 130 }, { x: -5, y: 100 }]
    const H = homographyFromPoints(unit, dst)!
    const Hi = invertMat3(H)!
    const p = { x: 0.3, y: 0.8 }
    close(applyHomography(Hi, applyHomography(H, p)), p)
  })
  it('returns null for a singular matrix', () => {
    expect(invertMat3([1, 2, 3, 2, 4, 6, 0, 0, 1])).toBeNull()
  })
})

describe('quad helpers', () => {
  const scrambled: Pt[] = [{ x: 90, y: 80 }, { x: 10, y: 12 }, { x: 8, y: 85 }, { x: 95, y: 10 }]
  it('orders corners tl, tr, br, bl', () => {
    const [tl, tr, br, bl] = orderCorners(scrambled)
    expect(tl).toEqual({ x: 10, y: 12 })
    expect(tr).toEqual({ x: 95, y: 10 })
    expect(br).toEqual({ x: 90, y: 80 })
    expect(bl).toEqual({ x: 8, y: 85 })
  })
  it('measures size and area', () => {
    const rect: Pt[] = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 40 }, { x: 0, y: 40 }]
    expect(quadSize(rect)).toEqual({ width: 30, height: 40 })
    expect(polygonArea(rect)).toBe(1200)
  })
  it('detects non-convex (bow-tie / concave) quads', () => {
    expect(isConvexQuad(unit)).toBe(true)
    expect(isConvexQuad([unit[0], unit[2], unit[1], unit[3]])).toBe(false)
    expect(isConvexQuad([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 4 }])).toBe(false)
  })
})

describe('warpPerspective', () => {
  /** 100x100 image: pixel value encodes x in R, y in G. */
  const gradient = (w: number, h: number): Img => {
    const data = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set([x, y, 0, 255], (y * w + x) * 4)
    return { data, width: w, height: h }
  }
  it('crops an axis-aligned rectangle exactly', () => {
    const out = warpPerspective(gradient(100, 100), [{ x: 20, y: 30 }, { x: 60, y: 30 }, { x: 60, y: 70 }, { x: 20, y: 70 }])
    expect(out.width).toBe(40)
    expect(out.height).toBe(40)
    const px = (x: number, y: number) => [...out.data.slice((y * out.width + x) * 4, (y * out.width + x) * 4 + 2)]
    // The destination spans the quad corner to corner, so (0,0) -> (20,30) and (39,39) -> (60,70).
    expect(px(0, 0)).toEqual([20, 30])
    expect(px(39, 39)).toEqual([60, 70])
    expect(px(20, 10)[0]).toBeGreaterThanOrEqual(40)
  })
  it('un-skews a trapezoid: a pixel on the left edge stays on the left edge', () => {
    const quad: Pt[] = [{ x: 30, y: 10 }, { x: 70, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 }]
    const out = warpPerspective(gradient(100, 100), quad, 50, 80)
    expect(out.width).toBe(50)
    const at = (x: number, y: number) => out.data[(y * 50 + x) * 4]
    expect(at(0, 0)).toBe(30)
    expect(at(49, 0)).toBe(70)
    expect(at(0, 79)).toBe(10)
    expect(at(49, 79)).toBe(90)
    // Perspective: the far (narrow) end is compressed, so the middle output row maps nearer the top of the left edge.
    expect(at(0, 40)).toBeGreaterThan(20)
    expect(at(0, 40)).toBeLessThan(30)
  })
})
