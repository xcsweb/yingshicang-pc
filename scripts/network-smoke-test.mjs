const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now())

const withTimeout = async (promise, ms) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    const result = await promise(controller.signal)
    return result
  } finally {
    clearTimeout(timer)
  }
}

const fetchText = async (url, { timeoutMs = 8000, headers = {} } = {}) => {
  const start = now()
  try {
    const res = await withTimeout(
      (signal) =>
        fetch(url, {
          method: 'GET',
          redirect: 'follow',
          signal,
          headers,
        }),
      timeoutMs,
    )
    const ms = Math.round(now() - start)
    const text = await res.text()
    const ct = res.headers.get('content-type') || ''
    const cache = res.headers.get('x-proxy-cache') || ''
    return { ok: res.ok, status: res.status, ms, ct, cache, text }
  } catch (e) {
    const ms = Math.round(now() - start)
    const name = e?.name || 'Error'
    const message = e?.message || String(e)
    return { ok: false, status: 0, ms, ct: '', cache: '', text: '', error: `${name}: ${message}` }
  }
}

const buildWorkerUrl = (workerBase, targetUrl) => {
  const base = workerBase.includes('?') ? workerBase : `${workerBase}?`
  const sep = base.endsWith('?') || base.endsWith('&') ? '' : '&'
  return `${base}${sep}url=${encodeURIComponent(targetUrl)}`
}

const isHtmlLike = (text) => {
  const t = (text || '').trimStart().toLowerCase()
  return t.startsWith('<!doctype html') || t.startsWith('<html')
}

const printResult = (title, r) => {
  const head = r.text ? r.text.slice(0, 80).replace(/\s+/g, ' ') : ''
  const extra = []
  if (r.ct) extra.push(`ct=${r.ct}`)
  if (r.cache) extra.push(`cache=${r.cache}`)
  if (r.error) extra.push(r.error)
  console.log(`${title} -> ok=${r.ok} status=${r.status} ms=${r.ms}${extra.length ? ` (${extra.join(', ')})` : ''}`)
  if (head) console.log(`  preview: ${head}`)
}

const workerBase = process.env.WORKER_BASE || 'https://yingshi-proxy.15123953025.workers.dev'
const publicProxies = [
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
]

const configUrls = [
  'https://cdn.jsdelivr.net/gh/dxawi/0@main/0.json',
  'https://cdn.jsdelivr.net/gh/jyoketsu/tv@main/m.json',
]

const siteListUrls = [
  'https://bfzyapi.com/api.php/provide/vod?ac=list',
  'http://cj.lziapi.com/api.php/provide/vod/?ac=list',
  'https://api.apibdzy.com/api.php/provide/vod/?ac=list',
]

console.log(`WORKER_BASE=${workerBase}`)

for (const u of configUrls) {
  const r = await fetchText(buildWorkerUrl(workerBase, u), { timeoutMs: 8000 })
  printResult(`[worker][config] ${u}`, r)
}

for (const u of siteListUrls) {
  const r = await fetchText(buildWorkerUrl(workerBase, u), { timeoutMs: 8000 })
  printResult(`[worker][api] ${u}`, r)
}

for (const u of configUrls) {
  for (const f of publicProxies) {
    const url = f(u)
    const r = await fetchText(url, { timeoutMs: 8000 })
    const label = url.startsWith('https://api.allorigins') ? 'allorigins' : 'codetabs'
    printResult(`[public:${label}][config] ${u}`, r)
  }
}

for (const u of siteListUrls) {
  for (const f of publicProxies) {
    const url = f(u)
    const r = await fetchText(url, { timeoutMs: 8000 })
    const label = url.startsWith('https://api.allorigins') ? 'allorigins' : 'codetabs'
    printResult(`[public:${label}][api] ${u}`, r)
  }
}

console.log('done')
