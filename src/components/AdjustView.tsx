import { useEffect, useRef, useState } from 'react'
import { FULL_QUAD, isFullQuad, rotateQuad, type Quad } from '../lib/crop'
import type { Filter } from '../lib/imageops'
import type { Page } from '../types'
import type { T } from '../i18n'
import { canvasToBlob, detectPage, processPage } from '../engine/pipelineClient'
import CropEditor from './CropEditor'

interface Props {
  page: Page
  filter: Filter
  autoDeskew: boolean
  onChange: (patch: Partial<Page>) => void
  t: T
}

export default function AdjustView({ page, filter, autoDeskew, onChange, t }: Props) {
  const [preview, setPreview] = useState<{ url: string; skew: number; key: string } | null>(null)
  const [note, setNote] = useState('')
  const { blob, rot, quad, skew } = page
  const lastUrl = useRef<string | null>(null)
  const key = JSON.stringify([rot, quad, skew, autoDeskew, filter])
  const busy = preview?.key !== key

  // Live preview of the whole pipeline at low resolution, debounced while the corners are dragged.
  useEffect(() => {
    let live = true
    const timer = setTimeout(() => {
      processPage({ blob, rot, quad, skew, autoDeskew, filter, maxSide: 900 })
        .then(async (p) => {
          const url = URL.createObjectURL(await canvasToBlob(p.canvas, 'image/jpeg', 0.85))
          if (!live) return URL.revokeObjectURL(url)
          if (lastUrl.current) URL.revokeObjectURL(lastUrl.current)
          lastUrl.current = url
          setPreview({ url, skew: p.skew, key })
        })
        .catch(() => undefined)
    }, 250)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [blob, rot, quad, skew, autoDeskew, filter, key])

  useEffect(() => () => { if (lastUrl.current) URL.revokeObjectURL(lastUrl.current) }, [])

  const rotate = (turns: number) => onChange({ rot: (rot + turns + 4) % 4, quad: quad ? rotateQuad(quad, turns) : null })
  const find = async () => {
    setNote('')
    const q = await detectPage(blob, rot)
    if (q) onChange({ quad: q })
    else setNote(t('No page edges found.'))
  }
  const shownSkew = skew ?? preview?.skew ?? 0

  return (
    <div className="adjust">
      <div className="row">
        <button onClick={() => rotate(-1)} aria-label={t('Rotate left')} title={t('Rotate left')}>⟲</button>
        <button onClick={() => rotate(1)} aria-label={t('Rotate right')} title={t('Rotate right')}>⟳</button>
        <button onClick={find}>{t('Find page')}</button>
        <button onClick={() => onChange({ quad: null })} disabled={isFullQuad(quad)}>{t('Reset crop')}</button>
        {note && <span className="warn-text">{note}</span>}
      </div>
      <div className="row skew">
        <label htmlFor="skew">{t('Deskew')}</label>
        <input
          id="skew"
          type="range"
          min={-15}
          max={15}
          step={0.1}
          value={shownSkew}
          onChange={(e) => onChange({ skew: Number(e.target.value) })}
        />
        <output>{t('{0}°', shownSkew.toFixed(1))}</output>
        <button className="small" onClick={() => onChange({ skew: null })} disabled={skew === null}>{t('Auto')}</button>
      </div>
      <p className="hint">{t('Drag the corners onto the page edges. Perspective is corrected automatically.')}</p>
      <div className="adjust-grid">
        <div>
          <CropEditor blob={blob} rot={rot} width={page.width} height={page.height} quad={quad ?? FULL_QUAD} onQuad={(q: Quad) => onChange({ quad: q })} t={t} />
        </div>
        <div>
          <h3 className="cap">{t('Preview')}</h3>
          <div className={`preview${busy ? ' busy' : ''}`}>
            {preview ? <img src={preview.url} alt="" /> : <span className="hint">{t('Preparing…')}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
