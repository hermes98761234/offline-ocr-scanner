import { useEffect, useRef, useState } from 'react'
import { moveCorner, type Quad } from '../lib/crop'
import type { T } from '../i18n'

/** Renders `blob` rotated clockwise by `rot` quarter turns, longest side <= maxSide, as an object URL. */
async function rotatedUrl(blob: Blob, rot: number, maxSide: number): Promise<string> {
  const bmp = await createImageBitmap(blob)
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * scale)
  const h = Math.round(bmp.height * scale)
  const turned = rot % 2 !== 0
  const canvas = document.createElement('canvas')
  canvas.width = turned ? h : w
  canvas.height = turned ? w : h
  const ctx = canvas.getContext('2d')!
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((rot * Math.PI) / 2)
  ctx.drawImage(bmp, -w / 2, -h / 2, w, h)
  bmp.close()
  const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85))
  if (!out) throw new Error('Could not render preview')
  return URL.createObjectURL(out)
}

interface Props {
  blob: Blob
  rot: number
  width: number
  height: number
  quad: Quad | null
  onQuad: (q: Quad) => void
  t: T
}

const FULL: Quad = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]

export default function CropEditor({ blob, rot, width, height, quad, onQuad, t }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<number | null>(null)
  const q = quad ?? FULL
  const aspect = rot % 2 ? width / height : height / width

  useEffect(() => {
    let live = true
    let made: string | null = null
    rotatedUrl(blob, rot, 1400).then((u) => {
      if (live) {
        made = u
        setUrl(u)
      } else URL.revokeObjectURL(u)
    })
    return () => {
      live = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [blob, rot])

  const pointFrom = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
  }

  return (
    <div className="crop" ref={box} style={{ aspectRatio: rot % 2 ? `${height} / ${width}` : `${width} / ${height}` }}>
      {url && <img src={url} alt="" draggable={false} />}
      <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
        <polygon points={q.map((p) => `${p.x},${p.y}`).join(' ')} />
      </svg>
      {q.map((p, i) => (
        <button
          key={i}
          type="button"
          className="handle"
          aria-label={t('Drag the corners onto the page edges. Perspective is corrected automatically.')}
          style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
          onPointerDown={(e) => {
            drag.current = i
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (drag.current === i) onQuad(moveCorner(q, i, pointFrom(e), aspect))
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        />
      ))}
    </div>
  )
}
