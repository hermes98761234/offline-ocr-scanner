// Screenshot the running app via headless Chromium + DevTools protocol, optionally after loading
// an image and running OCR on it.
// usage: node scripts/shot.mjs URL OUT.png [width] [height] [dark] [--image FILE] [--tab adjust|text] [--lang uk] [--ocrlangs eng,ukr] [--offline] [--eval JS]
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PORT = 9318
const argv = process.argv.slice(2)
const flag = (name) => {
  const i = argv.indexOf(name)
  if (i < 0) return undefined
  const v = argv[i + 1]
  argv.splice(i, 2)
  return v
}
const image = flag('--image')
const tab = flag('--tab')
const lang = flag('--lang')
const evalJs = flag('--eval')
const ocrlangs = flag('--ocrlangs')
const offlineRerun = argv.includes('--offline') && argv.splice(argv.indexOf('--offline'), 1).length > 0
const [url, out, w = '1440', h = '960', dark] = argv
const chrome = spawn(process.env.CHROME ?? 'chromium', ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--window-size=${w},${h}`, 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
try {
  let target
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200)
    target = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json()).then((l) => l.find((t) => t.type === 'page')).catch(() => null)
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  let id = 0
  const pending = new Map()
  const errors = []
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) pending.get(m.id)(m.result ?? m.error)
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text)
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '))
  }
  const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })) })
  const js = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value
  const waitFor = async (expression, tries = 240) => {
    for (let i = 0; i < tries; i++) {
      if (await js(expression)) return true
      await sleep(500)
    }
    return false
  }
  await send('Runtime.enable')
  await send('DOM.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: +w < 600 })
  if (dark) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
  await send('Page.navigate', { url })
  await waitFor("!!document.querySelector('.brand')", 60)
  if (ocrlangs) {
    await js(`localStorage.setItem('offline-ocr-scanner:settings', JSON.stringify({ ocrLangs: '${ocrlangs}'.split(',') }))`)
    await send('Page.reload')
    await waitFor("!!document.querySelector('.brand')", 60)
  }
  if (lang) {
    await js(`(() => { const s = document.querySelector('.toolbar select'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, '${lang}'); s.dispatchEvent(new Event('change', { bubbles: true })) })()`)
  }
  const addAndRecognize = async () => {
    const doc = await send('DOM.getDocument')
    const input = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'input[type=file]:not([capture])' })
    await send('DOM.setFileInputFiles', { files: [resolve(image)], nodeId: input.nodeId })
    console.log('page added:', await waitFor("document.querySelectorAll('.pages li').length > 0", 60))
    await sleep(2500) // page detection + preview
    if (tab !== 'adjust') {
      await js("[...document.querySelectorAll('button')].find(b => /^(Recognize|Розпізнати)$/.test(b.textContent.trim())).click()")
      const ok = await waitFor("(document.querySelector('#ocr-text')?.value.length ?? 0) > 0 || !!document.querySelector('.msg.err')", 480)
      console.log(ok ? 'ocr finished' : 'OCR TIMED OUT')
      console.log('text:', JSON.stringify(await js("document.querySelector('#ocr-text')?.value")))
      console.log('badges:', await js("[...document.querySelectorAll('.stats .badge')].map(b => b.textContent).join(' | ')"))
      console.log('message:', await js("document.querySelector('.msg')?.textContent ?? ''"))
      await sleep(500)
    }
  }
  if (image) await addAndRecognize()
  if (image && offlineRerun) {
    console.log('--- going offline and reloading')
    await send('Network.enable')
    await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 })
    console.log('fetch while offline:', await js("fetch('./index.html').then(r => r.status + ' ' + r.headers.get('content-type')).catch(e => 'ERR ' + e)"))
    console.log('navigate:', JSON.stringify(await send('Page.navigate', { url })))
    console.log('app shell offline:', await waitFor("!!document.querySelector('.brand')", 8))
    console.log('state:', await js('JSON.stringify({url: location.href, rs: document.readyState, html: document.documentElement.outerHTML.slice(0, 300), sw: !!navigator.serviceWorker.controller})'))
    await addAndRecognize()
  }
  if (evalJs) console.log('eval:', JSON.stringify(await js(evalJs)))
  await sleep(500)
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  writeFileSync(out, Buffer.from(shot.data, 'base64'))
  console.log('→', out)
  if (errors.length) console.log('page errors:\n' + errors.join('\n'))
  ws.close()
} finally {
  chrome.kill()
}
