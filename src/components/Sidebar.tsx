import { OCR_LANGS } from '../lib/languages'
import type { Filter } from '../lib/imageops'
import type { Settings } from '../lib/settings'
import type { Page } from '../types'
import type { T } from '../i18n'

interface Props {
  pages: Page[]
  selected: string | null
  settings: Settings
  cached: string[]
  running: boolean
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  onMove: (id: string, dir: -1 | 1) => void
  onClear: () => void
  onSettings: (patch: Partial<Settings>) => void
  onCamera: () => void
  onUpload: () => void
  onPaste: () => void
  onRecognizeOne: () => void
  onRecognizeAll: () => void
  onCancel: () => void
  t: T
}

const FILTERS: [Filter, string][] = [
  ['none', 'Original colour'],
  ['gray', 'Grayscale'],
  ['contrast', 'Enhance contrast'],
  ['threshold', 'Black and white (adaptive)'],
]

export default function Sidebar(p: Props) {
  const { t, settings, pages } = p
  const toggleLang = (code: string) => {
    const set = new Set(settings.ocrLangs)
    if (set.has(code)) set.delete(code)
    else set.add(code)
    p.onSettings({ ocrLangs: OCR_LANGS.filter((l) => set.has(l.code)).map((l) => l.code) })
  }
  const check = (key: 'autoCrop' | 'autoDeskew' | 'dehyphenate' | 'reflow', label: string) => (
    <label className="check">
      <input type="checkbox" checked={settings[key]} onChange={(e) => p.onSettings({ [key]: e.target.checked })} /> {t(label)}
    </label>
  )
  return (
    <div className="panel">
      <section className="section">
        <h3>{t('Add pages')}</h3>
        <div className="row">
          <button onClick={p.onCamera}>📷 {t('Camera')}</button>
          <button onClick={p.onUpload}>📁 {t('Upload images or PDF')}</button>
          <button onClick={p.onPaste}>📋 {t('Paste')}</button>
        </div>
        <p className="hint">{t('You can also drop files here or press Ctrl+V to paste an image.')}</p>
      </section>

      <section className="section">
        <h3>{t('Pages')}</h3>
        {pages.length === 0 && <p className="hint">{t('No pages yet.')}</p>}
        <ul className="pages">
          {pages.map((pg, i) => (
            <li key={pg.id} className={pg.id === p.selected ? 'active' : ''}>
              <button className="link thumb" onClick={() => p.onSelect(pg.id)}>
                <img src={pg.thumb} alt="" />
                <span className="pname">
                  {t('Page {0}', i + 1)}
                  <small>{pg.name}</small>
                  {pg.status === 'working' && <progress value={pg.progress} max={1} />}
                  {pg.status === 'working' && <small>{t(pg.statusText)}</small>}
                  {pg.status === 'done' && pg.result && <small className="ok-text">✓ {Math.round(pg.result.confidence)}%</small>}
                  {pg.status === 'error' && <small className="err-text">{t('Failed')}</small>}
                </span>
              </button>
              <span className="mini">
                <button className="small" aria-label={t('Move up')} title={t('Move up')} disabled={i === 0} onClick={() => p.onMove(pg.id, -1)}>↑</button>
                <button className="small" aria-label={t('Move down')} title={t('Move down')} disabled={i === pages.length - 1} onClick={() => p.onMove(pg.id, 1)}>↓</button>
                <button className="small danger" aria-label={t('Remove')} title={t('Remove')} onClick={() => p.onRemove(pg.id)}>✕</button>
              </span>
            </li>
          ))}
        </ul>
        {pages.length > 1 && <button className="small danger" onClick={p.onClear}>{t('Remove all')}</button>}
      </section>

      <section className="section">
        <h3>{t('Recognition languages')}</h3>
        <div className="langs">
          {OCR_LANGS.map((l) => (
            <label key={l.code} className="check" title={p.cached.includes(l.code) ? t('Downloaded') : undefined}>
              <input type="checkbox" checked={settings.ocrLangs.includes(l.code)} onChange={() => toggleLang(l.code)} /> {l.name}
              {p.cached.includes(l.code) && <span className="ok-text"> ✓</span>}
            </label>
          ))}
        </div>
        <p className="hint">{t('Pick every language that appears in the document.')}</p>
      </section>

      <section className="section">
        <h3>{t('Scan options')}</h3>
        <div className="field">
          <label htmlFor="filter">{t('Filter')}</label>
          <select id="filter" value={settings.filter} onChange={(e) => p.onSettings({ filter: e.target.value as Filter })}>
            {FILTERS.map(([v, label]) => <option key={v} value={v}>{t(label)}</option>)}
          </select>
        </div>
        {check('autoCrop', 'Detect page edges automatically')}
        {check('autoDeskew', 'Straighten tilted text automatically')}
        {check('dehyphenate', 'Join words hyphenated at line ends')}
        {check('reflow', 'Join wrapped lines into paragraphs')}
      </section>

      <div className="row sticky">
        {p.running ? (
          <button className="danger" onClick={p.onCancel}>{t('Cancel')}</button>
        ) : (
          <>
            <button className="primary" disabled={!p.selected} onClick={p.onRecognizeOne}>{t('Recognize')}</button>
            {pages.length > 1 && <button onClick={p.onRecognizeAll}>{t('Recognize all')}</button>}
          </>
        )}
      </div>
    </div>
  )
}
