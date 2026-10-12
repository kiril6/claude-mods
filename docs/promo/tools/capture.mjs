// node capture.mjs <outdir> <fps> [t1,t2,...]: drives a page with window.seek(ms) and window.DURATION frame by
// frame over the Chrome DevTools Protocol, one PNG per frame. PAGE=path picks the page (default promo.html).
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
const [out, fpsArg, only] = process.argv.slice(2)
const fps = Number(fpsArg ?? 30)
mkdirSync(out, { recursive: true })
const profile = resolve(tmpdir(), 'promo-chrome') // a throwaway profile, never your own Chrome's
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=9337', `--user-data-dir=${profile}`, '--hide-scrollbars', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' })
const sleep = ms => new Promise(r => setTimeout(r, ms))
let pages
for (let i = 0; i < 50 && !pages; i++) { await sleep(200); pages = await fetch('http://127.0.0.1:9337/json/list').then(r => r.json()).catch(() => undefined) }
const ws = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r))
let id = 0
const waiting = new Map()
ws.addEventListener('message', m => { const d = JSON.parse(m.data); waiting.get(d.id)?.(d); waiting.delete(d.id) })
const send = (method, params = {}) => new Promise((r, j) => { const n = ++id; waiting.set(n, d => d.error ? j(new Error(JSON.stringify(d.error))) : r(d.result)); ws.send(JSON.stringify({ id: n, method, params })) })
try {
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1.5, mobile: false })
  await send('Page.enable')
  await send('Page.navigate', { url: `file://${resolve(process.env.PAGE ?? 'promo.html')}#still` })
  await sleep(1500)
  const dur = (await send('Runtime.evaluate', { expression: 'DURATION', returnByValue: true })).result.value
  const times = only ? only.split(',').map(Number) : Array.from({ length: Math.ceil(dur / 1000 * fps) }, (_, i) => i * 1000 / fps)
  for (const [i, t] of times.entries()) {
    await send('Runtime.evaluate', { expression: `seek(${t})` })
    const { data } = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(`${out}/${only ? `t${t}` : String(i).padStart(5, '0')}.png`, Buffer.from(data, 'base64'))
    if (i % 100 === 0) console.log(i, '/', times.length)
  }
} finally { chrome.kill(); ws.close() }
