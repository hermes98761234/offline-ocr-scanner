import { useState } from 'react'
import { confidenceLevel, type WordBox } from '../lib/ocrdata'
import type { T } from '../i18n'

interface Props {
  src: string
  width: number
  height: number
  words: WordBox[]
  t: T
}

/** The processed page with a box per recognized word; hovering a box highlights it and shows its text. */
export default function WordOverlay({ src, width, height, words, t }: Props) {
  const [hover, setHover] = useState(-1)
  const [show, setShow] = useState(true)
  const w = hover >= 0 ? words[hover] : null
  return (
    <div>
      <label className="check">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> {t('Word boxes')}
      </label>
      <div className="overlay" style={{ aspectRatio: `${width} / ${height}` }}>
        <img src={src} alt="" draggable={false} />
        {show && (
          <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" onPointerLeave={() => setHover(-1)}>
            {words.map((wd, i) => (
              <rect
                key={i}
                className={`wb ${confidenceLevel(wd.confidence)}${i === hover ? ' hot' : ''}`}
                x={wd.bbox.x0}
                y={wd.bbox.y0}
                width={wd.bbox.x1 - wd.bbox.x0}
                height={wd.bbox.y1 - wd.bbox.y0}
                onPointerEnter={() => setHover(i)}
              />
            ))}
          </svg>
        )}
        {show && w && (
          <div
            className="tip"
            style={{ left: `${((w.bbox.x0 + w.bbox.x1) / 2 / width) * 100}%`, top: `${(w.bbox.y0 / height) * 100}%`, transform: w.bbox.y0 / height < 0.08 ? 'translate(-50%, 2.2em)' : 'translate(-50%, -110%)' }}
          >
            {w.text} <b>{Math.round(w.confidence)}%</b>
          </div>
        )}
      </div>
      <p className="hint">{t('Hover a box to see the word and its confidence.')}</p>
    </div>
  )
}
