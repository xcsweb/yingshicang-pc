import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Artplayer from 'artplayer'
import Hls from 'hls.js'
import { fetchText } from '../utils/request'

type LiveChannel = { name: string; url: string }
type LiveGroup = { name: string; channels: LiveChannel[] }

const PRESET_LIVE_URLS = [
  { name: '盒子迷-直播', url: 'https://盒子迷.top/ZB' },
]

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

const isLikelyHlsUrl = (raw: string): boolean => {
  const lower = (raw || '').toLowerCase()
  return lower.includes('.m3u8') || lower.includes('m3u8')
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

const parseLiveList = (text: string): LiveGroup[] => {
  const lines = (text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const groups: LiveGroup[] = []
  let current: LiveGroup = { name: '默认', channels: [] }
  groups.push(current)

  for (const line of lines) {
    if (line.startsWith('#') || line.startsWith('//')) continue

    const parts = line.split(',').map(p => p.trim()).filter(Boolean)
    if (parts.length >= 2 && /#genre#/i.test(parts[1])) {
      const name = parts[0] || '默认'
      current = { name, channels: [] }
      groups.push(current)
      continue
    }

    if (parts.length >= 2) {
      const name = parts[0] || '频道'
      const url = parts.slice(1).join(',').trim()
      if (url) current.channels.push({ name, url })
      continue
    }

    const fallback = line.split(/\s+/).filter(Boolean)
    if (fallback.length >= 2) {
      const name = fallback[0]
      const url = fallback.slice(1).join(' ')
      if (url) current.channels.push({ name, url })
    }
  }

  return groups.filter(g => g.channels.length > 0)
}

const Live: React.FC = () => {
  const navigate = useNavigate()
  const [inputUrl, setInputUrl] = useState(PRESET_LIVE_URLS[0]?.url || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rawText, setRawText] = useState<string>('')

  const groups = useMemo(() => parseLiveList(rawText), [rawText])
  const flatChannels = useMemo(() => groups.flatMap(g => g.channels.map(c => ({ ...c, group: g.name }))), [groups])

  const [currentIndex, setCurrentIndex] = useState(0)
  const playerContainerRef = useRef<HTMLDivElement>(null)
  const artRef = useRef<any>(null)
  const hlsRef = useRef<Hls | null>(null)

  const currentChannel = flatChannels[currentIndex] || null

  const loadList = async (url: string) => {
    const normalized = normalizeUrl(url)
    if (!normalized || !isHttpUrl(normalized)) {
      setError('直播列表地址无效')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetchText(normalized)
      if (!res.success) throw new Error(res.error || '加载失败')
      const text = String(res.data || '')
      const parsed = parseLiveList(text)
      if (!parsed.length) throw new Error('未解析到可用频道')
      setRawText(text)
      setCurrentIndex(0)
    } catch (e: any) {
      setError(e?.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadList(inputUrl)
  }, [])

  useEffect(() => {
    const ch = currentChannel
    if (!ch) return
    if (!playerContainerRef.current) return

    if (artRef.current) {
      artRef.current.destroy(false)
      artRef.current = null
    }
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    const container = playerContainerRef.current
    container.innerHTML = ''

    const url = ch.url.trim()
    const isHls = isLikelyHlsUrl(url)
    const initUrl = isHls ? url : toProxyUrl(url)

    const art = new Artplayer({
      container,
      url: initUrl,
      autoplay: true,
      setting: true,
      playbackRate: true,
      hotkey: true,
      pip: true,
      fullscreen: true,
      fullscreenWeb: true,
      screenshot: true,
      mutex: true,
      moreVideoAttr: {
        playsInline: true,
        preload: 'metadata',
      },
      type: isHls ? 'm3u8' : '',
      customType: {
        m3u8: (video: HTMLVideoElement, u: string) => {
          if (hlsRef.current) {
            hlsRef.current.destroy()
            hlsRef.current = null
          }
          if (!Hls.isSupported()) {
            video.src = toProxyUrl(u)
            return
          }
          const hls = new Hls({
            enableWorker: true,
            backBufferLength: 30,
            xhrSetup: (xhr, reqUrl) => {
              xhr.open('GET', toProxyUrl(reqUrl), true)
            },
          })
          hlsRef.current = hls
          hls.loadSource(u)
          hls.attachMedia(video)
        },
      },
    })

    artRef.current = art

    return () => {
      if (artRef.current) {
        artRef.current.destroy(false)
        artRef.current = null
      }
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [currentChannel?.url])

  return (
    <div className="flex flex-col min-h-screen bg-white text-bili-text">
      <header className="sticky top-0 z-50 bg-white border-b border-bili-border h-16 flex items-center px-4 sm:px-6 shadow-sm">
        <button
          onClick={() => navigate(-1)}
          className="mr-4 p-2 text-bili-textLight hover:text-bili-text hover:bg-bili-grayBg rounded-full transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
        </button>
        <h1 className="text-lg font-medium text-bili-text truncate flex-1 cursor-pointer" onClick={() => navigate('/')}>
          直播<span className="text-bili-textLight text-sm ml-1">Live</span>
        </h1>
        <button
          onClick={() => navigate('/settings')}
          className="p-2 text-bili-textLight hover:text-bili-text hover:bg-bili-grayBg rounded-full transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
        </button>
      </header>

      <main className="flex-1 max-w-[1400px] mx-auto w-full p-4 sm:p-6 lg:p-8 flex flex-col lg:flex-row gap-6 lg:gap-8">
        <div className="flex-1 flex flex-col min-w-0">
          <div className="bg-black rounded-xl overflow-hidden shadow-lg mb-4 aspect-video w-full">
            <div className="w-full h-full" ref={playerContainerRef} />
          </div>

          <div className="bg-white rounded-xl border border-bili-border shadow-sm p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 text-bili-textMuted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
                </div>
                <input
                  value={inputUrl}
                  onChange={e => setInputUrl(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-bili-border bg-bili-grayBg/50 text-bili-text focus:outline-none focus:border-bili-blue focus:bg-white focus:ring-1 focus:ring-bili-blue transition-all"
                  placeholder="直播列表地址"
                />
              </div>
              <button
                onClick={() => loadList(inputUrl)}
                disabled={loading || !inputUrl}
                className="px-6 py-2.5 rounded-lg bg-bili-blue text-white font-medium hover:bg-bili-blueHover disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center min-w-[120px]"
              >
                {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : '加载'}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2.5">
              {PRESET_LIVE_URLS.map(p => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => {
                    setInputUrl(p.url)
                    loadList(p.url)
                  }}
                  className={`px-4 py-2 text-sm rounded-full transition-colors border ${
                    inputUrl === p.url
                      ? 'border-bili-blue text-bili-blue bg-bili-blue/5 font-medium'
                      : 'border-bili-border bg-white text-bili-textLight hover:text-bili-blue hover:border-bili-blue/50'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
            {error && <p className="text-bili-pink text-sm mt-3">{error}</p>}
            {currentChannel && (
              <p className="text-bili-textLight text-xs mt-2">
                当前：{currentChannel.group} · {currentChannel.name}
              </p>
            )}
          </div>
        </div>

        <div className="w-full lg:w-80 xl:w-96 flex-shrink-0 flex flex-col bg-bili-grayBg/30 rounded-xl border border-bili-border overflow-hidden h-fit max-h-[800px]">
          <div className="p-4 border-b border-bili-border bg-white flex justify-between items-center">
            <h3 className="font-medium text-bili-text">频道列表</h3>
            <span className="text-xs text-bili-textLight bg-bili-grayBg px-2 py-1 rounded">共 {flatChannels.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-white">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-3">
              {flatChannels.map((c, idx) => (
                <button
                  key={`${c.group}-${c.name}-${idx}`}
                  onClick={() => setCurrentIndex(idx)}
                  className={`px-2 py-2 border rounded-md text-xs sm:text-sm truncate transition-all text-center ${
                    idx === currentIndex
                      ? 'bg-white border-bili-blue text-bili-blue shadow-sm font-medium'
                      : 'bg-white border-bili-border text-bili-text hover:border-bili-blue/50 hover:text-bili-blue'
                  }`}
                  title={`${c.group} · ${c.name}`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default Live

