import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDataSourceStore, type Site } from '../store/dataSource'
import { fetchData } from '../utils/request'

const PRESET_URLS = [
  { name: 'dxawi', url: 'https://fastly.jsdelivr.net/gh/dxawi/0@main/0.json' },
  { name: 'jyoketsu', url: 'https://fastly.jsdelivr.net/gh/jyoketsu/tv@main/m.json' },
  // 注：以下大部分盒子迷源为 type=3 爬虫源，当前项目不支持。
  // 仅保留一个作为直播示例，或你可以添加自己维护的可用 CMS 源。
  { name: '盒子迷-直播', url: 'https://盒子迷.top/ZB' },
]

type SpeedTestStatus = 'idle' | 'testing' | 'ok' | 'fail'
type SpeedTestResult = { status: SpeedTestStatus; ms?: number; error?: string; usefulSites?: number }

type AnyObject = Record<string, any>

const safeNow = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now()
  return Date.now()
}

const asMs = (start: number, end: number): number => Math.max(0, Math.round(end - start))

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

const isHttpUrl = (raw: string): boolean => {
  const input = (raw || '').trim()
  if (!input) return false
  try {
    const u = new URL(input)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

const safeArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

const isLikelyVideoSite = (site: Site): boolean => {
  const name = (site?.name || '').trim()
  const api = (site?.api || site?.url || '').trim()
  if (!name || !api) return false
  if (site.type !== 0 && site.type !== 1) return false
  if (!isHttpUrl(api) && !api.includes('mock')) return false

  const lowerApi = api.toLowerCase()
  if (lowerApi.includes('csp_')) return false
  if (!lowerApi.includes('api.php')) return false
  if (!lowerApi.includes('provide')) return false
  if (!lowerApi.includes('vod')) return false
  if (/(^|[?&])at=xml\b/i.test(api)) return false
  if (/at\/xml/i.test(lowerApi)) return false
  return true
}

/**
 * 计算配置里可用于首页的站点数量（尽量避免把仅蜘蛛/网盘类站点当成可用）
 */
const countUsefulSitesFromConfig = (data: any): number => {
  const sites = extractSitesFromConfig(data)
  if (!sites.length) return 0
  const uniq = uniqSitesByKey(sites)
  return uniq.filter(isLikelyVideoSite).length
}

const rankSite = (site: Site): number => {
  let score = 0
  if (site.searchable) score += 10
  if (site.quickSearch) score += 5
  if (site.filterable) score += 5
  if (isLikelyVideoSite(site)) score += 50
  return score
}

const describeSiteStats = (sites: Site[]): string => {
  const types: Record<string, number> = {}
  let httpApiCount = 0
  let cspCount = 0
  for (const s of sites) {
    const t = String((s as any)?.type ?? 'unknown')
    types[t] = (types[t] || 0) + 1
    const api = (s.api || s.url || '').trim()
    if (api && isHttpUrl(api)) httpApiCount += 1
    if ((api || '').toLowerCase().includes('csp_')) cspCount += 1
  }
  const topTypes = Object.entries(types)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, v]) => `${k}:${v}`)
    .join(', ')
  return `总站点 ${sites.length}，http站点 ${httpApiCount}，csp站点 ${cspCount}，type分布 ${topTypes || '无'}`
}

const logSitePick = (label: string, uniq: Site[], filtered: Site[]) => {
  const pick = (sites: Site[]) =>
    sites.slice(0, 5).map(s => ({ key: s.key, name: s.name, type: s.type, api: s.api || s.url, ext: s.ext }))
  const types: Record<string, number> = {}
  let httpCount = 0
  for (const s of uniq) {
    const k = String(s.type)
    types[k] = (types[k] || 0) + 1
    const api = (s.api || s.url || '').trim()
    if (api && isHttpUrl(api)) httpCount += 1
  }
  console.log('Settings: sites picked', label, JSON.stringify({ total: uniq.length, filtered: filtered.length, httpCount, types, top: pick(filtered.length ? filtered : uniq) }))
}

const extractSitesFromConfig = (data: any): Site[] => {
  if (!data) return []
  if (Array.isArray(data)) {
    const merged: Site[] = []
    for (const item of data) merged.push(...extractSitesFromConfig(item))
    return merged
  }

  const obj = data as AnyObject
  const videoSites = safeArray<Site>(obj?.video?.sites)
  if (videoSites.length) return videoSites
  const sites = safeArray<Site>(obj?.sites)
  if (sites.length) return sites
  const urlsAsSites = safeArray<Site>(obj?.urls)
  if (urlsAsSites.length) return urlsAsSites

  const singleSite = obj?.sites && typeof obj.sites === 'object' && !Array.isArray(obj.sites) ? (obj.sites as Site) : null
  if (singleSite?.key) return [singleSite]
  const singleUrlSite = obj?.urls && typeof obj.urls === 'object' && !Array.isArray(obj.urls) ? (obj.urls as Site) : null
  if (singleUrlSite?.key) return [singleUrlSite]

  return []
}

const extractUrlListFromConfig = (data: any): string[] => {
  if (!data) return []
  if (Array.isArray(data)) return safeArray<string>(data).filter(isHttpUrl).map(normalizeUrl)
  const obj = data as AnyObject

  const urls = safeArray<any>(obj?.urls)
  if (urls.length) {
    if (typeof urls[0] === 'string') return urls.filter((s: any) => typeof s === 'string').filter(isHttpUrl).map(normalizeUrl)
    if (typeof urls[0] === 'object') {
      return urls.map((u: any) => u?.url).filter((s: any) => typeof s === 'string').filter(isHttpUrl).map(normalizeUrl)
    }
  }

  const stores = safeArray<any>(obj?.stores)
  if (stores.length) {
    return stores.map((u: any) => u?.url).filter((s: any) => typeof s === 'string').filter(isHttpUrl).map(normalizeUrl)
  }

  return []
}

const uniqSitesByKey = (sites: Site[]): Site[] => {
  const used = new Set<string>()
  return sites.map((site, index) => {
    const base = (site?.key || site?.name || `site_${index}`).trim()
    let key = base || `site_${index}`
    let suffix = 1
    while (used.has(key)) {
      key = `${base}_${suffix}`
      suffix += 1
    }
    used.add(key)
    return { ...site, key }
  })
}

const extractMappedUrlFromCopyPage = (pageUrl: string, html: string): string => {
  if (!pageUrl || !html) return ''
  let targetName = ''
  try {
    const u = new URL(pageUrl)
    const segs = u.pathname.split('/').filter(Boolean)
    const last = segs.length ? segs[segs.length - 1] : ''
    targetName = last ? decodeURIComponent(last).trim() : ''
  } catch {
    return ''
  }
  if (!targetName) return ''

  const map = new Map<string, string>()
  const re = /copyLinkToClipboard\('([^']+)'\)[\s\S]*?>\s*([^<]+?)\s*<\/a>/g
  for (;;) {
    const m = re.exec(html)
    if (!m) break
    const url = (m[1] || '').trim()
    const name = (m[2] || '').trim()
    if (url && name) map.set(name, url)
  }

  const exact = map.get(targetName)
  if (exact) return exact
  const compactTarget = targetName.replace(/\s+/g, '')
  if (!compactTarget) return ''
  for (const [name, url] of map.entries()) {
    if (name.replace(/\s+/g, '') === compactTarget) return url
  }
  return ''
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
    const key = `${n}::${u}`
    if (seen.has(key)) return
    seen.add(key)
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

const isLikelyLiveList = (text: string): boolean => {
  const t = (text || '').trim()
  if (!t) return false
  if (/\#genre\#/i.test(t)) return true
  if (/(^|,)\s*CCTV\d+/i.test(t)) return true
  const hasHttp = /https?:\/\//i.test(t)
  const looksLikeCsv = hasHttp && t.includes(',') && !t.includes('{') && !t.includes('[')
  return looksLikeCsv
}

const runPool = async <T,>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> => {
  const safeLimit = Math.max(1, Math.floor(limit))
  const results: T[] = new Array(tasks.length)
  let nextIndex = 0

  const worker = async () => {
    for (;;) {
      const current = nextIndex
      nextIndex += 1
      if (current >= tasks.length) return
      results[current] = await tasks[current]()
    }
  }

  const workers = Array.from({ length: Math.min(safeLimit, tasks.length) }, () => worker())
  await Promise.all(workers)
  return results
}

const createSpeedTester = (timeoutMs: number) => async (url: string): Promise<SpeedTestResult> => {
  if (!url) return { status: 'fail', error: 'Empty URL' }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(1_000, timeoutMs))

  let start = safeNow()
  console.log('Settings: speed test start', url)
  try {
    const result = await fetchData<any>(normalizeUrl(url), { signal: controller.signal, noCache: true })
    
    if (result.success) {
      const usefulSites = countUsefulSitesFromConfig(result.data)
      const sites = extractSitesFromConfig(result.data)
      const urlCount = extractUrlListFromConfig(result.data).length
      
      let finalMs = asMs(start, safeNow())
      
      if (sites.length > 0) {
        const testSite = sites.find(isLikelyVideoSite) || sites[0]
        const apiUrl = testSite.api || testSite.url
        if (apiUrl && isHttpUrl(apiUrl)) {
          const listUrl = buildHomeListUrl(apiUrl)
          if (listUrl) {
            start = safeNow()
            const realResult = await fetchData<any>(listUrl, { signal: controller.signal, noCache: true })
            if (realResult.success && isUsableHomeResponse(realResult.data)) {
              finalMs = asMs(start, safeNow())
            } else {
              return { status: 'fail', ms: finalMs, error: '站点探测失败' }
            }
          }
        }
      }

      if (sites.length > 0 || urlCount > 0) {
        console.log('Settings: speed test ok', url, finalMs)
        return { status: 'ok', ms: finalMs, usefulSites }
      }
      console.log('Settings: speed test invalid config', url, finalMs)
      return { status: 'fail', ms: finalMs, error: 'Invalid config' }
    }
    const ms = asMs(start, safeNow())
    console.log('Settings: speed test fail', url, ms, result.error)
    return { status: 'fail', ms, error: result.error || 'Failed' }
  } catch (err: any) {
    const ms = asMs(start, safeNow())
    const message = err?.name === 'AbortError' ? 'Timeout' : (err?.message || 'Failed')
    console.log('Settings: speed test error', url, ms, message)
    return { status: 'fail', ms, error: message }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 校验站点是否能用于首页（请求 ac=list，至少能返回 class 或 list）
 */
const isUsableHomeResponse = (data: any): boolean => {
  const cls = data?.class
  const lst = data?.list
  if (Array.isArray(cls) && cls.length > 0) return true
  if (Array.isArray(lst) && lst.length > 0) return true
  return false
}

const buildHomeListUrl = (apiUrl: string): string => {
  const raw = (apiUrl || '').trim()
  if (!raw) return ''
  if (!isHttpUrl(raw)) return ''
  const url = new URL(raw)
  url.searchParams.set('ac', 'list')
  url.searchParams.delete('wd')
  url.searchParams.delete('t')
  url.searchParams.delete('pg')
  url.searchParams.delete('ids')
  return url.toString()
}

const verifySiteUsableForHome = async (site: Site, timeoutMs: number): Promise<boolean> => {
  if (!isLikelyVideoSite(site)) return false
  const apiUrl = (site.api || site.url || '').trim()
  const listUrl = buildHomeListUrl(apiUrl)
  if (!listUrl) return false

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(1_000, timeoutMs))
  const start = safeNow()
  console.log('Settings: verify site start', site.key, site.name, listUrl)
  const result = await fetchData<any>(listUrl, { signal: controller.signal })
  clearTimeout(timer)
  const ms = asMs(start, safeNow())
  if (!result.success) {
    console.log('Settings: verify site fail', site.key, site.name, ms, result.error)
    return false
  }
  const ok = isUsableHomeResponse(result.data)
  console.log('Settings: verify site done', site.key, site.name, ms, ok)
  return ok
}

const pickVerifiedSites = async (candidates: Site[]): Promise<Site[]> => {
  const maxCheck = Math.min(10, candidates.length)
  if (maxCheck <= 0) return []
  const slice = candidates.slice(0, maxCheck)
  const tasks = slice.map(s => async () => ({ site: s, ok: await verifySiteUsableForHome(s, 6_000) }))
  const results = await runPool(tasks, 2)
  const verified = results.filter(r => r.ok).map(r => r.site)
  console.log('Settings: verified sites', JSON.stringify({ checked: slice.length, ok: verified.length, top: verified.slice(0, 5).map(s => ({ key: s.key, name: s.name, api: s.api || s.url })) }))
  return verified
}

const Settings: React.FC = () => {
  const navigate = useNavigate()
  const { url: storedUrl, sites, setUrl, setSites } = useDataSourceStore()
  
  const [inputUrl, setInputUrl] = useState(storedUrl || PRESET_URLS[0].url)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [speedTesting, setSpeedTesting] = useState(false)
  const [speedResults, setSpeedResults] = useState<Record<string, SpeedTestResult>>({})
  const [siteSpeedResults, setSiteSpeedResults] = useState<Record<string, SpeedTestResult>>({})
  const [multiProgress, setMultiProgress] = useState<{ done: number; total: number } | null>(null)
  const httpProxy = typeof import.meta !== 'undefined' ? String((import.meta as any).env?.VITE_HTTP_PROXY || '').trim() : ''

  const fastestPreset = useMemo(() => {
    let bestUrl = ''
    let bestMs = Number.POSITIVE_INFINITY
    for (const preset of PRESET_URLS) {
      const r = speedResults[preset.url]
      if (!r || r.status !== 'ok' || typeof r.ms !== 'number') continue
      if (r.ms < bestMs) {
        bestMs = r.ms
        bestUrl = preset.url
      }
    }
    return bestUrl ? { url: bestUrl, ms: bestMs } : null
  }, [speedResults])

  const handlePresetClick = (url: string) => {
    setInputUrl(url)
    handleSave(url)
  }

  const loadSitesFromUrl = async (url: string, depth = 0, visited?: Set<string>): Promise<Site[]> => {
    const normalized = normalizeUrl(url)
    if (!normalized || !isHttpUrl(normalized)) return []
    const safeVisited = visited || new Set<string>()
    if (safeVisited.has(normalized)) return []
    safeVisited.add(normalized)

    const result = await fetchData<any>(normalized)
    if (result.success) return extractSitesFromConfig(result.data)
    if (depth >= 2) return []

    try {
      const nextSites = await tryLoadMultiFromText(normalized, depth + 1, safeVisited)
      return nextSites
    } catch {
      return []
    }
  }

  const tryLoadMultiFromText = async (url: string, depth = 0, visited?: Set<string>): Promise<Site[]> => {
    const normalized = normalizeUrl(url)
    if (!normalized || !isHttpUrl(normalized)) return []

    const useLocalProxy = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV)
    const contents = await (async () => {
      if (useLocalProxy) {
        const response = await fetch(`/proxy?ua=tvbox&url=${encodeURIComponent(normalized)}`)
        if (!response.ok) return ''
        const decode = (buffer: ArrayBuffer, encoding: string): string => {
          try {
            return new TextDecoder(encoding).decode(buffer)
          } catch {
            return new TextDecoder('utf-8').decode(buffer)
          }
        }
        const countReplacement = (s: string): number => {
          let n = 0
          for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 0xfffd) n += 1
          return n
        }
        const countPrivateUse = (s: string): number => {
          let n = 0
          for (let i = 0; i < s.length; i++) {
            const code = s.charCodeAt(i)
            if (code >= 0xe000 && code <= 0xf8ff) n += 1
          }
          return n
        }
        const buffer = await response.arrayBuffer()
        const utf8 = decode(buffer, 'utf-8')
        const replacementCount = countReplacement(utf8)
        const privateUseCount = countPrivateUse(utf8)
        return replacementCount >= 10 || privateUseCount >= 10 ? decode(buffer, 'gb18030') : utf8
      }
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(normalized)}`
      const response = await fetch(proxyUrl)
      if (!response.ok) return ''
      const json = (await response.json()) as AnyObject
      return typeof json?.contents === 'string' ? json.contents : ''
    })()
    if (!contents) return []
    if (isLikelyLiveList(contents)) {
      throw new Error('该地址疑似直播源列表，当前仅支持影视站点配置')
    }

    const mappedUrl = extractMappedUrlFromCopyPage(normalized, contents)
    if (mappedUrl) {
      const mappedSites = await loadSitesFromUrl(mappedUrl, depth, visited)
      if (mappedSites.length) return mappedSites
    }

    const copyLinks = extractCopyLinksFromHtml(contents)
    if (copyLinks.length) {
      let host = ''
      try {
        host = new URL(normalized).host
      } catch {
        host = ''
      }
      const targetName = (() => {
        try {
          const u = new URL(normalized)
          const segs = u.pathname.split('/').filter(Boolean)
          const last = segs.length ? segs[segs.length - 1] : ''
          return last ? decodeURIComponent(last).trim() : ''
        } catch {
          return ''
        }
      })()
      const normalizedTarget = targetName.replace(/\s+/g, '')

      const score = (item: { name: string; url: string }): number => {
        let s = 0
        const n = item.name.replace(/\s+/g, '')
        if (normalizedTarget && (n === normalizedTarget || n.includes(normalizedTarget))) s += 200
        if (host) {
          try {
            if (new URL(item.url).host === host) s += 50
          } catch {
          }
        }
        const lower = item.url.toLowerCase()
        if (lower.endsWith('.json')) s += 30
        if (lower.includes('tvbox')) s += 20
        if (lower.includes('box')) s += 10
        return s
      }

      const candidates = [...copyLinks]
        .sort((a, b) => score(b) - score(a))
        .map(i => i.url)

      const maxTry = Math.min(12, candidates.length)
      for (let i = 0; i < maxTry; i++) {
        const candidateUrl = candidates[i]
        if (!candidateUrl || normalizeUrl(candidateUrl) === normalized) continue
        const sites = await loadSitesFromUrl(candidateUrl, depth, visited)
        if (sites.length) return sites
      }
    }

    const rawLines = contents.split(/\r?\n/)
    const urls = rawLines
      .map(l => l.trim())
      .filter(Boolean)
      .filter(l => !l.startsWith('#') && !l.startsWith('//'))
      .map(l => {
        const parts = l.split(/[,\s$]+/).filter(Boolean)
        const candidate = parts.length ? parts[parts.length - 1] : ''
        return normalizeUrl(candidate)
      })
      .filter(isHttpUrl)

    if (!urls.length) return []

    setMultiProgress({ done: 0, total: urls.length })
    const tasks = urls.map(u => async () => {
      const sites = await loadSitesFromUrl(u, depth, visited)
      setMultiProgress(prev => (prev ? { ...prev, done: Math.min(prev.total, prev.done + 1) } : prev))
      return sites
    })
    const results = await runPool(tasks, 3)
    setMultiProgress(null)
    return results.flat()
  }

  const runSpeedTestAll = async (): Promise<Record<string, SpeedTestResult> | null> => {
    if (speedTesting || loading) return null

    setSpeedTesting(true)
    setSpeedResults(prev => {
      const next: Record<string, SpeedTestResult> = { ...prev }
      for (const preset of PRESET_URLS) next[preset.url] = { status: 'testing' }
      return next
    })
    setSiteSpeedResults(() => {
      const next: Record<string, SpeedTestResult> = {}
      const slice = sites.slice(0, Math.min(15, sites.length))
      for (const s of slice) next[s.key] = { status: 'testing' }
      return next
    })

    const tester = createSpeedTester(8_000)
    const tasks = PRESET_URLS.map(p => async () => ({ url: p.url, result: await tester(p.url) }))
    const results = await runPool(tasks, 3)

    const next: Record<string, SpeedTestResult> = {}
    for (const item of results) next[item.url] = item.result
    setSpeedResults(prev => ({ ...prev, ...next }))

    const siteTester = async (site: Site): Promise<SpeedTestResult> => {
      const apiUrl = (site.api || site.url || '').trim()
      const listUrl = buildHomeListUrl(apiUrl)
      if (!listUrl) return { status: 'fail', error: 'Invalid API' }
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 8_000)
      const start = safeNow()
      try {
        const res = await fetchData<any>(listUrl, { signal: controller.signal, noCache: true })
        const ms = asMs(start, safeNow())
        if (!res.success) return { status: 'fail', ms, error: res.error || 'Failed' }
        if (!isUsableHomeResponse(res.data)) return { status: 'fail', ms, error: 'Invalid response' }
        return { status: 'ok', ms }
      } catch (e: any) {
        const ms = asMs(start, safeNow())
        const message = e?.name === 'AbortError' ? 'Timeout' : (e?.message || 'Failed')
        return { status: 'fail', ms, error: message }
      } finally {
        clearTimeout(timer)
      }
    }

    const slice = sites.slice(0, Math.min(15, sites.length))
    if (slice.length) {
      const siteTasks = slice.map(s => async () => ({ key: s.key, result: await siteTester(s) }))
      const siteResults = await runPool(siteTasks, 3)
      setSiteSpeedResults(prev => {
        const merged = { ...prev }
        for (const r of siteResults) merged[r.key] = r.result
        return merged
      })
    }

    setSpeedTesting(false)
    return next
  }

  const pickFastestAndSave = async () => {
    if (speedTesting || loading) return

    const hasAnyOk = PRESET_URLS.some(p => speedResults[p.url]?.status === 'ok')
    const latest = hasAnyOk ? null : await runSpeedTestAll()
    const base = latest ? { ...speedResults, ...latest } : speedResults

    const best = (() => {
      let bestUrl = ''
      let bestMs = Number.POSITIVE_INFINITY
      const pick = (onlyUseful: boolean) => {
        bestUrl = ''
        bestMs = Number.POSITIVE_INFINITY
        for (const preset of PRESET_URLS) {
          const r = base[preset.url]
          if (!r || r.status !== 'ok' || typeof r.ms !== 'number') continue
          if (onlyUseful && (!r.usefulSites || r.usefulSites <= 0)) continue
          if (r.ms < bestMs) {
            bestMs = r.ms
            bestUrl = preset.url
          }
        }
        return bestUrl
      }
      const useful = pick(true)
      if (useful) return useful
      const anyOk = pick(false)
      return anyOk ? anyOk : ''
    })()

    if (!best) return
    setInputUrl(best)
    await handleSave(best)
  }

  const handleSave = async (urlToSave?: any) => {
    const targetUrl = typeof urlToSave === 'string' ? urlToSave : inputUrl
    if (!targetUrl) return
    
    setLoading(true)
    setError(null)
    
    try {
      const normalizedTargetUrl = normalizeUrl(targetUrl)
      console.log("Settings: fetching data from", normalizedTargetUrl)
      if (typeof window !== 'undefined' && window.location.hostname === 'localhost' && targetUrl === 'http://mock.api') {
          console.log("Settings: Setting local mock data")
          setUrl(targetUrl)
          setSites([{ key: "mock1", name: "Mock Site 1", type: 1, api: "http://mock.api", url: "http://mock.api" }])
          setLoading(false)
          return
      }
      
      const result = await fetchData<any>(normalizedTargetUrl)
      console.log("Settings: fetch result", result)

      if (!result.success) {
        const multiSites = await tryLoadMultiFromText(normalizedTargetUrl)
        if (multiSites.length) {
          setUrl(normalizedTargetUrl)
          const uniq = uniqSitesByKey(multiSites)
          const filtered = uniq.filter(isLikelyVideoSite).sort((a, b) => rankSite(b) - rankSite(a))
          logSitePick('multi-text', uniq, filtered)
          if (!filtered.length) throw new Error(`该数据源未包含可用于首页的站点（${describeSiteStats(uniq)}）`)
          const verified = await pickVerifiedSites(filtered)
          if (!verified.length) throw new Error(`该数据源未包含可用于首页的站点（已过滤后站点数 ${filtered.length}）`)
          setSites(verified)
          return
        }
        throw new Error(result.error || '解析数据源失败')
      }

      const data = result.data
      const directSites = extractSitesFromConfig(data)
      if (directSites.length) {
        setUrl(normalizedTargetUrl)
        const uniq = uniqSitesByKey(directSites)
        const filtered = uniq.filter(isLikelyVideoSite).sort((a, b) => rankSite(b) - rankSite(a))
        logSitePick('direct', uniq, filtered)
        if (!filtered.length) throw new Error(`该数据源未包含可用于首页的站点（${describeSiteStats(uniq)}）`)
        const verified = await pickVerifiedSites(filtered)
        if (!verified.length) throw new Error(`该数据源未包含可用于首页的站点（已过滤后站点数 ${filtered.length}）`)
        setSites(verified)
        return
      }

      const urlList = extractUrlListFromConfig(data)
      if (urlList.length) {
        setMultiProgress({ done: 0, total: urlList.length })
        const tasks = urlList.map(u => async () => {
          const sites = await loadSitesFromUrl(u)
          setMultiProgress(prev => (prev ? { ...prev, done: Math.min(prev.total, prev.done + 1) } : prev))
          return sites
        })
        const results = await runPool(tasks, 3)
        setMultiProgress(null)
        const merged = results.flat()
        if (merged.length) {
          setUrl(normalizedTargetUrl)
          const uniq = uniqSitesByKey(merged)
          const filtered = uniq.filter(isLikelyVideoSite).sort((a, b) => rankSite(b) - rankSite(a))
          logSitePick('multi-json', uniq, filtered)
          if (!filtered.length) throw new Error(`该数据源未包含可用于首页的站点（${describeSiteStats(uniq)}）`)
          const verified = await pickVerifiedSites(filtered)
          if (!verified.length) throw new Error(`该数据源未包含可用于首页的站点（已过滤后站点数 ${filtered.length}）`)
          setSites(verified)
          return
        }
      }
      
      throw new Error('解析数据源失败')
    } catch (err: any) {
      const msg = String(err?.message || '解析失败')
      const isProd = typeof import.meta !== 'undefined' && !Boolean((import.meta as any).env?.DEV)
      if (isProd && !httpProxy && /HTTP error!\s*status:\s*(408|500|522)/i.test(msg)) {
        setError(`${msg}（线上版可能被跨域/代理限制拦截，建议配置 VITE_HTTP_PROXY）`)
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
      setMultiProgress(null)
    }
  }

  const handleClearCache = () => {
    if (window.confirm('这会清除所有已保存的数据源配置、缓存和历史记录。确认清除吗？')) {
      localStorage.clear()
      sessionStorage.clear()
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const registration of registrations) {
            registration.unregister()
          }
        })
      }
      window.location.href = import.meta.env.BASE_URL
    }
  }

  const handleUpdate = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister()
        }
      }).finally(() => {
        window.location.reload()
      })
    } else {
      window.location.reload()
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-bili-grayBg text-bili-text">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-bili-border h-16 flex items-center px-4 sm:px-6 shadow-sm">
        <button 
          onClick={() => navigate('/')} 
          className="mr-4 p-2 text-bili-textLight hover:text-bili-text hover:bg-bili-grayBg rounded-full transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
        </button>
        <h1 className="text-lg font-medium text-bili-text truncate flex-1">
          应用设置
        </h1>
      </header>

      <main className="flex-1 p-4 sm:p-6 lg:p-8 custom-scrollbar">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* 版本与缓存控制卡片 */}
          <div className="bg-white rounded-xl shadow-sm border border-bili-border p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-bili-text flex items-center gap-2 mb-1">
                <svg className="w-5 h-5 text-bili-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                版本与缓存
              </h2>
              <p className="text-xs text-bili-textLight">如果遇到异常或者需要升级最新版，可以尝试以下操作</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleUpdate}
                className="px-4 py-2 text-sm rounded-lg bg-bili-grayBg text-bili-text font-medium hover:bg-gray-200 transition-colors relative"
              >
                检查更新
              </button>
              <button
                onClick={handleClearCache}
                className="px-4 py-2 text-sm rounded-lg border border-bili-pink text-bili-pink font-medium hover:bg-bili-pink hover:text-white transition-colors"
              >
                清除所有缓存
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-bili-border p-6">
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-2">
                <svg className="w-6 h-6 text-bili-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
                <h2 className="text-xl font-bold text-bili-text">数据源配置</h2>
              </div>
              <p className="text-sm text-bili-textLight">
                请填入标准的 TVBox 配置 JSON 链接。
                <br />
                <strong className="text-bili-pink font-normal">注意：</strong>
                当前项目仅支持 <strong>type=0 或 type=1 的标准 CMS/XML 影视接口</strong>，
                不支持 type=3 的 Spider（爬虫/网盘）源。
              </p>
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-bili-text mb-2">TVBox JSON 接口地址</label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg className="w-5 h-5 text-bili-textMuted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
                    </div>
                    <input 
                      type="text" 
                      value={inputUrl}
                      onChange={(e) => setInputUrl(e.target.value)}
                      placeholder="例如: http://www.饭太硬.com/tv/"
                      className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-bili-border bg-bili-grayBg/50 text-bili-text focus:outline-none focus:border-bili-blue focus:bg-white focus:ring-1 focus:ring-bili-blue transition-all"
                    />
                  </div>
                  <button 
                    onClick={() => handleSave(inputUrl)}
                    disabled={loading || !inputUrl}
                    className="px-6 py-2.5 rounded-lg bg-bili-blue text-white font-medium hover:bg-bili-blueHover disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center min-w-[120px]"
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    ) : '保存并加载'}
                  </button>
                </div>
                {multiProgress && (
                  <p className="text-bili-textLight text-xs mt-2">
                    正在加载多仓：{multiProgress.done}/{multiProgress.total}
                  </p>
                )}
                {error && <p className="text-bili-pink text-sm mt-2 flex items-center gap-1"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>{error}</p>}
              </div>
              
              <div>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <span className="block text-sm font-medium text-bili-text">推荐源一键配置</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={runSpeedTestAll}
                      disabled={loading || speedTesting}
                      className="px-3 py-1.5 text-xs rounded-md border border-bili-border bg-white text-bili-textLight hover:text-bili-blue hover:border-bili-blue/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {speedTesting ? '测速中...' : '一键测速'}
                    </button>
                    <button
                      type="button"
                      onClick={pickFastestAndSave}
                      disabled={loading || speedTesting}
                      className="px-3 py-1.5 text-xs rounded-md bg-bili-blue text-white hover:bg-bili-blueHover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      一键选最快
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {PRESET_URLS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => handlePresetClick(preset.url)}
                      className={`px-4 py-2 text-sm rounded-full transition-colors border ${
                        inputUrl === preset.url 
                          ? 'border-bili-blue text-bili-blue bg-bili-blue/5 font-medium' 
                          : 'border-bili-border bg-white text-bili-textLight hover:text-bili-blue hover:border-bili-blue/50'
                      }`}
                    >
                      <span className="inline-flex items-center gap-2">
                        <span>{preset.name}</span>
                        {(() => {
                          const r = speedResults[preset.url]
                          if (!r || r.status === 'idle') return null
                          if (r.status === 'testing') return <span className="text-xs text-bili-textMuted">测速中</span>
                          if (r.status === 'ok') return <span className="text-xs text-bili-textMuted">{r.ms}ms{typeof r.usefulSites === 'number' ? ` · 可用${r.usefulSites}` : ''}</span>
                          return <span className="text-xs text-bili-pink">失败</span>
                        })()}
                      </span>
                    </button>
                  ))}
                </div>
                {fastestPreset && (
                  <div className="mt-3 text-xs text-bili-textLight">
                    当前最快：{PRESET_URLS.find(p => p.url === fastestPreset.url)?.name || '未知'}（{fastestPreset.ms}ms）
                  </div>
                )}
              </div>
            </div>
          </div>

          {sites.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-bili-border p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-bili-text flex items-center gap-2">
                  <svg className="w-5 h-5 text-bili-pink" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                  已加载的站点
                </h3>
                <span className="text-xs font-medium text-bili-textLight bg-bili-grayBg px-2.5 py-1 rounded-full">共 {sites.length} 个</span>
              </div>
              
              <div className="max-h-96 overflow-y-auto custom-scrollbar border border-bili-border rounded-lg">
                <ul className="divide-y divide-bili-border">
                  {sites.map(site => (
                    <li key={site.key} className="p-3.5 hover:bg-bili-grayBg/50 flex justify-between items-center transition-colors">
                      <span className="font-medium text-bili-text text-sm truncate pr-4">{site.name}</span>
                      <span className="flex-shrink-0 flex items-center gap-2">
                        {(() => {
                          const r = siteSpeedResults[site.key]
                          if (!r || r.status === 'idle') return null
                          if (r.status === 'testing') {
                            return <span className="text-xs text-bili-textMuted">测速中</span>
                          }
                          if (r.status === 'ok') {
                            return <span className="text-xs text-bili-textMuted">{r.ms}ms</span>
                          }
                          return <span className="text-xs text-bili-pink">失败</span>
                        })()}
                        <span className="text-xs px-2.5 py-1 rounded-md bg-bili-grayBg text-bili-textLight border border-bili-border">
                          {site.type === 3 ? '网盘/解析' : site.type === 1 ? 'XML' : site.type === 0 ? 'CMS' : `Type ${site.type}`}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default Settings
