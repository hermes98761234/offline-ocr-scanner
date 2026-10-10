import { useCallback, useEffect, useRef, useState } from 'react'
import { tr, type T } from './i18n'
import { loadSettings, saveSettings, type Settings } from './lib/settings'
import { cleanText } from './lib/text'
import type { Page } from './types'
import { canvasToBlob, detectPage, processPage } from './engine/pipelineClient'
import { cachedLanguages, recognize, terminateOcr } from './engine/ocr'
import { download, loadImage, loadPdf, type LoadedImage } from './engine/files'
import Sidebar from './components/Sidebar'
import AdjustView from './components/AdjustView'
import ResultView from './components/ResultView'
import CameraDialog from './components/CameraDialog'

const REPO = 'https://github.com/hermes98761234/offline-ocr-scanner'
let counter = 0

function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [pages, setPages] = useState<Page[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [tab, setTab] = useState<'adjust' | 'text'>('adjust')
  const [running, setRunning] = useState(false)
  const [batch, setBatch] = useState<{ i: number; n: number } | null>(null)
  const [message, setMessage] = useState<{ kind: 'err' | 'info'; text: string } | null>(null)
  const [camera, setCamera] = useState(false)
  const [cached, setCached] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)
  const online = useOnline()
  const fileInput = useRef<HTMLInputElement>(null)
  const captureInput = useRef<HTMLInputElement>(null)
  const pagesRef = useRef<Page[]>([])
  const settingsRef = useRef(settings)
  const cancelRef = useRef<(() => void) | null>(null)
  const cancelled = useRef(false)
  const t: T = (s, ...a) => tr(settings.lang, s, ...a)
  const tRef = useRef(t)
  useEffect(() => {
    pagesRef.current = pages
    settingsRef.current = settings
    tRef.current = t
  })

  useEffect(() => saveSettings(settings), [settings])
  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'auto') delete root.dataset.theme
    else root.dataset.theme = settings.theme
    root.lang = settings.lang
  }, [settings.theme, settings.lang])
  useEffect(() => {
    cachedLanguages().then(setCached)
  }, [])

  const patchSettings = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }))
  const update = useCallback((id: string, patch: Partial<Page>) => setPages((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p))), [])

  const addLoaded = useCallback(
    (img: LoadedImage, name: string) => {
      const id = `p${Date.now()}-${counter++}`
      const page: Page = {
        id, name, blob: img.blob, width: img.width, height: img.height, thumb: img.thumb,
        rot: 0, quad: null, skew: null, status: 'idle', progress: 0, statusText: '',
      }
      setPages((ps) => [...ps, page])
      setSelected((cur) => cur ?? id)
      setTab('adjust')
      if (settingsRef.current.autoCrop) {
        detectPage(img.blob, 0).then((quad) => quad && update(id, { quad })).catch(() => undefined)
      }
    },
    [update],
  )

  const addFiles = useCallback(
    async (files: Blob[]) => {
      for (const f of files) {
        const name = f instanceof File ? f.name : 'pasted-image'
        try {
          setMessage({ kind: 'info', text: tRef.current('Reading {0}…', name) })
          if (f.type === 'application/pdf' || /\.pdf$/i.test(name)) {
            await loadPdf(f, (img, i, n) => addLoaded(img, n > 1 ? `${name} (${i}/${n})` : name))
          } else {
            addLoaded(await loadImage(f), name)
          }
          setMessage(null)
        } catch (e) {
          setMessage({ kind: 'err', text: tRef.current('Could not open {0}: {1}', name, e instanceof Error ? e.message : String(e)) })
        }
      }
    },
    [addLoaded],
  )

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/') || f.type === 'application/pdf')
      if (files.length) {
        e.preventDefault()
        void addFiles(files)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addFiles])

  const pasteButton = async () => {
    try {
      const items = await navigator.clipboard.read()
      const blobs: Blob[] = []
      for (const it of items) {
        const type = it.types.find((x) => x.startsWith('image/'))
        if (type) blobs.push(await it.getType(type))
      }
      if (blobs.length) await addFiles(blobs)
      else setMessage({ kind: 'err', text: t('Clipboard has no image.') })
    } catch {
      setMessage({ kind: 'err', text: t('Could not read the clipboard. Press Ctrl+V instead.') })
    }
  }

  const removePage = (id: string) => {
    const p = pagesRef.current.find((x) => x.id === id)
    if (p) {
      URL.revokeObjectURL(p.thumb)
      if (p.result) URL.revokeObjectURL(p.result.imageUrl)
    }
    const rest = pagesRef.current.filter((x) => x.id !== id)
    setPages(rest)
    setSelected((cur) => (cur === id ? (rest[0]?.id ?? null) : cur))
  }
  const clearPages = () => [...pagesRef.current].forEach((p) => removePage(p.id))
  const movePage = (id: string, dir: -1 | 1) =>
    setPages((ps) => {
      const i = ps.findIndex((p) => p.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= ps.length) return ps
      const next = [...ps]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  const runOcr = async (ids: string[]) => {
    setRunning(true)
    cancelled.current = false
    setMessage(null)
    for (let k = 0; k < ids.length; k++) {
      if (cancelled.current) break
      const id = ids[k]
      const page = pagesRef.current.find((p) => p.id === id)
      if (!page) continue
      const s = settingsRef.current
      setBatch({ i: k + 1, n: ids.length })
      update(id, { status: 'working', progress: 0, statusText: 'Preparing image…', error: undefined })
      try {
        const { canvas, skew } = await processPage({ blob: page.blob, rot: page.rot, quad: page.quad, skew: page.skew, autoDeskew: s.autoDeskew, filter: s.filter, maxSide: 3500 })
        const image = await canvasToBlob(canvas, s.filter === 'threshold' ? 'image/png' : 'image/jpeg', 0.92)
        const cancelPromise = new Promise<never>((_, reject) => {
          cancelRef.current = () => reject(new Error('cancelled'))
        })
        const res = await Promise.race([recognize(image, s.ocrLangs, (pr) => update(id, { progress: pr.progress, statusText: pr.status })), cancelPromise])
        if (page.result) URL.revokeObjectURL(page.result.imageUrl)
        update(id, {
          status: 'done',
          progress: 1,
          result: {
            text: cleanText(res.text, s),
            words: res.words,
            confidence: res.confidence,
            imageUrl: URL.createObjectURL(image),
            imgW: canvas.width,
            imgH: canvas.height,
            pdf: res.pdf,
            langs: s.ocrLangs,
            skew,
          },
        })
        setTab('text')
        setSelected(id)
      } catch (e) {
        if (cancelled.current) {
          update(id, { status: 'idle', progress: 0 })
          break
        }
        const text = e instanceof Error ? e.message : String(e)
        update(id, { status: 'error', error: text })
        setMessage({ kind: 'err', text: t('Recognition failed: {0}', text) })
      }
    }
    cancelRef.current = null
    setRunning(false)
    setBatch(null)
    cachedLanguages().then(setCached)
  }

  const cancel = () => {
    cancelled.current = true
    cancelRef.current?.()
    void terminateOcr()
  }

  const doneText = (scope: 'page' | 'all') => {
    const list = scope === 'all' ? pagesRef.current : pagesRef.current.filter((p) => p.id === selected)
    return list.filter((p) => p.result).map((p) => p.result!.text.trim()).join('\n\n')
  }
  const copy = async (scope: 'page' | 'all') => {
    const text = doneText(scope)
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.append(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
  }
  const exportPdf = async (scope: 'page' | 'all') => {
    const list = (scope === 'all' ? pagesRef.current : pagesRef.current.filter((p) => p.id === selected)).filter((p) => p.result?.pdf)
    if (!list.length) return
    const bytes = list.length === 1 ? list[0].result!.pdf! : await (await import('./lib/pdfmerge')).mergePdfs(list.map((p) => p.result!.pdf!), 'Scan')
    download(bytes, 'scan.pdf', 'application/pdf')
  }

  const page = pages.find((p) => p.id === selected) ?? pages[0]
  const working = pages.find((p) => p.status === 'working')

  return (
    <div
      className={`app${dragging ? ' dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        void addFiles([...e.dataTransfer.files])
      }}
    >
      <header className="toolbar">
        <span className="brand">{t('Offline OCR Scanner')}</span>
        <span className="hint tagline">{t('Photos and PDFs to text, entirely in your browser.')}</span>
        <span className="spacer" />
        <span className={`badge ${online ? 'high' : 'low'}`}>{online ? t('Online') : t('Offline')}</span>
        <label className="inline">
          {t('Language')}
          <select value={settings.lang} onChange={(e) => patchSettings({ lang: e.target.value as Settings['lang'] })}>
            <option value="en">English</option>
            <option value="uk">Українська</option>
          </select>
        </label>
        <label className="inline">
          {t('Theme')}
          <select value={settings.theme} onChange={(e) => patchSettings({ theme: e.target.value as Settings['theme'] })}>
            <option value="auto">{t('System')}</option>
            <option value="light">{t('Light')}</option>
            <option value="dark">{t('Dark')}</option>
          </select>
        </label>
      </header>
      <div className="body">
        <aside className="side">
          <Sidebar
            pages={pages}
            selected={page?.id ?? null}
            settings={settings}
            cached={cached}
            running={running}
            onSelect={(id) => setSelected(id)}
            onRemove={removePage}
            onMove={movePage}
            onClear={clearPages}
            onSettings={patchSettings}
            onCamera={() => (typeof navigator.mediaDevices?.getUserMedia === 'function' ? setCamera(true) : captureInput.current?.click())}
            onUpload={() => fileInput.current?.click()}
            onPaste={pasteButton}
            onRecognizeOne={() => page && runOcr([page.id])}
            onRecognizeAll={() => runOcr(pagesRef.current.map((p) => p.id))}
            onCancel={cancel}
            t={t}
          />
        </aside>
        <main className="main">
          {message && <div className={`msg ${message.kind}`} role="status">{message.text}</div>}
          {running && working && (
            <div className="box progress-box" role="status">
              <div>
                {batch && batch.n > 1 && <b>{t('Page {0} of {1}', batch.i, batch.n)} · </b>}
                {t(working.statusText)}
              </div>
              <progress value={working.progress} max={1} />
            </div>
          )}
          {!page ? (
            <div className="box empty">
              <p>{t('Add a photo, upload a file or paste an image to begin.')}</p>
              <p className="hint">{t('Nothing is uploaded. Language data is downloaded once, then cached for offline use.')}</p>
            </div>
          ) : (
            <div className="box">
              <div className="tabs" role="tablist">
                <button role="tab" aria-selected={tab === 'adjust'} className={tab === 'adjust' ? 'on' : ''} onClick={() => setTab('adjust')}>{t('Adjust')}</button>
                <button role="tab" aria-selected={tab === 'text'} className={tab === 'text' ? 'on' : ''} onClick={() => setTab('text')}>{t('Text')}</button>
              </div>
              {tab === 'adjust' ? (
                <AdjustView key={page.id} page={page} filter={settings.filter} autoDeskew={settings.autoDeskew} onChange={(patch) => update(page.id, patch)} t={t} />
              ) : (
                <ResultView
                  key={page.id}
                  page={page}
                  pages={pages}
                  onText={(text) => page.result && update(page.id, { result: { ...page.result, text } })}
                  onClean={() => page.result && update(page.id, { result: { ...page.result, text: cleanText(page.result.text, settings) } })}
                  onCopy={copy}
                  onTxt={(scope) => download(new Blob([doneText(scope)], { type: 'text/plain;charset=utf-8' }), 'scan.txt')}
                  onPdf={exportPdf}
                  t={t}
                />
              )}
            </div>
          )}
        </main>
      </div>
      <p className="hint foot">
        {t('Nothing is uploaded. Language data is downloaded once, then cached for offline use.')}{' '}
        <a href={REPO}>{t('Source on GitHub')}</a>
      </p>
      <input ref={fileInput} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { void addFiles([...(e.target.files ?? [])]); e.target.value = '' }} />
      <input ref={captureInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void addFiles([...(e.target.files ?? [])]); e.target.value = '' }} />
      {camera && (
        <CameraDialog
          onShot={(blob) => void loadImage(blob).then((img) => addLoaded(img, t('Take photo')))}
          onClose={() => setCamera(false)}
          onFallback={() => {
            setCamera(false)
            captureInput.current?.click()
          }}
          t={t}
        />
      )}
    </div>
  )
}
