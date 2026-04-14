const ALLOWED_HOSTS = new Set([
  // 把这里清空，或者填入你想允许代理的域名（如果不填，则允许所有域名）
])

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,HEAD,OPTIONS',
  'access-control-allow-headers': '*',
  'access-control-max-age': '86400',
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })

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
    // 强制清除不需要的参数，仅以目标 url 为 key
    cacheUrl.search = `?url=${encodeURIComponent(targetUrl.toString())}`
    const cacheRequest = new Request(cacheUrl.toString(), request)
    const cache = caches.default

    try {
      // 尝试从边缘节点缓存读取
      let response = await cache.match(cacheRequest)
      if (response) {
        // 如果命中缓存，打个标记
        const cachedHeaders = new Headers(response.headers)
        cachedHeaders.set('x-proxy-cache', 'HIT')
        return new Response(response.body, { status: response.status, headers: cachedHeaders })
      }

      const upstream = await fetch(targetUrl.toString(), {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'user-agent': 'Dart/2.14 (dart:io)', // 防拦截 UA
          accept: '*/*',
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
      })

      const headers = new Headers(upstream.headers)
      for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v)
      headers.delete('content-security-policy')
      headers.delete('content-security-policy-report-only')
      headers.delete('x-frame-options')
      
      // 针对 JSON 或 XML 文件缓存 1 小时，其他 API 接口缓存 5 分钟
      const isConfig = targetUrl.pathname.endsWith('.json') || targetUrl.pathname.endsWith('.txt')
      const ttl = isConfig ? 3600 : 300
      headers.set('cache-control', `public, max-age=${ttl}`)
      headers.set('x-proxy-cache', 'MISS')

      response = new Response(upstream.body, {
        status: upstream.status,
        headers,
      })

      // 将成功的响应异步写入缓存
      if (upstream.status === 200) {
        ctx.waitUntil(cache.put(cacheRequest, response.clone()))
      }

      return response
    } catch (e) {
      return new Response(`Proxy Error: ${e.message}`, { status: 502, headers: corsHeaders })
    }
  },
}

