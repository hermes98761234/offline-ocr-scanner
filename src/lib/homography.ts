/** Perspective math: homographies from 4 point pairs and a bilinear perspective warp. */

export interface Pt {
  x: number
  y: number
}

/** Row-major 3x3 matrix. */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number]

/** RGBA image buffer, the subset of ImageData the maths needs (so it runs without a canvas). */
export interface Img {
  data: Uint8ClampedArray
  width: number
  height: number
}

/** Solves A·x = b by Gaussian elimination with partial pivoting. Returns null when singular. */
export function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length
  const m = A.map((row, i) => [...row, b[i]])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r
    if (Math.abs(m[p][c]) < 1e-12) return null
    ;[m[c], m[p]] = [m[p], m[c]]
    for (let r = c + 1; r < n; r++) {
      const f = m[r][c] / m[c][c]
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k]
    }
  }
  const x = new Array<number>(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let s = m[r][n]
    for (let k = r + 1; k < n; k++) s -= m[r][k] * x[k]
    x[r] = s / m[r][r]
  }
  return x
}

/** The homography H (h33 = 1) with H·src[i] ~ dst[i] for four point pairs, or null if degenerate. */
export function homographyFromPoints(src: readonly Pt[], dst: readonly Pt[]): Mat3 | null {
  if (src.length !== 4 || dst.length !== 4) return null
  const A: number[][] = []
  const b: number[] = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i]
    const { x: u, y: v } = dst[i]
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y])
    b.push(u)
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y])
    b.push(v)
  }
  const h = solveLinear(A, b)
  return h ? ([h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1] as const) : null
}

export function applyHomography(H: Mat3, p: Pt): Pt {
  const w = H[6] * p.x + H[7] * p.y + H[8]
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w }
}

export function invertMat3(M: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = M
  const A = e * i - f * h
  const B = -(d * i - f * g)
  const C = d * h - e * g
  const det = a * A + b * B + c * C
  if (Math.abs(det) < 1e-14) return null
  const s = 1 / det
  return [
    A * s, -(b * i - c * h) * s, (b * f - c * e) * s,
    B * s, (a * i - c * g) * s, -(a * f - c * d) * s,
    C * s, -(a * h - b * g) * s, (a * e - b * d) * s,
  ]
}

/** Orders four points as top-left, top-right, bottom-right, bottom-left (image coordinates, y down). */
export function orderCorners(pts: readonly Pt[]): [Pt, Pt, Pt, Pt] {
  const by = (f: (p: Pt) => number, sign: 1 | -1) => pts.reduce((best, p) => (sign * f(p) < sign * f(best) ? p : best))
  const tl = by((p) => p.x + p.y, 1)
  const br = by((p) => p.x + p.y, -1)
  const tr = by((p) => p.x - p.y, -1)
  const bl = by((p) => p.x - p.y, 1)
  return [tl, tr, br, bl]
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

/** Output size of a flattened quad: the longer of each pair of opposite sides. */
export function quadSize(q: readonly Pt[]): { width: number; height: number } {
  const [tl, tr, br, bl] = q
  return {
    width: Math.max(1, Math.round(Math.max(dist(tl, tr), dist(bl, br)))),
    height: Math.max(1, Math.round(Math.max(dist(tl, bl), dist(tr, br)))),
  }
}

/** Shoelace area of a polygon. */
export function polygonArea(q: readonly Pt[]): number {
  let s = 0
  for (let i = 0; i < q.length; i++) {
    const a = q[i]
    const b = q[(i + 1) % q.length]
    s += a.x * b.y - b.x * a.y
  }
  return Math.abs(s) / 2
}

/** True when the quad is convex and non-degenerate (all cross products share a sign). */
export function isConvexQuad(q: readonly Pt[]): boolean {
  let sign = 0
  for (let i = 0; i < q.length; i++) {
    const a = q[i]
    const b = q[(i + 1) % q.length]
    const c = q[(i + 2) % q.length]
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    if (Math.abs(cross) < 1e-9) return false
    const s = Math.sign(cross)
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return true
}

function sample(src: Img, x: number, y: number, out: Uint8ClampedArray, o: number) {
  const { width: w, height: h, data } = src
  if (x < -0.5 || y < -0.5 || x > w - 0.5 || y > h - 0.5) {
    out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 255
    return
  }
  const cx = Math.min(w - 1, Math.max(0, x))
  const cy = Math.min(h - 1, Math.max(0, y))
  const x0 = Math.floor(cx)
  const y0 = Math.floor(cy)
  const x1 = Math.min(w - 1, x0 + 1)
  const y1 = Math.min(h - 1, y0 + 1)
  const fx = cx - x0
  const fy = cy - y0
  for (let c = 0; c < 4; c++) {
    const top = data[(y0 * w + x0) * 4 + c] * (1 - fx) + data[(y0 * w + x1) * 4 + c] * fx
    const bot = data[(y1 * w + x0) * 4 + c] * (1 - fx) + data[(y1 * w + x1) * 4 + c] * fx
    out[o + c] = top * (1 - fy) + bot * fy
  }
}

/**
 * Flattens the quadrilateral `corners` (any order) of `src` into an upright rectangle of
 * outW × outH pixels (default: the natural size of the quad), using bilinear sampling.
 */
export function warpPerspective(src: Img, corners: readonly Pt[], outW?: number, outH?: number): Img {
  const q = orderCorners(corners)
  const size = quadSize(q)
  const width = Math.max(1, Math.round(outW ?? size.width))
  const height = Math.max(1, Math.round(outH ?? size.height))
  const rect: Pt[] = [
    { x: 0, y: 0 },
    { x: width - 1, y: 0 },
    { x: width - 1, y: height - 1 },
    { x: 0, y: height - 1 },
  ]
  const H = homographyFromPoints(rect, q)
  const data = new Uint8ClampedArray(width * height * 4)
  if (!H) {
    data.fill(255)
    return { data, width, height }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const w = H[6] * x + H[7] * y + H[8]
      sample(src, (H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w, data, (y * width + x) * 4)
    }
  }
  return { data, width, height }
}
