import type { Worker as TessWorker } from 'tesseract.js'
import { extractWords, meanConfidence, type RawPage, type WordBox } from '../lib/ocrdata'

export interface OcrProgress {
  status: string
  progress: number
}

export interface OcrResult {
  text: string
  words: WordBox[]
  confidence: number
  pdf: Uint8Array | null
}

let worker: TessWorker | null = null
let workerKey = ''
let pending: Promise<TessWorker> | null = null
let onProgress: ((p: OcrProgress) => void) | null = null

/** Directory holding the tesseract worker + core, emitted by the build next to index.html. */
function assetBase(): string {
  return new URL('tesseract/', document.baseURI).href
}

async function getWorker(langs: string[]): Promise<TessWorker> {
  const key = langs.join('+')
  if (worker && workerKey === key) return worker
  if (pending && workerKey === key) return pending
  await terminateOcr()
  workerKey = key
  const base = assetBase()
  pending = import('tesseract.js').then(async ({ createWorker, OEM }) => {
    const w = await createWorker(langs, OEM.LSTM_ONLY, {
      workerPath: `${base}worker.min.js`,
      corePath: `${base}core`,
      // Language data: jsDelivr (tesseract.js default). Downloaded once, then kept in IndexedDB.
      logger: (m) => onProgress?.({ status: m.status, progress: m.progress }),
    })
    worker = w
    return w
  })
  try {
    return await pending
  } catch (e) {
    workerKey = ''
    throw e
  } finally {
    pending = null
  }
}

export async function terminateOcr(): Promise<void> {
  const w = worker
  worker = null
  workerKey = ''
  pending = null
  if (w) await w.terminate().catch(() => undefined)
}

export async function recognize(image: Blob, langs: string[], progress: (p: OcrProgress) => void): Promise<OcrResult> {
  onProgress = progress
  progress({ status: 'loading', progress: 0 })
  const w = await getWorker(langs)
  const { data } = await w.recognize(image, {}, { text: true, blocks: true, pdf: true })
  const words = extractWords(data as unknown as RawPage)
  return {
    text: data.text,
    words,
    confidence: words.length ? meanConfidence(words) : data.confidence,
    pdf: data.pdf ? Uint8Array.from(data.pdf) : null,
  }
}

/** Language codes whose traineddata tesseract.js already stored in IndexedDB (usable offline). */
export function cachedLanguages(): Promise<string[]> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('keyval-store')
      req.onerror = () => resolve([])
      req.onupgradeneeded = () => {
        // Database did not exist: nothing cached. Abort so we do not create an empty one.
        req.transaction?.abort()
        resolve([])
      }
      req.onsuccess = () => {
        const db = req.result
        try {
          const keysReq = db.transaction('keyval', 'readonly').objectStore('keyval').getAllKeys()
          keysReq.onsuccess = () => {
            db.close()
            resolve(keysReq.result.map((k) => /([a-z_]+)\.traineddata/i.exec(String(k))?.[1]).filter((c): c is string => !!c))
          }
          keysReq.onerror = () => {
            db.close()
            resolve([])
          }
        } catch {
          db.close()
          resolve([])
        }
      }
    } catch {
      resolve([])
    }
  })
}
