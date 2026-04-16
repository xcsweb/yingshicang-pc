const ALLOWED_HOSTS = new Set([
  // 把这里清空，或者填入你想允许代理的域名（如果不填，则允许所有域名）
])

const isHttpAbsolute = (v) => /^https?:\/\//i.test(v)

const rewriteM3u8 = (raw, baseUrl) => {
  const fixUriInTag = (line) =>
    line.replace(/URI="([^"]+)"/gi, (_m, g1) => {
      const uri = String(g1 || '').trim()
      if (!uri || isHttpAbsolute(uri) || uri.startsWith('data:')) return `URI="${uri}"`
      return `URI="${new URL(uri, baseUrl).toString()}"`
    })

  return String(raw || '')
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed) return line
      if (trimmed.startsWith('#')) return fixUriInTag(line)
      if (isHttpAbsolute(trimmed) || trimmed.startsWith('data:')) return line
      return new URL(trimmed, baseUrl).toString()
    })
    .join('\n')
}

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,HEAD,OPTIONS',
  'access-control-allow-headers': '*',
  'access-control-max-age': '86400',
}

const isM3u8ByPath = (pathname) => String(pathname || '').toLowerCase().includes('.m3u8')
const isM3u8ByContentType = (ct) => {
  const v = String(ct || '').toLowerCase()
  return v.includes('application/vnd.apple.mpegurl') || v.includes('application/x-mpegurl') || v.includes('application/mpegurl')
}

const guessTtl = (targetUrl, ct, maybePlaylistText) => {
  const pathname = String(targetUrl?.pathname || '')
  const lower = pathname.toLowerCase()
  if (isM3u8ByPath(lower) || isM3u8ByContentType(ct)) {
    const text = String(maybePlaylistText || '')
    if (text.includes('#EXT-X-ENDLIST')) return 3600
    return 5
  }
  if (lower.endsWith('.ts') || lower.endsWith('.m4s') || lower.endsWith('.m4a') || lower.endsWith('.aac') || lower.endsWith('.mp3')) return 3600
  if (lower.endsWith('.key')) return 3600
  if (lower.endsWith('.mp4') || ct?.toLowerCase?.().includes('video/')) return 3600
  if (lower.endsWith('.json') || lower.endsWith('.txt')) return 3600
  return 300
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })

    const method = (request.method || 'GET').toUpperCase()
    if (method !== 'GET' && method !== 'HEAD') return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })

    const url = new URL(request.url)
    const target = url.searchParams.get('url') || ''
    if (!target) return new Response('Missing url', { status: 400, headers: corsHeaders })

    let targetUrl
    try {
      targetUrl = new URL(target)
    } catch {
      return new Response('Invalid url', { status: 400, headers: corsHeaders })
    }

    if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
      return new Response('Invalid protocol', { status: 400, headers: corsHeaders })
    }

    if (ALLOWED_HOSTS.size > 0 && !ALLOWED_HOSTS.has(targetUrl.host)) {
      return new Response('Host not allowed', { status: 403, headers: corsHeaders })
    }

    // 构建一个用于缓存的规范化 Request
    const cacheUrl = new URL(request.url)
    const range = request.headers.get('range') || ''
    cacheUrl.search = `?url=${encodeURIComponent(targetUrl.toString())}${range ? `&range=${encodeURIComponent(range)}` : ''}`
    const cacheRequest = new Request(cacheUrl.toString(), { method: 'GET' })
    const cache = caches.default

    try {
      let response = await cache.match(cacheRequest)
      if (response) {
        const cachedHeaders = new Headers(response.headers)
        cachedHeaders.set('x-proxy-cache', 'HIT')
        return method === 'HEAD' ? new Response(null, { status: response.status, headers: cachedHeaders }) : new Response(response.body, { status: response.status, headers: cachedHeaders })
      }

      const upstreamHeaders = {
        'user-agent': 'Dart/2.14 (dart:io)',
        accept: '*/*',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      }
      if (range) upstreamHeaders.range = range

      const upstream = await fetch(targetUrl.toString(), {
        method,
        redirect: 'follow',
        headers: upstreamHeaders,
      })

      const ct = upstream.headers.get('content-type') || ''
      const isM3u8 = !range && (isM3u8ByPath(targetUrl.pathname) || isM3u8ByContentType(ct))

      const headers = new Headers(upstream.headers)
      for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v)
      headers.delete('content-security-policy')
      headers.delete('content-security-policy-report-only')
      headers.delete('x-frame-options')
      headers.set('x-proxy-cache', 'MISS')

      let ttl = 300
      if (isM3u8) {
        const text = await upstream.text()
        const rewritten = rewriteM3u8(text, targetUrl)
        ttl = guessTtl(targetUrl, ct, text)
        headers.set('cache-control', `public, max-age=${ttl}`)
        headers.set('content-type', 'application/vnd.apple.mpegurl; charset=utf-8')
        response = new Response(rewritten, { status: upstream.status, headers })
      } else {
        ttl = guessTtl(targetUrl, ct)
        headers.set('cache-control', `public, max-age=${ttl}`)
        response = new Response(upstream.body, { status: upstream.status, headers })
      }

      if (method === 'GET' && (upstream.status === 200 || upstream.status === 206) && ttl > 0) {
        ctx.waitUntil(cache.put(cacheRequest, response.clone()))
      }

      return method === 'HEAD' ? new Response(null, { status: response.status, headers: response.headers }) : response
    } catch (e) {
      return new Response(`Proxy Error: ${e.message}`, { status: 502, headers: corsHeaders })
    }
  },
}
