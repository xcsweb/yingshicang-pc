import type { BrowserWindow as BrowserWindowType } from 'electron'
import pkg from 'electron'
const { app, BrowserWindow, ipcMain, net } = pkg
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindowType | null

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC || '', 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  createWindow()

  const normalizeUrl = (raw: string): string => {
    const input = (raw || '').trim()
    if (!input) return ''
    if (!/^https?:\/\//i.test(input)) return input
    try {
      return new URL(input).toString()
    } catch {
      return input
    }
  }

  const decodeBuffer = (buffer: ArrayBuffer): string => {
    const utf8 = new TextDecoder('utf-8').decode(buffer)
    let replacementCount = 0
    let privateUseCount = 0
    for (let i = 0; i < utf8.length; i++) {
      const code = utf8.charCodeAt(i)
      if (code === 0xfffd) replacementCount += 1
      if (code >= 0xe000 && code <= 0xf8ff) privateUseCount += 1
    }
    if (replacementCount < 10 && privateUseCount < 10) return utf8
    try {
      return new TextDecoder('gb18030').decode(buffer)
    } catch {
      return utf8
    }
  }

  const isHtmlLike = (text: string): boolean => {
    const trimmed = (text || '').trimStart()
    return /^<!doctype\s+html/i.test(trimmed) || /^<html/i.test(trimmed)
  }

  const extractJsonObjectFromText = (text: string): any => {
    const trimmed = (text || '').trimStart()
    if (!trimmed) throw new Error('Invalid JSON format')
    if (isHtmlLike(trimmed)) throw new Error('Invalid JSON format')
    try {
      return JSON.parse(trimmed)
    } catch {
      const objStart = text.indexOf('{')
      const arrStart = text.indexOf('[')
      const startCandidates = [objStart, arrStart].filter(i => i >= 0)
      if (!startCandidates.length) throw new Error('Invalid JSON format')
      const start = Math.min(...startCandidates)
      const isObj = start === objStart && (arrStart === -1 || objStart < arrStart)
      const end = isObj ? text.lastIndexOf('}') : text.lastIndexOf(']')
      if (end <= start) throw new Error('Invalid JSON format')
      const jsonText = text.slice(start, end + 1)
      return JSON.parse(jsonText)
    }
  }

  const extractCopyLinksFromHtml = (html: string): Array<{ name: string; url: string }> => {
    if (!html) return []
    const items: Array<{ name: string; url: string }> = []
    const seen = new Set<string>()
    const add = (name: string, url: string) => {
      const n = (name || '').trim()
      const u = (url || '').trim()
      if (!n || !u) return
      if (!/^https?:\/\//i.test(u)) return
      const k = `${n}::${u}`
      if (seen.has(k)) return
      seen.add(k)
      items.push({ name: n, url: u })
    }

    {
      const re = /copyLinkToClipboard\('([^']+)'\)[\s\S]*?>\s*([^<]+?)\s*<\/a>/g
      for (;;) {
        const m = re.exec(html)
        if (!m) break
        add(m[2], m[1])
      }
    }

    {
      const re = /data-clipboard-text\s*=\s*["']([^"']+)["'][\s\S]*?>\s*([^<]+?)\s*<\/a>/g
      for (;;) {
        const m = re.exec(html)
        if (!m) break
        add(m[2], m[1])
      }
    }

    return items
  }

  const rankCandidate = (pageUrl: string, item: { name: string; url: string }): number => {
    let score = 0
    const name = item.name.replace(/\s+/g, '')
    let target = ''
    let host = ''
    try {
      const u = new URL(pageUrl)
      host = u.host
      const segs = u.pathname.split('/').filter(Boolean)
      const last = segs.length ? segs[segs.length - 1] : ''
      target = last ? decodeURIComponent(last).replace(/\s+/g, '') : ''
    } catch {
      target = ''
      host = ''
    }

    if (target && (name === target || name.includes(target))) score += 200
    try {
      if (host && new URL(item.url).host === host) score += 50
    } catch {
    }
    const lower = item.url.toLowerCase()
    if (lower.endsWith('.json')) score += 30
    if (lower.includes('tvbox')) score += 20
    if (lower.includes('box')) score += 10
    return score
  }

  const fetchText = async (url: string): Promise<{ ok: boolean; status: number; text: string }> => {
    const normalized = normalizeUrl(url)
    const response = await net.fetch(normalized, {
      redirect: 'follow',
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    })
    const buffer = await response.arrayBuffer()
    const text = decodeBuffer(buffer)
    return { ok: response.ok, status: response.status, text }
  }

  const fetchConfig = async (url: string, depth = 0, visited?: Set<string>): Promise<any> => {
    const normalized = normalizeUrl(url)
    if (!normalized) throw new Error('Empty URL')
    const safeVisited = visited || new Set<string>()
    if (safeVisited.has(normalized)) throw new Error('Circular reference')
    safeVisited.add(normalized)

    const res = await fetchText(normalized)
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`)

    const text = res.text || ''
    if (isHtmlLike(text)) {
      if (depth >= 2) throw new Error('Invalid JSON format')
      const candidates = extractCopyLinksFromHtml(text)
        .sort((a, b) => rankCandidate(normalized, b) - rankCandidate(normalized, a))
        .map(i => i.url)
      for (const c of candidates.slice(0, 12)) {
        try {
          return await fetchConfig(c, depth + 1, safeVisited)
        } catch {
        }
      }
      throw new Error('Invalid JSON format')
    }

    return extractJsonObjectFromText(text)
  }

  ipcMain.handle('fetch-data', async (_, url: string) => {
    try {
      const data = await fetchConfig(url)
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })
})
