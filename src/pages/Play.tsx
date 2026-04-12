import React, { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import Artplayer from 'artplayer'
import Hls from 'hls.js'
import { useDataSourceStore } from '../store/dataSource'
import { fetchData } from '../utils/request'

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
  
  const artRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<Artplayer | null>(null)

  // Fetch data if not passed via state
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
        params.append('ac', 'detail')
        params.append('ac', 'videolist')
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

  // Initialize player
  useEffect(() => {
    if (!playSources.length || !artRef.current) return

    const source = playSources[currentSourceIndex]
    if (!source) return
    const episode = source.episodes[currentEpisodeIndex]
    if (!episode) return

    const playM3u8 = (video: HTMLMediaElement, url: string, art: any) => {
      if (Hls.isSupported()) {
        if (art.hls) art.hls.destroy()
        const hls = new Hls()
        hls.loadSource(url)
        hls.attachMedia(video)
        art.hls = hls
        art.on('destroy', () => hls.destroy())
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url
      } else {
        art.notice.show = 'Unsupported playback format: m3u8'
      }
    }

    // Destroy previous instance
    if (playerRef.current) {
      playerRef.current.destroy(false)
    }

    const isM3u8 = episode.url.includes('.m3u8')

    playerRef.current = new Artplayer({
      container: artRef.current,
      url: episode.url,
      type: isM3u8 ? 'm3u8' : 'auto',
      customType: {
        m3u8: playM3u8,
      },
      volume: 0.5,
      isLive: false,
      muted: false,
      autoplay: true,
      pip: true,
      autoSize: true,
      autoMini: true,
      screenshot: true,
      setting: true,
      loop: false,
      flip: true,
      playbackRate: true,
      aspectRatio: true,
      fullscreen: true,
      fullscreenWeb: true,
      subtitleOffset: true,
      miniProgressBar: true,
      mutex: true,
      backdrop: true,
      playsInline: true,
      autoPlayback: true,
      airplay: true,
      theme: '#2563eb',
      lang: navigator.language.toLowerCase(),
    })

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy(false)
        playerRef.current = null
      }
    }
  }, [playSources, currentSourceIndex, currentEpisodeIndex, detail])

  // Handle switching source or episode
  const switchEpisode = (sIndex: number, eIndex: number) => {
    setCurrentSourceIndex(sIndex)
    setCurrentEpisodeIndex(eIndex)
    navigate(`/play/${siteKey}/${vodId}/${sIndex}/${eIndex}`, { 
      replace: true,
      state: { detail, playSources }
    })
  }

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-100 overflow-hidden">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-4 flex items-center shadow-md z-10 flex-shrink-0">
        <button 
          onClick={() => navigate(-1)} 
          className="mr-4 p-2 hover:bg-gray-700 rounded-full transition-colors"
        >
          <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
        </button>
        <h1 className="text-xl font-bold text-gray-100 truncate flex-1">
          {detail ? detail.vod_name : '正在播放'}
          {playSources[currentSourceIndex] && (
            <span className="ml-2 text-sm font-normal text-gray-400">
              - {playSources[currentSourceIndex].episodes[currentEpisodeIndex]?.name}
            </span>
          )}
        </h1>
      </div>

      {loading ? (
        <div className="flex-1 flex justify-center items-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <span className="ml-3 text-gray-400 font-medium">加载数据中...</span>
        </div>
      ) : error ? (
        <div className="flex-1 flex flex-col items-center justify-center text-red-500">
          <svg className="w-16 h-16 mb-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          <p className="text-lg font-medium text-gray-200">{error}</p>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
          {/* Player Area */}
          <div className="w-full md:flex-1 bg-black flex flex-col flex-none aspect-video md:aspect-auto min-h-0">
            <div ref={artRef} className="w-full h-full"></div>
          </div>
          
          {/* Playlist Sidebar */}
          <div className="flex-1 md:flex-none w-full md:w-80 lg:w-96 bg-gray-800 border-t md:border-t-0 md:border-l border-gray-700 flex flex-col overflow-hidden">
            <div className="p-3 md:p-4 border-b border-gray-700 flex-shrink-0 overflow-x-auto custom-scrollbar">
              <div className="flex gap-2 whitespace-nowrap">
                {playSources.map((source, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentSourceIndex(index)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      currentSourceIndex === index
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {source.sourceName}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 md:p-4 custom-scrollbar">
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {playSources[currentSourceIndex]?.episodes.map((ep, index) => (
                  <button
                    key={index}
                    onClick={() => switchEpisode(currentSourceIndex, index)}
                    className={`px-2 py-1.5 md:py-2 border rounded text-xs md:text-sm truncate transition-colors text-center ${
                      currentEpisodeIndex === index
                        ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                        : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-500 hover:text-white'
                    }`}
                    title={ep.name}
                  >
                    {ep.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Play
