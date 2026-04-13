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
  vod_remarks?: string
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
      theme: '#00AEEC',
      lang: navigator.language.toLowerCase(),
    })

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy(false)
        playerRef.current = null
      }
    }
  }, [playSources, currentSourceIndex, currentEpisodeIndex, detail])

  const switchEpisode = (sIndex: number, eIndex: number) => {
    setCurrentSourceIndex(sIndex)
    setCurrentEpisodeIndex(eIndex)
    navigate(`/play/${siteKey}/${vodId}/${sIndex}/${eIndex}`, { 
      replace: true,
      state: { detail, playSources }
    })
  }

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
          <img src="https://s1.hdslb.com/bfs/static/jinkela/space/assets/nodata.png" alt="error" className="w-48 mb-4 opacity-80" />
          <p className="text-bili-text font-medium">{error}</p>
        </div>
      ) : (
        <main className="flex-1 max-w-[1400px] mx-auto w-full p-4 sm:p-6 lg:p-8 flex flex-col lg:flex-row gap-6 lg:gap-8">
          {/* Left: Player & Info */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="bg-black rounded-xl overflow-hidden shadow-lg mb-4 aspect-video w-full">
              <div ref={artRef} className="w-full h-full"></div>
            </div>
            
            <div className="mb-6">
              <h1 className="text-xl sm:text-2xl font-bold text-bili-text leading-tight mb-2">
                {detail?.vod_name}
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
          <div className="w-full lg:w-80 xl:w-96 flex-shrink-0 flex flex-col bg-bili-grayBg/30 rounded-xl border border-bili-border overflow-hidden h-fit max-h-[800px]">
            <div className="p-4 border-b border-bili-border bg-white flex justify-between items-center">
              <h3 className="font-medium text-bili-text">视频选集</h3>
              <span className="text-xs text-bili-textLight bg-bili-grayBg px-2 py-1 rounded">共 {playSources[currentSourceIndex]?.episodes.length || 0} 集</span>
            </div>
            
            {playSources.length > 1 && (
              <div className="px-4 py-3 bg-white border-b border-bili-border flex overflow-x-auto custom-scrollbar gap-2">
                {playSources.map((source, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentSourceIndex(index)}
                    className={`whitespace-nowrap px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      currentSourceIndex === index
                        ? 'bg-bili-blue text-white'
                        : 'bg-bili-grayBg text-bili-textLight hover:text-bili-text'
                    }`}
                  >
                    {source.sourceName}
                  </button>
                ))}
              </div>
            )}
            
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-white">
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-3">
                {playSources[currentSourceIndex]?.episodes.map((ep, index) => (
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
