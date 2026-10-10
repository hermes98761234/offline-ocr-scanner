import { isConvexQuad, orderCorners, type Pt } from './homography'

/** Normalised (0..1) corner quad, ordered tl, tr, br, bl, in the frame of the rotated image. */
export type Quad = [Pt, Pt, Pt, Pt]

export const FULL_QUAD: Quad = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Rotates a normalised point by whole quarter turns clockwise (the image rotates, so x/y swap). */
export function rotateNormPoint(p: Pt, quarterTurns: number): Pt {
  let q = ((quarterTurns % 4) + 4) % 4
  let { x, y } = p
  while (q-- > 0) [x, y] = [1 - y, x]
  return { x, y }
}

export function rotateQuad(quad: Quad, quarterTurns: number): Quad {
  return orderCorners(quad.map((p) => rotateNormPoint(p, quarterTurns))) as Quad
}

export function toNormalized(corners: readonly Pt[], width: number, height: number): Quad {
  return orderCorners(corners.map((p) => ({ x: clamp01(p.x / width), y: clamp01(p.y / height) }))) as Quad
}

export function toPixels(quad: readonly Pt[], width: number, height: number): Pt[] {
  return quad.map((p) => ({ x: p.x * (width - 1), y: p.y * (height - 1) }))
}

/** Moves corner `i` to `p` (clamped to the image) unless that would make the quad non-convex. */
export function moveCorner(quad: Quad, i: number, p: Pt, aspect = 1): Quad {
  const next = quad.map((c, k) => (k === i ? { x: clamp01(p.x), y: clamp01(p.y) } : c)) as Quad
  // Convexity is judged in pixel proportions, so scale y by the image aspect (height / width).
  const scaled = next.map((c) => ({ x: c.x, y: c.y * aspect }))
  return isConvexQuad(scaled) ? next : quad
}

export function isFullQuad(quad: Quad | null): boolean {
  return !quad || quad.every((p, i) => Math.abs(p.x - FULL_QUAD[i].x) < 1e-3 && Math.abs(p.y - FULL_QUAD[i].y) < 1e-3)
}
