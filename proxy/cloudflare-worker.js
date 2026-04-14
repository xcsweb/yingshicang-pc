const ALLOWED_HOSTS = new Set([
  'xn--i8sz35d1yr.top',
  '盒子迷.top',
  'tv.nxog.top',
  'xn--4kq62z5rby2qupq9ub.top',
])

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,HEAD,OPTIONS',
  'access-control-allow-headers': '*',
  'access-control-max-age': '86400',
}

export default {
  async fetch(request) {
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

    const upstream = await fetch(targetUrl.toString(), {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
        referer: `${targetUrl.origin}/`,
      },
    })

    const headers = new Headers(upstream.headers)
    for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v)
    headers.delete('content-security-policy')
    headers.delete('content-security-policy-report-only')
    headers.delete('x-frame-options')

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    })
  },
}

