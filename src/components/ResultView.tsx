import { useState } from 'react'
import { confidenceLevel } from '../lib/ocrdata'
import { countWords } from '../lib/text'
import type { Page } from '../types'
import type { T } from '../i18n'
import WordOverlay from './WordOverlay'

interface Props {
  page: Page
  pages: Page[]
  onText: (text: string) => void
  onClean: () => void
  onCopy: (scope: 'page' | 'all') => Promise<void>
  onTxt: (scope: 'page' | 'all') => void
  onPdf: (scope: 'page' | 'all') => void
  t: T
}

export default function ResultView({ page, pages, onText, onClean, onCopy, onTxt, onPdf, t }: Props) {
  const [scope, setScope] = useState<'page' | 'all'>('page')
  const [copied, setCopied] = useState(false)
  const r = page.result
  const doneCount = pages.filter((p) => p.result).length
  if (!r) return <p className="hint">{t('Not recognized yet. Press Recognize.')}</p>
  const effective = doneCount > 1 ? scope : 'page'
  return (
    <div className="result">
      <div className="stats">
        <span className={`badge ${confidenceLevel(r.confidence)}`}>{t('Confidence {0}%', Math.round(r.confidence))}</span>
        <span className="badge">{t('{0} words', countWords(r.text))}</span>
        {Math.abs(r.skew) >= 0.2 && <span className="badge">{t('Skew {0}°', r.skew.toFixed(1))}</span>}
        <span className="badge">{r.langs.join('+')}</span>
      </div>
      <div className="result-grid">
        <WordOverlay src={r.imageUrl} width={r.imgW} height={r.imgH} words={r.words} t={t} />
        <div>
          <label htmlFor="ocr-text" className="cap">{t('Recognized text (editable)')}</label>
          <textarea id="ocr-text" value={r.text} onChange={(e) => onText(e.target.value)} spellCheck={false} />
          <div className="row">
            <button onClick={onClean}>{t('Clean up text')}</button>
            {doneCount > 1 && (
              <select aria-label={t('Export')} value={scope} onChange={(e) => setScope(e.target.value as 'page' | 'all')}>
                <option value="page">{t('This page')}</option>
                <option value="all">{t('All pages ({0})', doneCount)}</option>
              </select>
            )}
          </div>
          <div className="row">
            <button
              onClick={async () => {
                await onCopy(effective)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
            >
              {copied ? t('Copied') : t('Copy')}
            </button>
            <button onClick={() => onTxt(effective)}>{t('Download TXT')}</button>
            <button className="primary" onClick={() => onPdf(effective)}>{t('Download PDF')}</button>
          </div>
          <p className="hint">{t('Searchable PDF contains the recognized text of the original scan; later edits are only in TXT.')}</p>
        </div>
      </div>
    </div>
  )
}
