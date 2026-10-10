/** Canvas-free pixel operations for the document-scanner pre-processing pipeline. */
import { polygonArea, type Img, type Pt } from './homography'

export type Gray = Uint8ClampedArray

/** Rec. 601 luma of an RGBA buffer. */
export function toGray(img: Img): Gray {
  const n = img.width * img.height
  const out = new Uint8ClampedArray(n)
  const d = img.data
  for (let i = 0; i < n; i++) out[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]
  return out
}

export function grayToImg(g: Gray, width: number, height: number): Img {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < g.length; i++) {
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = g[i]
    data[i * 4 + 3] = 255
  }
  return { data, width, height }
}

/** Otsu's method: the threshold maximising between-class variance. Pixels <= t are the dark class. */
export function otsuThreshold(g: Gray): number {
  const hist = new Array<number>(256).fill(0)
  for (let i = 0; i < g.length; i++) hist[g[i]]++
  const total = g.length
  let sum = 0
  for (let t = 0; t < 256; t++) sum += t * hist[t]
  let wB = 0
  let sumB = 0
  let best = 0
  let bestVar = -1
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const v = wB * wF * (mB - mF) * (mB - mF)
    if (v > bestVar) {
      bestVar = v
      best = t
    }
  }
  return best
}

/** Global binarisation: pixels <= t become black (0), the rest white (255). */
export function globalThreshold(g: Gray, t: number): Gray {
  const out = new Uint8ClampedArray(g.length)
  for (let i = 0; i < g.length; i++) out[i] = g[i] <= t ? 0 : 255
  return out
}

/**
 * Bradley-Roth adaptive threshold using an integral image: a pixel is black when it is more than
 * `percent` % darker than the mean of its (2·radius+1)² neighbourhood. Handles uneven lighting.
 */
export function adaptiveThreshold(g: Gray, width: number, height: number, radius = 15, percent = 12): Gray {
  const W = width + 1
  const integral = new Float64Array(W * (height + 1))
  for (let y = 0; y < height; y++) {
    let row = 0
    for (let x = 0; x < width; x++) {
      row += g[y * width + x]
      integral[(y + 1) * W + x + 1] = integral[y * W + x + 1] + row
    }
  }
  const out = new Uint8ClampedArray(g.length)
  const keep = 1 - percent / 100
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius)
    const y1 = Math.min(height - 1, y + radius)
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius)
      const x1 = Math.min(width - 1, x + radius)
      const sum = integral[(y1 + 1) * W + x1 + 1] - integral[y0 * W + x1 + 1] - integral[(y1 + 1) * W + x0] + integral[y0 * W + x0]
      const mean = sum / ((x1 - x0 + 1) * (y1 - y0 + 1))
      out[y * width + x] = g[y * width + x] < mean * keep ? 0 : 255
    }
  }
  return out
}

/** Linear contrast stretch: maps the `lowPct`/`highPct` percentiles to 0 and 255. */
export function stretchContrast(g: Gray, lowPct = 1, highPct = 99): Gray {
  const hist = new Array<number>(256).fill(0)
  for (let i = 0; i < g.length; i++) hist[g[i]]++
  const pick = (pct: number) => {
    const target = (pct / 100) * g.length
    let acc = 0
    for (let t = 0; t < 256; t++) {
      acc += hist[t]
      if (acc > 0 && acc >= target) return t
    }
    return 255
  }
  const lo = pick(lowPct)
  const hi = pick(highPct)
  const out = new Uint8ClampedArray(g.length)
  if (hi <= lo) {
    out.set(g)
    return out
  }
  const scale = 255 / (hi - lo)
  for (let i = 0; i < g.length; i++) out[i] = (g[i] - lo) * scale
  return out
}

/** Box blur with edge clamping (separable, via running sums). */
export function boxBlur(g: Gray, width: number, height: number, radius: number): Gray {
  if (radius <= 0) return Uint8ClampedArray.from(g)
  const tmp = new Float32Array(g.length)
  const out = new Uint8ClampedArray(g.length)
  const span = 2 * radius + 1
  for (let y = 0; y < height; y++) {
    let s = 0
    for (let k = -radius; k <= radius; k++) s += g[y * width + Math.min(width - 1, Math.max(0, k))]
    for (let x = 0; x < width; x++) {
      tmp[y * width + x] = s / span
      s += g[y * width + Math.min(width - 1, x + radius + 1)] - g[y * width + Math.max(0, x - radius)]
    }
  }
  for (let x = 0; x < width; x++) {
    let s = 0
    for (let k = -radius; k <= radius; k++) s += tmp[Math.min(height - 1, Math.max(0, k)) * width + x]
    for (let y = 0; y < height; y++) {
      out[y * width + x] = s / span
      s += tmp[Math.min(height - 1, y + radius + 1) * width + x] - tmp[Math.max(0, y - radius) * width + x]
    }
  }
  return out
}

/** Nearest-neighbour-free downscale by box averaging so that the longest side is at most `maxSide`. */
export function downscale(img: Img, maxSide: number): { img: Img; scale: number } {
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
  if (scale === 1) return { img, scale }
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    const sy0 = Math.floor(y / scale)
    const sy1 = Math.min(img.height, Math.max(sy0 + 1, Math.floor((y + 1) / scale)))
    for (let x = 0; x < w; x++) {
      const sx0 = Math.floor(x / scale)
      const sx1 = Math.min(img.width, Math.max(sx0 + 1, Math.floor((x + 1) / scale)))
      const acc = [0, 0, 0, 0]
      let n = 0
      for (let sy = sy0; sy < sy1; sy++)
        for (let sx = sx0; sx < sx1; sx++) {
          const o = (sy * img.width + sx) * 4
          for (let c = 0; c < 4; c++) acc[c] += img.data[o + c]
          n++
        }
      for (let c = 0; c < 4; c++) data[(y * w + x) * 4 + c] = acc[c] / n
    }
  }
  return { img: { data, width: w, height: h }, scale }
}

/** Rotates by whole quarter turns clockwise (exact, no resampling). */
export function rotate90(img: Img, quarterTurns: number): Img {
  const q = ((quarterTurns % 4) + 4) % 4
  if (q === 0) return img
  const { width: w, height: h } = img
  const ow = q === 2 ? w : h
  const oh = q === 2 ? h : w
  const data = new Uint8ClampedArray(ow * oh * 4)
  for (let y = 0; y < oh; y++)
    for (let x = 0; x < ow; x++) {
      let sx: number
      let sy: number
      if (q === 1) [sx, sy] = [y, h - 1 - x]
      else if (q === 2) [sx, sy] = [w - 1 - x, h - 1 - y]
      else [sx, sy] = [w - 1 - y, x]
      data.set(img.data.subarray((sy * w + sx) * 4, (sy * w + sx) * 4 + 4), (y * ow + x) * 4)
    }
  return { data, width: ow, height: oh }
}

/** Rotates clockwise by `deg` degrees about the centre, enlarging the canvas; new area is `fill` (white). */
export function rotateImage(img: Img, deg: number, fill = 255): Img {
  if (Math.abs(deg) < 1e-6) return img
  const phi = (deg * Math.PI) / 180
  const cos = Math.cos(phi)
  const sin = Math.sin(phi)
  const { width: w, height: h } = img
  const ow = Math.ceil(Math.abs(w * cos) + Math.abs(h * sin) - 1e-9)
  const oh = Math.ceil(Math.abs(w * sin) + Math.abs(h * cos) - 1e-9)
  const data = new Uint8ClampedArray(ow * oh * 4).fill(fill)
  for (let i = 3; i < data.length; i += 4) data[i] = 255
  const cx = (w - 1) / 2
  const cy = (h - 1) / 2
  const ocx = (ow - 1) / 2
  const ocy = (oh - 1) / 2
  for (let y = 0; y < oh; y++)
    for (let x = 0; x < ow; x++) {
      const dx = x - ocx
      const dy = y - ocy
      let sx = dx * cos + dy * sin + cx
      let sy = -dx * sin + dy * cos + cy
      if (sx < -1e-6 || sy < -1e-6 || sx > w - 1 + 1e-6 || sy > h - 1 + 1e-6) continue
      sx = Math.min(w - 1, Math.max(0, sx))
      sy = Math.min(h - 1, Math.max(0, sy))
      const x0 = Math.floor(sx)
      const y0 = Math.floor(sy)
      const x1 = Math.min(w - 1, x0 + 1)
      const y1 = Math.min(h - 1, y0 + 1)
      const fx = sx - x0
      const fy = sy - y0
      for (let c = 0; c < 4; c++) {
        const a = img.data[(y0 * w + x0) * 4 + c] * (1 - fx) + img.data[(y0 * w + x1) * 4 + c] * fx
        const b = img.data[(y1 * w + x0) * 4 + c] * (1 - fx) + img.data[(y1 * w + x1) * 4 + c] * fx
        data[(y * ow + x) * 4 + c] = a * (1 - fy) + b * fy
      }
    }
  return { data, width: ow, height: oh }
}

/**
 * Estimates the skew of text lines in degrees (positive = lines descend to the right, i.e. the page
 * is rotated clockwise). Projection-profile method: the angle whose horizontal projection of dark
 * pixels is the most "peaky" wins. Correct with `rotateImage(img, -angle)`.
 */
export function estimateSkew(img: Img, maxAngle = 15, step = 0.25): number {
  const { img: small } = downscale(img, 700)
  const g = toGray(small)
  const t = otsuThreshold(g)
  const xs: number[] = []
  const ys: number[] = []
  for (let y = 0; y < small.height; y++) for (let x = 0; x < small.width; x++) if (g[y * small.width + x] <= t) {
        xs.push(x)
        ys.push(y)
      }
  if (xs.length < 20 || xs.length > g.length * 0.6) return 0
  const diag = Math.ceil(Math.hypot(small.width, small.height))
  const score = (deg: number) => {
    const r = (deg * Math.PI) / 180
    const c = Math.cos(r)
    const s = Math.sin(r)
    const hist = new Float64Array(2 * diag + 2)
    for (let i = 0; i < xs.length; i++) hist[Math.round(ys[i] * c - xs[i] * s) + diag]++
    let sum = 0
    for (let i = 0; i < hist.length; i++) sum += hist[i] * hist[i]
    return sum
  }
  let best = 0
  let bestScore = -1
  for (let a = -maxAngle; a <= maxAngle + 1e-9; a += step) {
    const sc = score(a)
    if (sc > bestScore + 1e-9) {
      bestScore = sc
      best = a
    }
  }
  const coarse = best
  for (let a = coarse - step; a <= coarse + step + 1e-9; a += step / 5) {
    const sc = score(a)
    if (sc > bestScore + 1e-9) {
      bestScore = sc
      best = a
    }
  }
  return Math.round(best * 100) / 100
}

/**
 * Finds the page in a photo: the largest bright blob after Otsu thresholding, reduced to its four
 * extreme points. Returns corners (tl, tr, br, bl) in image coordinates, or null when no distinct page is found.
 */
export function detectDocument(img: Img): [Pt, Pt, Pt, Pt] | null {
  const { img: small, scale } = downscale(img, 220)
  const { width: w, height: h } = small
  const g = boxBlur(boxBlur(toGray(small), w, h, 2), w, h, 2)
  const t = otsuThreshold(g)
  const label = new Int32Array(w * h)
  let bestId = 0
  let bestSize = 0
  let next = 0
  const stack: number[] = []
  for (let i = 0; i < w * h; i++) {
    if (g[i] <= t || label[i]) continue
    const id = ++next
    let size = 0
    stack.push(i)
    label[i] = id
    while (stack.length) {
      const p = stack.pop()!
      size++
      const x = p % w
      const y = (p - x) / w
      for (const n of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (n >= 0 && !label[n] && g[n] > t) {
          label[n] = id
          stack.push(n)
        }
      }
    }
    if (size > bestSize) {
      bestSize = size
      bestId = id
    }
  }
  if (bestSize < w * h * 0.15) return null
  let tl = { x: 0, y: 0, v: Infinity }
  let br = { x: 0, y: 0, v: -Infinity }
  let tr = { x: 0, y: 0, v: -Infinity }
  let bl = { x: 0, y: 0, v: Infinity }
  for (let p = 0; p < w * h; p++) {
    if (label[p] !== bestId) continue
    const x = p % w
    const y = (p - x) / w
    if (x + y < tl.v) tl = { x, y, v: x + y }
    if (x + y > br.v) br = { x, y, v: x + y }
    if (x - y > tr.v) tr = { x, y, v: x - y }
    if (x - y < bl.v) bl = { x, y, v: x - y }
  }
  // Pixel centres -> outer edges, scaled back to full resolution.
  const back = (p: { x: number; y: number }, dx: number, dy: number): Pt => ({
    x: Math.min(img.width - 1, Math.max(0, (p.x + 0.5 + dx * 0.5) / scale)),
    y: Math.min(img.height - 1, Math.max(0, (p.y + 0.5 + dy * 0.5) / scale)),
  })
  const quad: [Pt, Pt, Pt, Pt] = [back(tl, -1, -1), back(tr, 1, -1), back(br, 1, 1), back(bl, -1, 1)]
  if (polygonArea(quad) < img.width * img.height * 0.12) return null
  // A blob that fills (nearly) the whole frame means there is no background to separate from.
  if (polygonArea(quad) > img.width * img.height * 0.985) return null
  return quad
}

export type Filter = 'none' | 'gray' | 'contrast' | 'threshold'

/** Applies a scan filter to a colour image. */
export function applyFilter(img: Img, filter: Filter): Img {
  if (filter === 'none') return img
  const { width: w, height: h } = img
  const g = toGray(img)
  if (filter === 'gray') return grayToImg(g, w, h)
  if (filter === 'contrast') {
    // Divide out the local background so shadows disappear, then stretch.
    const bg = boxBlur(boxBlur(g, w, h, Math.max(8, Math.round(Math.max(w, h) / 40))), w, h, 4)
    const flat = new Uint8ClampedArray(g.length)
    for (let i = 0; i < g.length; i++) flat[i] = Math.min(255, (g[i] / Math.max(1, bg[i])) * 235)
    return grayToImg(stretchContrast(flat, 1, 50), w, h)
  }
  const radius = Math.max(8, Math.round(Math.min(w, h) / 40))
  return grayToImg(adaptiveThreshold(g, w, h, radius, 12), w, h)
}
