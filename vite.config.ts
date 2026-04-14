import { defineConfig } from 'vite'
import path from 'node:path'
import { Readable } from 'node:stream'
import net from 'node:net'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import renderer from 'vite-plugin-electron-renderer'
import { VitePWA } from 'vite-plugin-pwa'

const isPrivateIp = (ip: string): boolean => {
  if (net.isIP(ip) === 0) return false
  if (ip === '127.0.0.1' || ip === '0.0.0.0') return true
  if (ip.startsWith('10.')) return true
  if (ip.startsWith('192.168.')) return true
  const m = ip.match(/^172\.(\d+)\./)
  if (m) {
    const n = Number(m[1])
    if (n >= 16 && n <= 31) return true
  }
  return false
}

const isForbiddenHost = (hostname: string): boolean => {
  const host = (hostname || '').toLowerCase()
  if (!host) return true
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host.endsWith('.local')) return true
  if (isPrivateIp(host)) return true
  return false
}

const isHttpAbsolute = (v: string): boolean => /^https?:\/\//i.test(v)

const rewriteM3u8 = (raw: string, baseUrl: URL): string => {
  const fixUriInTag = (line: string): string =>
    line.replace(/URI="([^"]+)"/gi, (_m, g1: string) => {
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

const proxyMiddleware = () => ({
  name: 'local-proxy',
  configureServer(server: any) {
    server.middlewares.use('/proxy', async (req: any, res: any) => {
      const method = (req.method || 'GET').toUpperCase()
      if (method !== 'GET' && method !== 'HEAD') {
        res.statusCode = 405
        res.end('Method Not Allowed')
        return
      }

      const base = `http://${req.headers.host || 'localhost'}`
      const requestUrl = new URL(req.url || '', base)
      const target = requestUrl.searchParams.get('url') || ''
      const uaMode = (requestUrl.searchParams.get('ua') || '').toLowerCase()
      if (!target) {
        res.statusCode = 400
        res.end('Missing url')
        return
      }

      let targetUrl: URL
      try {
        targetUrl = new URL(target)
      } catch {
        res.statusCode = 400
        res.end('Invalid url')
        return
      }

      if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
        res.statusCode = 400
        res.end('Invalid protocol')
        return
      }

      if (isForbiddenHost(targetUrl.hostname)) {
        res.statusCode = 403
        res.end('Forbidden host')
        return
      }

      const headers: Record<string, string> = {}
      const accept = req.headers?.accept
      if (typeof accept === 'string') headers.accept = accept
      headers['accept-encoding'] = 'identity'
      const ua = req.headers?.['user-agent']
      if (uaMode === 'tvbox') {
        headers['user-agent'] = 'okhttp/3.15'
      } else if (typeof ua === 'string') {
        headers['user-agent'] = ua
      }
      const range = req.headers?.range
      if (typeof range === 'string') headers.range = range
      headers.referer = `${targetUrl.origin}/`

      let upstream: Response
      try {
        upstream = await fetch(targetUrl.toString(), { headers, redirect: 'follow' })
      } catch {
        res.statusCode = 502
        res.end('Bad Gateway')
        return
      }

      const ctLower = (upstream.headers.get('content-type') || '').toLowerCase()
      const isM3u8 =
        targetUrl.pathname.toLowerCase().includes('.m3u8') ||
        ctLower.includes('application/vnd.apple.mpegurl') ||
        ctLower.includes('application/x-mpegurl') ||
        ctLower.includes('application/mpegurl')

      if (method === 'GET' && isM3u8 && !headers.range) {
        const text = await upstream.text()
        const rewritten = rewriteM3u8(text, targetUrl)
        res.statusCode = upstream.status
        res.setHeader('content-type', 'application/vnd.apple.mpegurl; charset=utf-8')
        res.end(rewritten)
        return
      }

      res.statusCode = upstream.status
      const ctHeader = upstream.headers.get('content-type')
      if (ctHeader) res.setHeader('content-type', ctHeader)
      const cd = upstream.headers.get('content-disposition')
      if (cd) res.setHeader('content-disposition', cd)
      const cl = upstream.headers.get('content-length')
      if (cl) res.setHeader('content-length', cl)
      const ar = upstream.headers.get('accept-ranges')
      if (ar) res.setHeader('accept-ranges', ar)
      const cr = upstream.headers.get('content-range')
      if (cr) res.setHeader('content-range', cr)

      if (method === 'HEAD') {
        res.end()
        return
      }

      if (!upstream.body) {
        res.end()
        return
      }

      const stream = Readable.fromWeb(upstream.body as any)
      stream.on('error', () => {
        if (!res.headersSent) res.statusCode = 502
        res.end()
      })
      stream.pipe(res)
    })
  },
  configurePreviewServer(server: any) {
    server.middlewares.use('/proxy', async (req: any, res: any) => {
      const method = (req.method || 'GET').toUpperCase()
      if (method !== 'GET' && method !== 'HEAD') {
        res.statusCode = 405
        res.end('Method Not Allowed')
        return
      }

      const base = `http://${req.headers.host || 'localhost'}`
      const requestUrl = new URL(req.url || '', base)
      const target = requestUrl.searchParams.get('url') || ''
      const uaMode = (requestUrl.searchParams.get('ua') || '').toLowerCase()
      if (!target) {
        res.statusCode = 400
        res.end('Missing url')
        return
      }

      let targetUrl: URL
      try {
        targetUrl = new URL(target)
      } catch {
        res.statusCode = 400
        res.end('Invalid url')
        return
      }

      if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
        res.statusCode = 400
        res.end('Invalid protocol')
        return
      }

      if (isForbiddenHost(targetUrl.hostname)) {
        res.statusCode = 403
        res.end('Forbidden host')
        return
      }

      const headers: Record<string, string> = {}
      const accept = req.headers?.accept
      if (typeof accept === 'string') headers.accept = accept
      headers['accept-encoding'] = 'identity'
      const ua = req.headers?.['user-agent']
      if (uaMode === 'tvbox') {
        headers['user-agent'] = 'okhttp/3.15'
      } else if (typeof ua === 'string') {
        headers['user-agent'] = ua
      }
      const range = req.headers?.range
      if (typeof range === 'string') headers.range = range
      headers.referer = `${targetUrl.origin}/`

      let upstream: Response
      try {
        upstream = await fetch(targetUrl.toString(), { headers, redirect: 'follow' })
      } catch {
        res.statusCode = 502
        res.end('Bad Gateway')
        return
      }

      const ctLower = (upstream.headers.get('content-type') || '').toLowerCase()
      const isM3u8 =
        targetUrl.pathname.toLowerCase().includes('.m3u8') ||
        ctLower.includes('application/vnd.apple.mpegurl') ||
        ctLower.includes('application/x-mpegurl') ||
        ctLower.includes('application/mpegurl')

      if (method === 'GET' && isM3u8 && !headers.range) {
        const text = await upstream.text()
        const rewritten = rewriteM3u8(text, targetUrl)
        res.statusCode = upstream.status
        res.setHeader('content-type', 'application/vnd.apple.mpegurl; charset=utf-8')
        res.end(rewritten)
        return
      }
      res.statusCode = upstream.status
      const ctHeader = upstream.headers.get('content-type')
      if (ctHeader) res.setHeader('content-type', ctHeader)
      const cd = upstream.headers.get('content-disposition')
      if (cd) res.setHeader('content-disposition', cd)
      const cl = upstream.headers.get('content-length')
      if (cl) res.setHeader('content-length', cl)
      const ar = upstream.headers.get('accept-ranges')
      if (ar) res.setHeader('accept-ranges', ar)
      const cr = upstream.headers.get('content-range')
      if (cr) res.setHeader('content-range', cr)

      if (method === 'HEAD') {
        res.end()
        return
      }

      if (!upstream.body) {
        res.end()
        return
      }

      const stream = Readable.fromWeb(upstream.body as any)
      stream.on('error', () => {
        if (!res.headersSent) res.statusCode = 502
        res.end()
      })
      stream.pipe(res)
    })
  },
})

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // Use relative path for Electron, but repository name for GitHub Pages
  base: mode === 'githubpages' ? '/yingshicang-pc/' : './',
  plugins: [
    proxyMiddleware(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'My App',
        short_name: 'App',
        description: 'My App Description',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    }),
    // Only include electron plugin when not building for GitHub Pages
    ...(mode !== 'githubpages' ? [
      electron({
        main: {
          entry: 'electron/main.ts',
        },
        preload: {
          input: path.join(__dirname, 'electron/preload.ts'),
        },
      }),
      renderer()
    ] : [])
  ],
}))
