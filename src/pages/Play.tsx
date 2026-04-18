import React, { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import Artplayer from 'artplayer'
import Hls from 'hls.js'
import { useDataSourceStore } from '../store/dataSource'
import { fetchData } from '../utils/request'
import { enableHlsPrefetch } from '../utils/hlsPrefetch'
import SmartImage from '../components/SmartImage'
import { trafficMonitor, type TrafficStats } from '../utils/trafficMonitor'
import { upsertWatchHistory, loadWatchHistory } from '../utils/watchHistory'
import { wakeLockManager } from '../utils/wakeLock'
import { filterM3u8Ads } from '../utils/adFilter'
type AspectRatio = Artplayer['aspectRatio']

interface Episode {
  name: string
  url: string
}

interface PlaySource {
  sourceName: string
  episodes: Episode[]
}

interface VideoDetail {
  vod_id: string | number
  vod_name: string
  vod_pic: string
  vod_play_from?: string
  vod_play_url?: string
  vod_remarks?: string
}

type DecoderMode = 'auto' | 'hlsjs' | 'native'
type SkipMarks = { introEnd?: number; outroStart?: number; outroLen?: number }
type EpisodeOrder = 'asc' | 'desc'
type RouteMode = 'direct' | 'proxy'
type SpeedStatus = 'idle' | 'testing' | 'ok' | 'fail'
type SpeedProbe = { status: SpeedStatus; ms?: number }

type PlayerPrefsV1 = {
  version: 1
  decoder: DecoderMode
  aspectRatio: AspectRatio
  autoNext: boolean
  episodeOrder: EpisodeOrder
  marksByKey: Record<string, SkipMarks>
}

const PREFS_KEY = 'yingshicang-pc:playerPrefs:v1'

const isHttpUrl = (raw: string): boolean => {
  if (!raw) return false
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return false
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:'
}

const pad2 = (v: number): string => String(Math.max(0, Math.floor(v))).padStart(2, '0')

const formatSec = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  if (h > 0) return `${pad2(h)}:${pad2(m)}:${pad2(ss)}`
  return `${pad2(m)}:${pad2(ss)}`
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const clampNumber = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  if (n < min) return min
  if (n > max) return max
  return n
}

const safeJsonParse = (text: string): any => {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

const loadPrefs = (): PlayerPrefsV1 => {
  const defaults: PlayerPrefsV1 = {
    version: 1,
    decoder: 'auto',
    aspectRatio: 'default',
    autoNext: true,
    episodeOrder: 'asc',
    marksByKey: {},
  }
  if (typeof window === 'undefined') return defaults
  const raw = window.localStorage.getItem(PREFS_KEY) || ''
  const obj = safeJsonParse(raw)
  if (!obj || obj.version !== 1) return defaults
  return {
    version: 1,
    decoder: obj.decoder === 'hlsjs' || obj.decoder === 'native' || obj.decoder === 'auto' ? obj.decoder : defaults.decoder,
    aspectRatio: typeof obj.aspectRatio === 'string' ? (obj.aspectRatio as AspectRatio) : defaults.aspectRatio,
    autoNext: typeof obj.autoNext === 'boolean' ? obj.autoNext : defaults.autoNext,
    episodeOrder: obj.episodeOrder === 'desc' || obj.episodeOrder === 'asc' ? obj.episodeOrder : defaults.episodeOrder,
    marksByKey: typeof obj.marksByKey === 'object' && obj.marksByKey ? obj.marksByKey : {},
  }
}

const savePrefs = (prefs: PlayerPrefsV1): void => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
}

const isLikelyHlsUrl = (raw: string): boolean => {
  if (!raw) return false
  const lower = raw.toLowerCase()
  if (lower.includes('.m3u8')) return true
  if (lower.includes('m3u8')) return true
  return false
}

const toProxyUrl = (raw: string): string => {
  const useLocalProxy = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV)
  if (useLocalProxy) return `/proxy?ua=tvbox&url=${encodeURIComponent(raw)}`
  const httpProxy = typeof import.meta !== 'undefined' ? String((import.meta as any).env?.VITE_HTTP_PROXY || '').trim() : ''
  if (httpProxy) {
    const sep = httpProxy.includes('?') ? '&' : '?'
    return `${httpProxy}${sep}url=${encodeURIComponent(raw)}`
  }
  return `https://api.allorigins.win/raw?url=${encodeURIComponent(raw)}`
}

const toMediaProxyUrl = (raw: string): string => {
  const useLocalProxy = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV)
  if (useLocalProxy) return `/proxy?ua=tvbox&url=${encodeURIComponent(raw)}`
  const httpProxy = typeof import.meta !== 'undefined' ? String((import.meta as any).env?.VITE_HTTP_PROXY || '').trim() : ''
  if (!httpProxy) return raw
  const sep = httpProxy.includes('?') ? '&' : '?'
  return `${httpProxy}${sep}url=${encodeURIComponent(raw)}`
}

const hasMediaProxy = (raw: string): boolean => toMediaProxyUrl(raw) !== raw

const getMarkKey = (siteKey: string, vodId: string | number, sourceIndex: number): string => `${siteKey}|${vodId}|${sourceIndex}`

const getMarks = (prefs: PlayerPrefsV1, key: string): SkipMarks => {
  const marks = prefs.marksByKey?.[key]
  if (!marks) return {}
  const introEnd = clampNumber(marks.introEnd, 0, 24 * 3600, 0)
  const outroStart = clampNumber(marks.outroStart, 0, 24 * 3600, 0)
  const outroLen = clampNumber(marks.outroLen, 0, 24 * 3600, 0)
  const normalized: SkipMarks = {}
  if (introEnd > 0) normalized.introEnd = introEnd
  if (outroStart > 0) normalized.outroStart = outroStart
  if (outroLen > 0) normalized.outroLen = outroLen
  return normalized
}

const setMarks = (prefs: PlayerPrefsV1, key: string, marks: SkipMarks): PlayerPrefsV1 => {
  const next: PlayerPrefsV1 = {
    ...prefs,
    marksByKey: { ...(prefs.marksByKey || {}) },
  }
  next.marksByKey[key] = { ...marks }
  return next
}

/**
 * 通过响应头/内容片段判断是否为 m3u8（避免某些播放地址不带 m3u8 后缀导致误判）
 */
const detectStreamKind = async (raw: string): Promise<'hls' | 'direct'> => {
  if (!raw) return 'direct'
  if (isLikelyHlsUrl(raw)) return 'hls'
  if (!isHttpUrl(raw)) return 'direct'

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5_000)
  try {
    const res = await fetch(toProxyUrl(raw), {
      method: 'GET',
      headers: { Range: 'bytes=0-2047' },
      signal: controller.signal,
    })
    if (!res.ok) return 'direct'
    const ct = (res.headers.get('content-type') || '').toLowerCase()
    if (ct.includes('application/vnd.apple.mpegurl') || ct.includes('application/x-mpegurl')) return 'hls'
    const buf = await res.arrayBuffer()
    const text = new TextDecoder('utf-8').decode(buf).trimStart()
    if (text.startsWith('#EXTM3U')) return 'hls'
    return 'direct'
  } catch {
    return 'direct'
  } finally {
    clearTimeout(timer)
  }
}

const nowMs = (): number => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now())

class CustomPlaylistLoader extends Hls.DefaultConfig.loader {
  constructor(config: any) {
    super(config);
    const load = this.load.bind(this);
    this.load = function (context: any, config: any, callbacks: any) {
      if (context.type === 'manifest' || context.type === 'level') {
        const onSuccess = callbacks.onSuccess;
        callbacks.onSuccess = function (response: any, stats: any, context: any) {
          if (response.data && typeof response.data === 'string') {
            response.data = filterM3u8Ads(response.data);
          }
          if (onSuccess) onSuccess(response, stats, context);
        };
      }
      load(context, config, callbacks);
    };
  }
}

const probeHlsByFetch = async (url: string, timeoutMs: number): Promise<{ ok: boolean; ms: number }> => {
  const start = nowMs()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-2047' },
      signal: controller.signal,
    })
    if (!res.ok) return { ok: false, ms: Math.round(nowMs() - start) }
    const ct = (res.headers.get('content-type') || '').toLowerCase()
    if (ct.includes('application/vnd.apple.mpegurl') || ct.includes('application/x-mpegurl')) {
      return { ok: true, ms: Math.round(nowMs() - start) }
    }
    const buf = await res.arrayBuffer()
    const text = new TextDecoder('utf-8').decode(buf).trimStart()
    if (text.startsWith('#EXTM3U')) return { ok: true, ms: Math.round(nowMs() - start) }
    return { ok: false, ms: Math.round(nowMs() - start) }
  } catch {
    return { ok: false, ms: Math.round(nowMs() - start) }
  } finally {
    clearTimeout(timer)
  }
}

const probeVideoByElement = async (url: string, timeoutMs: number): Promise<{ ok: boolean; ms: number }> => {
  const start = nowMs()
  if (typeof document === 'undefined') return { ok: false, ms: Math.round(nowMs() - start) }
  const video = document.createElement('video')
  video.preload = 'metadata'
  video.muted = true
  video.playsInline = true

  const cleanup = () => {
    try {
      video.pause()
    } catch {}
    video.removeAttribute('src')
    try {
      video.load()
    } catch {}
  }

  return await new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup()
      resolve({ ok: false, ms: Math.round(nowMs() - start) })
    }, timeoutMs)

    const done = (ok: boolean) => {
      clearTimeout(timer)
      cleanup()
      resolve({ ok, ms: Math.round(nowMs() - start) })
    }

    video.addEventListener('loadedmetadata', () => done(true), { once: true })
    video.addEventListener('error', () => done(false), { once: true })
    video.src = url
    try {
      video.load()
    } catch {
      done(false)
    }
  })
}

const pickBestRoute = async (raw: string, isHls: boolean, useHlsJs: boolean): Promise<{ mode: RouteMode; ok: boolean; ms: number }> => {
  const candidates: Array<{ mode: RouteMode; url: string }> = [{ mode: 'direct', url: raw }]
  if (hasMediaProxy(raw)) candidates.push({ mode: 'proxy', url: toMediaProxyUrl(raw) })
  if (candidates.length === 1) return { mode: 'direct', ok: true, ms: 0 }

  const probes = candidates.map(async (c) => {
    if (isHls && useHlsJs) {
      const r = await probeHlsByFetch(c.url, 4_000)
      return { ...c, ...r }
    }
    const r = await probeVideoByElement(c.url, 4_000)
    return { ...c, ...r }
  })

  const results = await Promise.all(probes)
  const ok = results.filter(r => r.ok).sort((a, b) => a.ms - b.ms)
  if (ok.length) return { mode: ok[0].mode, ok: true, ms: ok[0].ms }
  const fallback: RouteMode = hasMediaProxy(raw) ? 'proxy' : 'direct'
  const minMs = results.length ? Math.min(...results.map(r => r.ms)) : 0
  return { mode: fallback, ok: false, ms: minMs }
}

/**
 * 处理「分享页」类播放地址：页面内通常会给出 main = "/xxx/index.m3u8?sign=..."
 */
const resolvePlayableUrl = async (raw: string): Promise<string> => {
  if (!raw) return ''
  if (!isHttpUrl(raw)) return raw
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return raw
  }

  const isShare = u.pathname.startsWith('/share/')
  if (!isShare) return raw

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5_000)
  try {
    const res = await fetch(toProxyUrl(raw), { signal: controller.signal })
    if (!res.ok) return raw
    const ct = (res.headers.get('content-type') || '').toLowerCase()
    if (!ct.includes('text/html')) return raw
    const html = await res.text()
    const m = html.match(/var\s+main\s*=\s*['"]([^'"]+)['"]/i)
    const main = (m?.[1] || '').trim()
    if (!main) return raw
    const resolved = main.startsWith('http') ? main : new URL(main, u.origin).toString()
    console.log('Play: resolved share url', raw, '=>', resolved)
    return resolved
  } catch {
    return raw
  } finally {
    clearTimeout(timer)
  }
}

const Play: React.FC = () => {
  const { siteKey, vodId, sourceIndex: sourceIndexStr, episodeIndex: episodeIndexStr } = useParams<{ 
    siteKey: string; 
    vodId: string;
    sourceIndex: string;
    episodeIndex: string;
  }>()
  
  const navigate = useNavigate()
  const location = useLocation()
  const { sites } = useDataSourceStore()
  
  const [detail, setDetail] = useState<VideoDetail | null>(location.state?.detail || null)
  const [playSources, setPlaySources] = useState<PlaySource[]>(location.state?.playSources || [])
  const [currentSourceIndex, setCurrentSourceIndex] = useState(parseInt(sourceIndexStr || '0', 10))
  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState(parseInt(episodeIndexStr || '0', 10))
  
  const [loading, setLoading] = useState(!location.state?.detail)
  const [error, setError] = useState<string | null>(null)
  
  const playerContainerRef = useRef<HTMLDivElement>(null)
  const artRef = useRef<any>(null)
  const hlsRef = useRef<Hls | null>(null)
  const routeRef = useRef<RouteMode>('direct')
  const [playerLoading, setPlayerLoading] = useState(false)
  const [playerError, setPlayerError] = useState<string | null>(null)
  const [sourceSpeed, setSourceSpeed] = useState<Record<number, SpeedProbe>>({})
  const [episodeOrder, setEpisodeOrder] = useState<EpisodeOrder>(() => loadPrefs().episodeOrder)
  const [trafficEnabled, setTrafficEnabled] = useState(() => trafficMonitor.getEnabled())
  const [traffic, setTraffic] = useState<TrafficStats>({ domesticUp: 0, domesticDown: 0, intlUp: 0, intlDown: 0 })
  const [headphoneConnected, setHeadphoneConnected] = useState(false)

  useEffect(() => {
    const unsubscribe = trafficMonitor.subscribe(setTraffic);
    return () => {
      unsubscribe();
    };
  }, [])

  useEffect(() => {
    const checkHeadphone = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasHeadphone = devices.some(d => 
          d.kind === 'audiooutput' && 
          (d.label.toLowerCase().includes('headphone') || 
           d.label.toLowerCase().includes('headset') || 
           d.label.toLowerCase().includes('bluetooth') ||
           d.label.toLowerCase().includes('airpods') ||
           d.label.toLowerCase().includes('buds'))
        );
        setHeadphoneConnected(hasHeadphone);
      } catch (e) {
        console.warn('Failed to enumerate devices', e);
      }
    };
    
    checkHeadphone();
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', checkHeadphone);
      return () => navigator.mediaDevices.removeEventListener('devicechange', checkHeadphone);
    }
  }, [])

  useEffect(() => {
    if (detail) return

    const fetchDetail = async () => {
      if (!siteKey || !vodId) return
      const site = sites.find(s => s.key === siteKey)
      if (!site) {
        setError('找不到对应的数据源')
        return
      }

      setLoading(true)
      const apiUrl = site.api || site.url || ''
      if (!apiUrl) {
        setError('站点 API 无效')
        setLoading(false)
        return
      }

      if (typeof window !== 'undefined' && window.location.hostname === 'localhost' && site.key === 'mock1') {
        const mockVodInfo = {
            vod_id: 1,
            vod_name: "Test Movie",
            vod_pic: "https://via.placeholder.com/150",
            vod_remarks: "HD",
            vod_play_from: "m3u8$$$mp4",
            vod_play_url: "第1集$http://mock.mp4#第2集$http://mock.mp4",
            vod_content: "Test Description"
        }
        setDetail(mockVodInfo)
        
        const sources = mockVodInfo.vod_play_url.split('$$$')
        
        const parsedSources: PlaySource[] = sources.map((sourceName, index) => {
          const urlStr = sources[index] || ''
          const episodes = urlStr.split('#').filter(Boolean).map(ep => {
            const parts = ep.split('$')
            let name = '正片'
            let url = ''
            if (parts.length > 1) {
              name = parts[0]
              url = parts.slice(1).join('$')
            } else {
              url = parts[0]
            }
            return { name, url }
          })
          return { sourceName, episodes }
        }).filter(s => s.episodes.length > 0)
        
        setPlaySources(parsedSources)
        setLoading(false)
        return
      }

      try {
        const url = new URL(apiUrl)
        const params = new URLSearchParams(url.search)
        params.delete('ac')
        params.set('ac', 'detail')
        params.set('ids', vodId)
        url.search = params.toString()
        
        const response = await fetchData<{list?: VideoDetail[]}>(url.toString())
        
        if (!response.success) throw new Error(response.error || '请求失败')
        
        if (response.data?.list && response.data.list.length > 0) {
          const videoData = response.data.list[0]
          setDetail(videoData)
          
          if (videoData.vod_play_from && videoData.vod_play_url) {
            const sources = videoData.vod_play_from.split('$$$')
            const urls = videoData.vod_play_url.split('$$$')
            
            const parsedSources: PlaySource[] = sources.map((sourceName, index) => {
              const urlStr = urls[index] || ''
              const episodes = urlStr.split('#').filter(Boolean).map(ep => {
                const parts = ep.split('$')
                let name = '正片'
                let url = ''
                if (parts.length > 1) {
                  name = parts[0]
                  url = parts.slice(1).join('$')
                } else {
                  url = parts[0]
                }
                return { name, url }
              })
              return { sourceName, episodes }
            }).filter(s => s.episodes.length > 0)
            
            setPlaySources(parsedSources)
          }
        } else {
          setError('未找到影片详情')
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : '获取详情失败')
      } finally {
        setLoading(false)
      }
    }
    
    fetchDetail()
  }, [siteKey, vodId, sites, detail])

  useEffect(() => {
    const source = playSources[currentSourceIndex]
    if (!source) return
    const episode = source.episodes[currentEpisodeIndex]
    if (!episode) return
    if (!playerContainerRef.current) return

    setPlayerLoading(true)
    setPlayerError(null)

    if (artRef.current) {
      artRef.current.destroy(false)
      artRef.current = null
    }
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    const safeUrl = episode.url?.trim()
    if (!safeUrl || !isHttpUrl(safeUrl)) {
      setPlayerLoading(false)
      setPlayerError('播放地址无效')
      return
    }

    let cancelled = false
    const start = async () => {
      const playUrl = await resolvePlayableUrl(safeUrl)
      if (cancelled) return
      const kind = await detectStreamKind(playUrl)
      if (cancelled) return
      const container = playerContainerRef.current
      if (!container) return
      container.innerHTML = ''

      const isHls = kind === 'hls'
      const prefs = loadPrefs()
      const markKey = getMarkKey(siteKey || '', vodId || '', currentSourceIndex)
      const marks = getMarks(prefs, markKey)
      const canNativeHls =
        typeof document !== 'undefined' &&
        typeof document.createElement === 'function' &&
        document.createElement('video').canPlayType('application/vnd.apple.mpegurl') !== ''

      const chooseDecoderAndRoute = async (decoder: DecoderMode): Promise<{ decoder: DecoderMode; useHlsJs: boolean; route: RouteMode }> => {
        if (!isHls) {
          const r = await pickBestRoute(playUrl, false, false)
          return { decoder, useHlsJs: false, route: r.mode }
        }
        if (decoder === 'hlsjs') {
          const r = await pickBestRoute(playUrl, true, true)
          return { decoder, useHlsJs: true, route: r.mode }
        }
        if (decoder === 'native') {
          const r = await pickBestRoute(playUrl, true, false)
          return { decoder, useHlsJs: false, route: r.mode }
        }

        const candidates: DecoderMode[] = canNativeHls ? ['native', 'hlsjs'] : ['hlsjs']
        const results = await Promise.all(
          candidates.map(async (d) => {
            const use = d === 'hlsjs'
            const r = await pickBestRoute(playUrl, true, use)
            return { decoder: d, useHlsJs: use, route: r.mode, ok: r.ok, ms: r.ms }
          }),
        )
        const ok = results.filter(r => r.ok).sort((a, b) => a.ms - b.ms)
        const best = ok[0] || results.sort((a, b) => a.ms - b.ms)[0]
        return { decoder: best.decoder, useHlsJs: best.useHlsJs, route: best.route }
      }

      const selection = await chooseDecoderAndRoute(prefs.decoder)
      routeRef.current = selection.route
      const initUrl = selection.useHlsJs ? playUrl : (selection.route === 'proxy' ? toMediaProxyUrl(playUrl) : playUrl)

      const art = new Artplayer({
        container,
        url: initUrl,
        autoplay: true,
        autoSize: false,
        setting: true,
        playbackRate: true,
        hotkey: true,
        pip: true,
        fullscreen: true,
        fullscreenWeb: true,
        screenshot: true,
        mutex: true,
        // 添加移动端专属优化
        autoOrientation: true, 
        fastForward: true, 
        lock: true, 
        plugins: [
          (art) => {
            let startX = 0, startY = 0, isDragging = false, dragType: 'volume' | 'light' | 'progress' | 'none' = 'none';
            let startVolume = 0, startProgress = 0, currentProgress = 0, startLight = 1;
            
            const lightMask = document.createElement('div');
            lightMask.style.position = 'absolute';
            lightMask.style.inset = '0';
            lightMask.style.backgroundColor = 'rgba(0,0,0,0)';
            lightMask.style.pointerEvents = 'none';
            lightMask.style.zIndex = '50';
            
            const tipEl = document.createElement('div');
            tipEl.style.position = 'absolute';
            tipEl.style.top = '50%';
            tipEl.style.left = '50%';
            tipEl.style.transform = 'translate(-50%, -50%)';
            tipEl.style.background = 'rgba(0,0,0,0.6)';
            tipEl.style.color = 'white';
            tipEl.style.padding = '10px 20px';
            tipEl.style.borderRadius = '8px';
            tipEl.style.fontSize = '14px';
            tipEl.style.display = 'none';
            tipEl.style.zIndex = '9999';
            
            art.on('fullscreenError', () => {
        art.fullscreenWeb = true;
        art.notice.show = '由于浏览器限制，已为您切换为网页全屏';
      })

      art.on('ready', () => {
              art.template.$player.appendChild(lightMask);
              art.template.$player.appendChild(tipEl);
              
              // 绑定到 video 元素上，防止拦截控制栏的点击事件（如全屏按钮）
              const playerEl = art.template.$video; 
              
              playerEl.addEventListener('touchstart', (e: TouchEvent) => {
                if (e.touches.length !== 1) return;
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                isDragging = true;
                dragType = 'none';
                startVolume = art.volume;
                startProgress = art.currentTime;
                currentProgress = startProgress;
              });

              playerEl.addEventListener('touchmove', (e: TouchEvent) => {
                if (!isDragging) return;
                const currentX = e.touches[0].clientX;
                const currentY = e.touches[0].clientY;
                const diffX = currentX - startX;
                const diffY = currentY - startY;
                
                if (dragType === 'none') {
                  if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 10) {
                    dragType = 'progress';
                  } else if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 10) {
                    const rect = playerEl.getBoundingClientRect();
                    if (startX > rect.left + rect.width / 2) {
                      dragType = 'volume';
                    } else {
                      dragType = 'light';
                    }
                  }
                }
                
                if (dragType === 'progress') {
                  if (e.cancelable) e.preventDefault();
                  const percent = diffX / playerEl.clientWidth;
                  const delta = percent * 90;
                  currentProgress = Math.max(0, Math.min(art.duration || 0, startProgress + delta));
                  tipEl.textContent = `${formatSec(currentProgress)} / ${formatSec(art.duration || 0)}`;
                  tipEl.style.display = 'block';
                } else if (dragType === 'volume') {
                  if (e.cancelable) e.preventDefault();
                  const percent = -diffY / playerEl.clientHeight;
                  let newVol = Math.max(0, Math.min(1, startVolume + percent));
                  art.volume = newVol;
                  tipEl.textContent = `音量: ${Math.round(newVol * 100)}%`;
                  tipEl.style.display = 'block';
                } else if (dragType === 'light') {
                  if (e.cancelable) e.preventDefault();
                  const percent = diffY / playerEl.clientHeight;
                  startLight = Math.max(0, Math.min(0.8, startLight + percent * 0.1));
                  lightMask.style.backgroundColor = `rgba(0,0,0,${startLight})`;
                  tipEl.textContent = `亮度: ${Math.round((1 - startLight) * 100)}%`;
                  tipEl.style.display = 'block';
                  startY = currentY;
                }
              }, { passive: false });

              playerEl.addEventListener('touchend', () => {
                if (dragType === 'progress') {
                  art.currentTime = currentProgress;
                }
                isDragging = false;
                dragType = 'none';
                tipEl.style.display = 'none';
              });
            });
            return { name: 'mobileGestures' };
          }
        ],
        moreVideoAttr: {
          playsInline: true,
          preload: 'metadata',
          'x5-video-player-type': 'h5',
          'x5-video-player-fullscreen': 'true',
          'x5-video-orientation': 'landscape',
        } as any,
        type: selection.useHlsJs ? 'm3u8' : '',
        settings: [
          {
            name: 'decoder',
            html: '解码器',
            selector: [
              { html: '自动', decoder: 'auto', default: prefs.decoder === 'auto' },
              { html: 'Hls.js', decoder: 'hlsjs', default: prefs.decoder === 'hlsjs' },
              { html: '原生', decoder: 'native', default: prefs.decoder === 'native' },
            ],
            onSelect: (_item, _el, _event) => {
              const decoder = String((_item as any)?.decoder || '').toLowerCase()
              if (decoder !== 'auto' && decoder !== 'hlsjs' && decoder !== 'native') return
              const next = { ...prefs, decoder } as PlayerPrefsV1
              savePrefs(next)
              void (async () => {
                const picked = await chooseDecoderAndRoute(decoder as DecoderMode)
                routeRef.current = picked.route
                if (hlsRef.current) {
                  hlsRef.current.destroy()
                  hlsRef.current = null
                }
                art.type = picked.useHlsJs ? 'm3u8' : ''
                const nextUrl = picked.useHlsJs ? playUrl : (picked.route === 'proxy' ? toMediaProxyUrl(playUrl) : playUrl)
                art.switchUrl(nextUrl)
                art.notice.show = `解码器：${picked.decoder === 'hlsjs' ? 'Hls.js' : picked.decoder === 'native' ? '原生' : '自动'}`
              })()
            },
          },
          {
            name: 'aspectRatio',
            html: '画面比例',
            selector: [
              { html: '默认', ratio: 'default', default: prefs.aspectRatio === 'default' },
              { html: '16:9', ratio: '16:9', default: prefs.aspectRatio === '16:9' },
              { html: '4:3', ratio: '4:3', default: prefs.aspectRatio === '4:3' },
              { html: '1:1', ratio: '1:1', default: prefs.aspectRatio === '1:1' },
              { html: '21:9', ratio: '21:9', default: prefs.aspectRatio === '21:9' },
            ],
            onSelect: (_item) => {
              const ratio = String((_item as any)?.ratio || '').trim() as AspectRatio
              if (!ratio) return
              art.aspectRatio = ratio
              const next = { ...prefs, aspectRatio: ratio } as PlayerPrefsV1
              savePrefs(next)
              art.notice.show = `画面比例：${ratio === 'default' ? '默认' : ratio}`
            },
          },
          {
            name: 'autoNext',
            html: '连播',
            switch: true,
            default: Boolean(prefs.autoNext),
            onSwitch: (item) => {
              const on = Boolean(item?.switch)
              const next = { ...prefs, autoNext: on } as PlayerPrefsV1
              savePrefs(next)
              art.notice.show = on ? '连播：开启' : '连播：关闭'
            },
          },
          {
            name: 'trafficStats',
            html: '流量统计',
            switch: true,
            default: trafficEnabled,
            onSwitch: (item) => {
              const next = Boolean(item?.switch);
              trafficMonitor.setEnabled(next);
              setTrafficEnabled(next);
              art.notice.show = next ? '流量统计：已开启' : '流量统计：已关闭';
            },
          },
          {
            name: 'introMark',
            html: `片头：${marks.introEnd ? formatSec(marks.introEnd) : '--'}`,
            onClick: () => {
              const nextMarks = { ...marks, introEnd: undefined }
              const next = setMarks(prefs, markKey, nextMarks)
              savePrefs(next)
              art.setting.update({ name: 'introMark', html: `片头：${nextMarks.introEnd ? formatSec(nextMarks.introEnd) : '--'}` })
              art.notice.show = '已清除片头'
            },
          },
          {
            name: 'outroMark',
            html: `片尾：${
              marks.outroLen
                ? `末尾${formatSec(marks.outroLen)}`
                : marks.outroStart
                  ? formatSec(marks.outroStart)
                  : '--'
            }`,
            onClick: () => {
              const nextMarks = { ...marks, outroStart: undefined, outroLen: undefined }
              const next = setMarks(prefs, markKey, nextMarks)
              savePrefs(next)
              art.setting.update({
                name: 'outroMark',
                html: `片尾：${
                  nextMarks.outroLen
                    ? `末尾${formatSec(nextMarks.outroLen)}`
                    : nextMarks.outroStart
                      ? formatSec(nextMarks.outroStart)
                      : '--'
                }`,
              })
              art.notice.show = '已清除片尾'
            },
          },
        ],
        customType: {
          m3u8: (video: HTMLVideoElement, url: string) => {
            if (hlsRef.current) {
              hlsRef.current.destroy()
              hlsRef.current = null
            }
            if (!Hls.isSupported()) {
              video.src = routeRef.current === 'proxy' ? toMediaProxyUrl(url) : url
              return
            }
            const hls = new Hls({
              pLoader: CustomPlaylistLoader as any,
              enableWorker: true,
              backBufferLength: 30, // 允许保留过往 30 秒的视频缓存
              maxBufferLength: 60, // 增加向前缓冲时长到 60 秒，保证 Seek 后的连贯性
              maxMaxBufferLength: 90, // 允许最大缓冲 90 秒
              xhrSetup: (xhr, reqUrl) => {
                xhr.open('GET', routeRef.current === 'proxy' ? toMediaProxyUrl(reqUrl) : reqUrl, true)
              },
            })
            hlsRef.current = hls
            enableHlsPrefetch(hls, (reqUrl) => routeRef.current === 'proxy' ? toMediaProxyUrl(reqUrl) : reqUrl, 3)
            hls.loadSource(url)
            hls.attachMedia(video)
          },
        },
      })

      if (prefs.aspectRatio) art.aspectRatio = prefs.aspectRatio

      // 耳机状态图标注入到播放器右上角
      const headphoneIcon = document.createElement('div');
      headphoneIcon.style.position = 'absolute';
      headphoneIcon.style.top = '10px';
      headphoneIcon.style.right = '10px';
      headphoneIcon.style.zIndex = '9999';
      headphoneIcon.style.display = 'none';
      headphoneIcon.style.pointerEvents = 'none';
      headphoneIcon.innerHTML = '<svg style="width:28px;height:28px;color:rgba(255,255,255,0.9);filter:drop-shadow(0 2px 4px rgba(0,0,0,0.6))" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6c3.314 0 6 2.686 6 6v4a2 2 0 01-2 2h-1a1 1 0 01-1-1v-4a1 1 0 011-1h1a4 4 0 00-8 0h1a1 1 0 011 1v4a1 1 0 01-1 1H8a2 2 0 01-2-2v-4c0-3.314 2.686-6 6-6z"></path></svg>';

      // 流量统计层注入到播放器左上角
      const trafficLayer = document.createElement('div');
      trafficLayer.style.position = 'absolute';
      trafficLayer.style.top = '10px';
      trafficLayer.style.left = '10px';
      trafficLayer.style.zIndex = '9999';
      trafficLayer.style.pointerEvents = 'none';
      trafficLayer.style.display = 'none';
      trafficLayer.className = 'yc-traffic-layer';

      if (art.template && art.template.$player) {
        art.template.$player.appendChild(headphoneIcon);
        art.template.$player.appendChild(trafficLayer);
      }

      let checkInterval = setInterval(() => {
        if (document.querySelector('h1')?.textContent?.includes('耳机模式')) {
          headphoneIcon.style.display = 'block';
        } else {
          headphoneIcon.style.display = 'none';
        }
      }, 1000);

      art.on('destroy', () => clearInterval(checkInterval));

      let introApplied = false
      let outroTriggered = false
      
      const history = loadWatchHistory()
      const historyItem = history.find((h: any) => h.siteKey === siteKey && String(h.vodId) === String(vodId))
      const lastTime = historyItem?.sourceIndex === currentSourceIndex && historyItem?.episodeIndex === currentEpisodeIndex 
        ? (historyItem.currentTime || 0) 
        : 0

      const doNextEpisode = () => {
        const latest = loadPrefs()
        const delta = latest.episodeOrder === 'desc' ? -1 : 1
        const s = playSources[currentSourceIndex]
        if (!s) return
        const nextIndex = currentEpisodeIndex + delta
        if (nextIndex < 0 || nextIndex >= s.episodes.length) return
        switchEpisode(currentSourceIndex, nextIndex)
      }

      art.on('ready', () => {
        setPlayerLoading(false)
        const root = playerContainerRef.current
        if (!root) return
        const leftControls = root.querySelector('.art-controls-left')
        if (!leftControls) return
        const candidates = Array.from(leftControls.querySelectorAll('.art-control'))
        const timeEl = candidates.find((el) => (el.textContent || '').includes(' / '))
        if (timeEl) (timeEl as HTMLElement).classList.add('yc-art-time')

        // 自动恢复播放进度
        const latest = loadPrefs()
        const latestMarks = getMarks(latest, markKey)
        const introEnd = latestMarks.introEnd || 0
        
        // 如果有历史记录进度且不是刚开始看，恢复到历史记录；如果小于片头，跳过片头
        if (lastTime > 0 && lastTime > introEnd) {
          art.currentTime = lastTime
          art.notice.show = `已恢复到上次观看位置：${formatSec(lastTime)}`
          introApplied = true // 既然恢复的位置已经过了片头，就标记为已跳过
        } else if (introEnd > 0) {
          art.currentTime = introEnd
          art.notice.show = `已跳过片头：${formatSec(introEnd)}`
          introApplied = true
        }
      })
      art.on('video:waiting', () => setPlayerLoading(true))
      art.on('video:playing', () => {
        setPlayerLoading(false)
        wakeLockManager.request()
        
        // 双重保障，避免某些视频在 ready 时没加载完元数据导致 seek 失败
        if (!introApplied) {
          const latest = loadPrefs()
          const latestMarks = getMarks(latest, markKey)
          const introEnd = latestMarks.introEnd || 0
          if (lastTime > 0 && lastTime > introEnd && art.currentTime < lastTime - 2) {
            art.currentTime = lastTime
            introApplied = true
          } else if (introEnd > 0 && art.currentTime < introEnd - 2) {
            art.currentTime = introEnd
            introApplied = true
          }
        }
      })
      art.on('video:pause', () => {
        wakeLockManager.release()
      })
      let lastSaveTime = 0
      art.on('video:timeupdate', () => {
        const latest = loadPrefs()
        const latestMarks = getMarks(latest, markKey)
        let outroStart = latestMarks.outroStart || 0
        const outroLen = latestMarks.outroLen || 0
        if (!outroStart && outroLen > 0 && Number.isFinite(art.duration) && art.duration > 0) {
          outroStart = Math.max(0, art.duration - outroLen)
        }
        
        // Save watch history periodically (every 5 seconds)
        const currentTimeMs = nowMs()
        if (currentTimeMs - lastSaveTime > 5000) {
          lastSaveTime = currentTimeMs
          upsertWatchHistory({
            siteKey: siteKey || '',
            vodId: vodId || '',
            vodName: detail?.vod_name || '',
            vodPic: detail?.vod_pic || '',
            sourceIndex: currentSourceIndex,
            episodeIndex: currentEpisodeIndex,
            currentTime: art.currentTime,
            duration: art.duration || undefined,
            updatedAt: Date.now()
          })
        }

        if (!latest.autoNext) return
        if (!outroStart) return
        if (outroTriggered) return
        if (art.currentTime + 0.2 < outroStart) return
        outroTriggered = true
        
        // 当跳到下一集时，需要清空历史记录里的时间，保证它从0开始
        upsertWatchHistory({
          siteKey: siteKey || '',
          vodId: vodId || '',
          vodName: detail?.vod_name || '',
          vodPic: detail?.vod_pic || '',
          sourceIndex: currentSourceIndex,
          episodeIndex: currentEpisodeIndex,
          currentTime: 0,
          duration: art.duration || undefined,
          updatedAt: Date.now()
        })
        
        doNextEpisode()
      })
      
      // Save exact progress when seeking finishes
      art.on('video:seeked', () => {
        upsertWatchHistory({
          siteKey: siteKey || '',
          vodId: vodId || '',
          vodName: detail?.vod_name || '',
          vodPic: detail?.vod_pic || '',
          sourceIndex: currentSourceIndex,
          episodeIndex: currentEpisodeIndex,
          currentTime: art.currentTime,
          duration: art.duration || undefined,
          updatedAt: Date.now()
        })
      })

      art.on('video:ended', () => {
        // 视频正常播完时，也清理当前进度
        upsertWatchHistory({
          siteKey: siteKey || '',
          vodId: vodId || '',
          vodName: detail?.vod_name || '',
          vodPic: detail?.vod_pic || '',
          sourceIndex: currentSourceIndex,
          episodeIndex: currentEpisodeIndex,
          currentTime: 0,
          duration: art.duration || undefined,
          updatedAt: Date.now()
        })
        
        const latest = loadPrefs()
        if (!latest.autoNext) return
        doNextEpisode()
      })
      art.on('error', () => {
        setPlayerLoading(false)
        setPlayerError('播放失败')
      })

      artRef.current = art
      art.controls.add({
        name: 'intro',
        position: 'right',
        html: '<span style="font-size:12px;min-width:22px;display:inline-flex;justify-content:center;">头</span>',
        click: () => {
          const prefsNow = loadPrefs()
          const key = getMarkKey(siteKey || '', vodId || '', currentSourceIndex)
          const cur = Math.max(0, Math.floor(art.currentTime))
          const marksNow = getMarks(prefsNow, key)
          const nextMarks = { ...marksNow, introEnd: cur }
          const next = setMarks(prefsNow, key, nextMarks)
          savePrefs(next)
          art.setting.update({ name: 'introMark', html: `片头：${nextMarks.introEnd ? formatSec(nextMarks.introEnd) : '--'}` })
          art.notice.show = `片头已记录：${formatSec(cur)}`
        },
      })
      art.controls.add({
        name: 'outro',
        position: 'right',
        html: '<span style="font-size:12px;min-width:22px;display:inline-flex;justify-content:center;">尾</span>',
        click: () => {
          const prefsNow = loadPrefs()
          const key = getMarkKey(siteKey || '', vodId || '', currentSourceIndex)
          const curRaw = Math.max(0, Number(art.currentTime) || 0)
          const durationRaw = Number(art.duration) || 0
          if (!Number.isFinite(durationRaw) || durationRaw <= 0) {
            art.notice.show = '无法获取时长，稍后再试'
            return
          }
          const outroLen = Math.max(0, Math.floor(durationRaw - curRaw))
          if (!outroLen) {
            art.notice.show = '已在片尾附近'
            return
          }
          const ok = window.confirm(`是否跳过当前这集片尾并记录片尾长度（${formatSec(outroLen)}）？`)
          if (!ok) return
          const marksNow = getMarks(prefsNow, key)
          const nextMarks = { ...marksNow, outroStart: undefined, outroLen }
          const next = setMarks(prefsNow, key, nextMarks)
          savePrefs(next)
          art.setting.update({
            name: 'outroMark',
            html: `片尾：${
              nextMarks.outroLen
                ? `末尾${formatSec(nextMarks.outroLen)}`
                : nextMarks.outroStart
                  ? formatSec(nextMarks.outroStart)
                  : '--'
            }`,
          })
          outroTriggered = true
          const delta = prefsNow.episodeOrder === 'desc' ? -1 : 1
          const s = playSources[currentSourceIndex]
          const nextIndex = currentEpisodeIndex + delta
          if (s && nextIndex >= 0 && nextIndex < s.episodes.length) {
            switchEpisode(currentSourceIndex, nextIndex)
            return
          }
          art.currentTime = Math.max(0, durationRaw - 0.05)
        },
      })
    }
    start()

    return () => {
      cancelled = true
      if (artRef.current) {
        artRef.current.destroy(false)
        artRef.current = null
      }
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [playSources, currentSourceIndex, currentEpisodeIndex, detail])

  useEffect(() => {
    if (!playSources.length) return
    let cancelled = false
    setSourceSpeed(() => {
      const init: Record<number, SpeedProbe> = {}
      for (let i = 0; i < playSources.length; i++) init[i] = { status: 'testing' }
      return init
    })

    const limit = 3
    let next = 0
    const workers = Array.from({ length: Math.min(limit, playSources.length) }, async () => {
      for (;;) {
        const idx = next
        next += 1
        if (idx >= playSources.length) return
        const ep = playSources[idx]?.episodes?.[0]
        const raw = ep?.url?.trim() || ''
        if (!raw || !isHttpUrl(raw)) {
          if (!cancelled) setSourceSpeed(prev => ({ ...prev, [idx]: { status: 'fail' } }))
          continue
        }
        const start = nowMs()
        try {
          const playUrl = await resolvePlayableUrl(raw)
          if (cancelled) return
          const kind = await detectStreamKind(playUrl)
          if (cancelled) return
          const isHls = kind === 'hls'
          const route = await pickBestRoute(playUrl, isHls, isHls)
          if (cancelled) return
          const ms = Math.max(0, Math.round(nowMs() - start))
          if (!route.ok) {
            setSourceSpeed(prev => ({ ...prev, [idx]: { status: 'fail', ms } }))
          } else {
            setSourceSpeed(prev => ({ ...prev, [idx]: { status: 'ok', ms } }))
          }
        } catch {
          const ms = Math.max(0, Math.round(nowMs() - start))
          if (!cancelled) setSourceSpeed(prev => ({ ...prev, [idx]: { status: 'fail', ms } }))
        }
      }
    })

    void Promise.all(workers)
    return () => {
      cancelled = true
    }
  }, [playSources])

  useEffect(() => {
    if (!artRef.current || !trafficEnabled) return;
    const html = `
      <div style="background:rgba(0,0,0,0.6);color:white;font-size:12px;padding:12px;border-radius:4px;backdrop-filter:blur(4px);border:1px solid rgba(255,255,255,0.1);display:flex;flex-direction:column;gap:6px;pointer-events:none;user-select:none;">
        <div style="font-weight:500;border-bottom:1px solid rgba(255,255,255,0.2);padding-bottom:4px;margin-bottom:4px;color:#00aeec;display:flex;align-items:center;gap:4px;">
          <svg style="width:12px;height:12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
          流量监控 (实时)
        </div>
        <div style="display:flex;justify-content:space-between;gap:24px;"><span>国内下行:</span><span style="font-family:monospace;">${formatBytes(traffic.domesticDown)}</span></div>
        <div style="display:flex;justify-content:space-between;gap:24px;"><span>国内上行:</span><span style="font-family:monospace;">${formatBytes(traffic.domesticUp)}</span></div>
        <div style="display:flex;justify-content:space-between;gap:24px;"><span>国外下行:</span><span style="font-family:monospace;">${formatBytes(traffic.intlDown)}</span></div>
        <div style="display:flex;justify-content:space-between;gap:24px;"><span>国外上行:</span><span style="font-family:monospace;">${formatBytes(traffic.intlUp)}</span></div>
      </div>
    `;
    
    if (artRef.current.template?.$player) {
      const layer = artRef.current.template.$player.querySelector('.yc-traffic-layer') as HTMLElement;
      if (layer) {
        layer.innerHTML = html;
        layer.style.display = 'block';
      }
    }
  }, [traffic, trafficEnabled]);

  useEffect(() => {
    if (!trafficEnabled && artRef.current?.template?.$player) {
      const layer = artRef.current.template.$player.querySelector('.yc-traffic-layer') as HTMLElement;
      if (layer) layer.style.display = 'none';
    }
  }, [trafficEnabled]);

  const switchEpisode = (sIndex: number, eIndex: number) => {
    setCurrentSourceIndex(sIndex)
    setCurrentEpisodeIndex(eIndex)
    navigate(`/play/${siteKey}/${vodId}/${sIndex}/${eIndex}`, { 
      replace: true,
      state: { detail, playSources }
    })
  }

  const toggleEpisodeOrder = (next: EpisodeOrder) => {
    if (next !== 'asc' && next !== 'desc') return
    setEpisodeOrder(next)
    const prefs = loadPrefs()
    savePrefs({ ...prefs, episodeOrder: next })
  }

  const orderedEpisodes = (() => {
    const eps = playSources[currentSourceIndex]?.episodes || []
    const withIndex = eps.map((ep, index) => ({ ep, index }))
    if (episodeOrder === 'desc') return withIndex.reverse()
    return withIndex
  })()

  return (
    <div className="flex flex-col min-h-screen bg-white text-bili-text">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-bili-border h-16 flex items-center px-4 sm:px-6 shadow-sm">
        <button 
          onClick={() => navigate(-1)} 
          className="mr-4 p-2 text-bili-textLight hover:text-bili-text hover:bg-bili-grayBg rounded-full transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
        </button>
        <h1 className="text-lg font-medium text-bili-text truncate flex-1 cursor-pointer" onClick={() => navigate('/')}>
          影视仓<span className="text-bili-textLight text-sm ml-1">PC</span>
        </h1>
      </header>

      {loading ? (
        <div className="flex-1 flex flex-col justify-center items-center min-h-[40vh] gap-3">
          <div className="w-10 h-10 border-4 border-bili-grayBg border-t-bili-blue rounded-full animate-spin"></div>
          <span className="text-bili-textLight text-sm">加载数据中...</span>
        </div>
      ) : error ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center min-h-[40vh]">
          <SmartImage alt="error" className="w-48 mb-4 opacity-80" fallbackText="加载失败" />
          <p className="text-bili-text font-medium">{error}</p>
        </div>
      ) : (
        <main className="flex-1 max-w-[1400px] mx-auto w-full p-0 sm:p-6 lg:p-8 flex flex-col lg:flex-row gap-4 sm:gap-6 lg:gap-8">
          {/* Left: Player & Info */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="bg-black sm:rounded-xl overflow-hidden shadow-lg sm:mb-4 aspect-video w-full relative z-10">
              <div className="relative w-full h-full">
                <div ref={playerContainerRef} className="w-full h-full" />
                {(playerLoading || playerError) && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
                    {playerError ? (
                      <span className="text-white text-sm px-4 text-center">{playerError}</span>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
                        <span className="text-white text-sm drop-shadow-md">加载中...</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            <div className="mb-4 sm:mb-6 px-4 sm:px-0 pt-4 sm:pt-0">
              <h1 className="text-xl sm:text-2xl font-bold text-bili-text leading-tight mb-2 flex items-center gap-2">
                {detail?.vod_name}
                {headphoneConnected && (
                  <span className="inline-flex items-center justify-center bg-bili-blue/10 text-bili-blue px-2 py-0.5 rounded text-xs" title="耳机已连接">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6c3.314 0 6 2.686 6 6v4a2 2 0 01-2 2h-1a1 1 0 01-1-1v-4a1 1 0 011-1h1a4 4 0 00-8 0h1a1 1 0 011 1v4a1 1 0 01-1 1H8a2 2 0 01-2-2v-4c0-3.314 2.686-6 6-6z"></path></svg>
                    耳机模式
                  </span>
                )}
              </h1>
              <div className="flex items-center text-sm text-bili-textLight gap-4">
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  {playSources[currentSourceIndex]?.episodes[currentEpisodeIndex]?.name}
                </span>
                {detail?.vod_remarks && (
                  <span className="px-2 py-0.5 bg-bili-grayBg text-bili-textLight rounded text-xs">
                    {detail.vod_remarks}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          {/* Right: Playlist */}
          <div className="w-full lg:w-80 xl:w-96 flex-shrink-0 flex flex-col bg-bili-grayBg/30 sm:rounded-xl sm:border border-t border-bili-border overflow-hidden h-fit max-h-[60vh] sm:max-h-[800px]">
            <div className="p-4 border-b border-bili-border bg-white flex justify-between items-center sticky top-0 z-10">
              <h3 className="font-medium text-bili-text">视频选集</h3>
              <div className="flex items-center gap-2">
                <button
                  className={`text-xs px-2 py-1 rounded border transition-colors ${
                    episodeOrder === 'asc'
                      ? 'bg-bili-blue text-white border-bili-blue'
                      : 'bg-white text-bili-textLight border-bili-border hover:text-bili-text'
                  }`}
                  onClick={() => toggleEpisodeOrder('asc')}
                >
                  正序
                </button>
                <button
                  className={`text-xs px-2 py-1 rounded border transition-colors ${
                    episodeOrder === 'desc'
                      ? 'bg-bili-blue text-white border-bili-blue'
                      : 'bg-white text-bili-textLight border-bili-border hover:text-bili-text'
                  }`}
                  onClick={() => toggleEpisodeOrder('desc')}
                >
                  倒序
                </button>
                <span className="text-xs text-bili-textLight bg-bili-grayBg px-2 py-1 rounded">共 {playSources[currentSourceIndex]?.episodes.length || 0} 集</span>
              </div>
            </div>
            
            {playSources.length > 1 && (
              <div className="px-4 py-3 pb-4 bg-white border-b border-bili-border flex items-center flex-nowrap overflow-x-auto overflow-y-hidden custom-scrollbar gap-2">
                {playSources.map((source, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      const startIndex = episodeOrder === 'desc' ? Math.max(0, source.episodes.length - 1) : 0
                      switchEpisode(index, startIndex)
                    }}
                    className={`flex-none whitespace-nowrap px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      currentSourceIndex === index
                        ? 'bg-bili-blue text-white'
                        : 'bg-bili-grayBg text-bili-textLight hover:text-bili-text'
                    }`}
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>{source.sourceName}</span>
                      {sourceSpeed[index]?.status === 'testing' && <span className="opacity-70">…</span>}
                      {sourceSpeed[index]?.status === 'ok' && typeof sourceSpeed[index]?.ms === 'number' && (
                        <span className="opacity-80">{sourceSpeed[index]!.ms}ms</span>
                      )}
                      {sourceSpeed[index]?.status === 'fail' && <span className="opacity-80">×</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
            
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-white">
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-3">
                {orderedEpisodes.map(({ ep, index }) => (
                  <button
                    key={index}
                    onClick={() => switchEpisode(currentSourceIndex, index)}
                    className={`px-2 py-2 border rounded-md text-xs sm:text-sm truncate transition-all text-center ${
                      currentEpisodeIndex === index
                        ? 'bg-white border-bili-blue text-bili-blue shadow-sm font-medium'
                        : 'bg-white border-bili-border text-bili-text hover:border-bili-blue/50 hover:text-bili-blue'
                    }`}
                    title={ep.name}
                  >
                    {ep.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </main>
      )}
    </div>
  )
}

export default Play
