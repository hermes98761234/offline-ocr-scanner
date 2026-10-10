import { describe, expect, it } from 'vitest'
import type { Img } from './homography'
import {
  adaptiveThreshold, applyFilter, boxBlur, detectDocument, downscale, estimateSkew, globalThreshold, grayToImg, otsuThreshold,
  rotate90, rotateImage, stretchContrast, toGray,
} from './imageops'

const solid = (w: number, h: number, v: number): Img => grayToImg(new Uint8ClampedArray(w * h).fill(v), w, h)
const setPx = (img: Img, x: number, y: number, v: number) => img.data.set([v, v, v, 255], (y * img.width + x) * 4)

describe('toGray', () => {
  it('uses Rec. 601 weights', () => {
    const img: Img = { data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]), width: 4, height: 1 }
    expect([...toGray(img)]).toEqual([76, 150, 29, 255])
  })
})

describe('otsuThreshold / globalThreshold', () => {
  it('splits a bimodal histogram between the modes', () => {
    const g = new Uint8ClampedArray(200)
    g.fill(40, 0, 100)
    g.fill(200, 100)
    const t = otsuThreshold(g)
    expect(t).toBeGreaterThanOrEqual(40)
    expect(t).toBeLessThan(200)
    const bw = globalThreshold(g, t)
    expect(bw[0]).toBe(0)
    expect(bw[199]).toBe(255)
  })
  it('puts values equal to the threshold in the dark class', () => {
    expect([...globalThreshold(Uint8ClampedArray.from([99, 100, 101]), 100)]).toEqual([0, 0, 255])
  })
})

describe('adaptiveThreshold', () => {
  it('keeps text visible under a brightness gradient where a global threshold fails', () => {
    const w = 120
    const h = 40
    const g = new Uint8ClampedArray(w * h)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = 90 + x // background 90..209
    // Dark strokes: 40 darker than the local background, at both the dim and the bright end.
    for (const sx of [10, 100]) for (let y = 10; y < 30; y++) for (let x = sx; x < sx + 3; x++) g[y * w + x] -= 60
    const bw = adaptiveThreshold(g, w, h, 12, 12)
    expect(bw[20 * w + 11]).toBe(0)
    expect(bw[20 * w + 101]).toBe(0)
    expect(bw[20 * w + 50]).toBe(255)
    expect(bw[2 * w + 100]).toBe(255)
    // A single global threshold cannot isolate both strokes.
    const bwGlobal = globalThreshold(g, otsuThreshold(g))
    expect(bwGlobal[20 * w + 11] === 0 && bwGlobal[20 * w + 101] === 0 && bwGlobal[20 * w + 50] === 255 && bwGlobal[20 * w + 70] === 255).toBe(false)
  })
  it('turns a flat image white (no false edges)', () => {
    expect(adaptiveThreshold(new Uint8ClampedArray(100).fill(128), 10, 10, 3, 10).every((v) => v === 255)).toBe(true)
  })
})

describe('stretchContrast', () => {
  it('maps the percentiles to the full range', () => {
    const g = Uint8ClampedArray.from({ length: 100 }, (_, i) => 100 + i / 2) // 100..149
    const out = stretchContrast(g, 0, 100)
    expect(out[0]).toBe(0)
    expect(out[99]).toBe(255)
  })
  it('leaves a flat image untouched', () => {
    expect([...stretchContrast(new Uint8ClampedArray(5).fill(77))]).toEqual([77, 77, 77, 77, 77])
  })
})

describe('boxBlur', () => {
  it('preserves constant images and spreads an impulse', () => {
    expect(boxBlur(new Uint8ClampedArray(25).fill(90), 5, 5, 1).every((v) => v === 90)).toBe(true)
    const g = new Uint8ClampedArray(25)
    g[12] = 90
    const out = boxBlur(g, 5, 5, 1)
    expect(out[12]).toBe(10)
    expect(out[6]).toBe(10)
    expect(out[0]).toBe(0)
  })
})

describe('downscale', () => {
  it('averages blocks', () => {
    const img = solid(4, 4, 0)
    setPx(img, 0, 0, 200)
    setPx(img, 1, 0, 200)
    setPx(img, 0, 1, 200)
    setPx(img, 1, 1, 200)
    const { img: s, scale } = downscale(img, 2)
    expect(scale).toBe(0.5)
    expect(s.width).toBe(2)
    expect(s.data[0]).toBe(200)
    expect(s.data[4]).toBe(0)
  })
})

describe('rotate90', () => {
  const img = solid(3, 2, 0)
  setPx(img, 0, 0, 10) // top-left
  setPx(img, 2, 0, 20) // top-right
  it('moves the top-left pixel to the top-right on a clockwise turn', () => {
    const r = rotate90(img, 1)
    expect([r.width, r.height]).toEqual([2, 3])
    expect(r.data[1 * 4]).toBe(10)
    expect(r.data[(2 * 2 + 1) * 4]).toBe(20) // top-right goes to bottom-right
  })
  it('four turns are the identity and -1 equals 3', () => {
    expect(rotate90(rotate90(rotate90(rotate90(img, 1), 1), 1), 1).data).toEqual(img.data)
    expect(rotate90(img, -1).data).toEqual(rotate90(img, 3).data)
    expect(rotate90(img, 2).data[(1 * 3 + 2) * 4]).toBe(10)
  })
})

describe('rotateImage', () => {
  it('grows the canvas to fit a 45 degree rotation', () => {
    const r = rotateImage(solid(100, 100, 0), 45)
    expect(r.width).toBe(Math.ceil(100 * Math.SQRT2))
  })
  it('matches rotate90 for 90 degrees', () => {
    const img = solid(5, 3, 255)
    setPx(img, 0, 0, 0)
    const a = rotateImage(img, 90)
    const b = rotate90(img, 1)
    expect([a.width, a.height]).toEqual([b.width, b.height])
    expect(a.data[(a.width - 1) * 4]).toBeLessThan(5)
  })
})

/** Text-like image: black horizontal bars (lines of text) on white, rotated by `deg` clockwise. */
function textLines(deg: number): Img {
  const img = solid(400, 300, 255)
  for (let line = 0; line < 8; line++) for (let y = 30 + line * 30; y < 40 + line * 30; y++) for (let x = 40; x < 360; x++) if ((x >> 2) % 3) setPx(img, x, y, 0)
  return rotateImage(img, deg)
}

describe('estimateSkew', () => {
  it('is ~0 for straight text', () => {
    expect(Math.abs(estimateSkew(textLines(0)))).toBeLessThanOrEqual(0.3)
  })
  it.each([4, -6.5, 10])('recovers a %f degree skew', (deg) => {
    expect(estimateSkew(textLines(deg))).toBeCloseTo(deg, 0)
  })
  it('deskewing with the estimate straightens the page', () => {
    const skewed = textLines(5)
    const fixed = rotateImage(skewed, -estimateSkew(skewed))
    expect(Math.abs(estimateSkew(fixed))).toBeLessThanOrEqual(0.5)
  })
})

describe('detectDocument', () => {
  it('finds a bright sheet on a dark table', () => {
    const img = solid(300, 200, 30)
    for (let y = 40; y < 170; y++) for (let x = 60; x < 250; x++) setPx(img, x, y, 235)
    const q = detectDocument(img)!
    expect(q).not.toBeNull()
    const tol = 6
    expect(Math.abs(q[0].x - 60)).toBeLessThan(tol)
    expect(Math.abs(q[0].y - 40)).toBeLessThan(tol)
    expect(Math.abs(q[2].x - 250)).toBeLessThan(tol)
    expect(Math.abs(q[2].y - 170)).toBeLessThan(tol)
  })
  it('finds a rotated sheet', () => {
    const base = solid(300, 300, 30)
    for (let y = 50; y < 250; y++) for (let x = 60; x < 240; x++) setPx(base, x, y, 235)
    const q = detectDocument(rotateImage(base, 20, 30))!
    expect(q).not.toBeNull()
    expect(new Set(q.map((p) => `${Math.round(p.x / 10)}:${Math.round(p.y / 10)}`)).size).toBe(4)
  })
  it('returns null for a uniform frame', () => {
    expect(detectDocument(solid(200, 150, 200))).toBeNull()
  })
})

describe('applyFilter', () => {
  it('none returns the same image; threshold output is strictly black/white', () => {
    const img = solid(40, 40, 180)
    expect(applyFilter(img, 'none')).toBe(img)
    for (let x = 5; x < 35; x++) setPx(img, x, 20, 20)
    const bw = applyFilter(img, 'threshold')
    for (let i = 0; i < 1600; i++) expect([0, 255]).toContain(bw.data[i * 4])
    expect(bw.data[(20 * 40 + 20) * 4]).toBe(0)
  })
  it('gray makes R=G=B', () => {
    const img: Img = { data: Uint8ClampedArray.from([200, 100, 50, 255]), width: 1, height: 1 }
    const g = applyFilter(img, 'gray')
    expect(g.data[0]).toBe(g.data[1])
    expect(g.data[1]).toBe(g.data[2])
  })
  it('contrast stretches a washed-out page to near-white background and dark text', () => {
    const img = solid(60, 60, 170)
    for (let x = 10; x < 50; x++) setPx(img, x, 30, 110)
    const out = applyFilter(img, 'contrast')
    expect(out.data[(5 * 60 + 5) * 4]).toBeGreaterThan(230)
    expect(out.data[(30 * 60 + 30) * 4]).toBeLessThan(out.data[(5 * 60 + 5) * 4] - 40)
  })
})
