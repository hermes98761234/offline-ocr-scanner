import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import type { Plugin } from 'vite'

/**
 * Tesseract.js runtime files are served from this origin instead of a CDN: the worker script and the
 * single-threaded LSTM core builds (WASM embedded in the .js, so no COOP/COEP headers are needed).
 */
const TESS_FILES: Record<string, string> = {
  'tesseract/worker.min.js': 'node_modules/tesseract.js/dist/worker.min.js',
  'tesseract/core/tesseract-core-lstm.wasm.js': 'node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js',
  'tesseract/core/tesseract-core-simd-lstm.wasm.js': 'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
  'tesseract/core/tesseract-core-relaxedsimd-lstm.wasm.js': 'node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js',
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

/** Serves/emits the tesseract runtime files and writes a precaching service worker (`sw.js`) after the build. */
export function ocrAssets(): Plugin {
  let outDir = 'dist'
  let root = process.cwd()
  return {
    name: 'ocr-assets',
    configResolved(config) {
      outDir = join(config.root, config.build.outDir)
      root = config.root
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const key = (req.url ?? '').split('?')[0].replace(/^\//, '')
        const file = TESS_FILES[key]
        if (!file) return next()
        res.setHeader('Content-Type', 'text/javascript')
        res.end(readFileSync(join(root, file)))
      })
    },
    generateBundle() {
      for (const [fileName, file] of Object.entries(TESS_FILES)) {
        this.emitFile({ type: 'asset', fileName, source: readFileSync(join(root, file)) })
      }
    },
    writeBundle() {
      // Large, lazily used files are cached on first use by the service worker rather than precached.
      const lazy = (rel: string) => rel.startsWith('tesseract/') || /pdf\.worker/.test(rel) || rel === 'sw.js'
      const files = walk(outDir).map((p) => relative(outDir, p).split('\\').join('/')).filter((r) => !lazy(r)).sort()
      const hash = createHash('sha1')
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)))
      const precache = ['./', ...files.map((f) => `./${f}`)]
      const template = readFileSync(join(root, 'scripts/sw.template.js'), 'utf8')
      const source = template.replace('__PRECACHE__', JSON.stringify(precache)).replace('__VERSION__', JSON.stringify(hash.digest('hex').slice(0, 12)))
      const out = join(outDir, 'sw.js')
      if (!existsSync(dirname(out))) mkdirSync(dirname(out), { recursive: true })
      writeFileSync(out, source)
    },
  }
}
