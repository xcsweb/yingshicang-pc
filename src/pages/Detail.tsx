import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDataSourceStore } from '../store/dataSource'
import { fetchData } from '../utils/request'
import SmartImage from '../components/SmartImage'

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
  vod_remarks?: string
  vod_actor?: string
  vod_director?: string
  vod_content?: string
  vod_year?: string
  vod_area?: string
  type_name?: string
  vod_play_from?: string
  vod_play_url?: string
}

const Detail: React.FC = () => {
  const { siteKey, vodId } = useParams<{ siteKey: string; vodId: string }>()
  const navigate = useNavigate()
  const { sites } = useDataSourceStore()
  
  const [detail, setDetail] = useState<VideoDetail | null>(null)
  const [playSources, setPlaySources] = useState<PlaySource[]>([])
  const [currentSourceIndex, setCurrentSourceIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchDetail = async () => {
      if (!siteKey || !vodId) return
      const site = sites.find(s => s.key === siteKey)
      if (!site) {
        setError('找不到对应的数据源')
        return
      }

      const apiUrl = site.api || site.url || ''
      if (!apiUrl) {
        setError('站点 API 无效')
        return
      }

      setLoading(true)
      
      if (typeof window !== 'undefined' && window.location.hostname === 'localhost' && site.key === 'mock1') {
        setDetail({
            vod_id: 1,
            vod_name: "Test Movie",
            vod_pic: "https://via.placeholder.com/150",
            vod_remarks: "HD",
            vod_play_from: "m3u8$$$mp4",
            vod_play_url: "第1集$http://mock.mp4#第2集$http://mock.mp4",
            vod_content: "Test Description"
        })
        
        const sources = "m3u8$$$mp4".split('$$$')
        const urls = "第1集$http://mock.mp4#第2集$http://mock.mp4".split('$$$')
        
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
        
        if (!response.success) {
          throw new Error(response.error || '请求失败')
        }
        
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
  }, [siteKey, vodId, sites])

  return (
    <div className="flex flex-col min-h-screen bg-white text-bili-text">
      {/* 头部导航 */}
      <header className="sticky top-0 z-50 bg-white border-b border-bili-border h-16 flex items-center px-4 sm:px-6 shadow-sm">
        <button 
          onClick={() => navigate(-1)} 
          className="mr-4 p-2 text-bili-textLight hover:text-bili-text hover:bg-bili-grayBg rounded-full transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
        </button>
        <h1 className="text-lg font-medium text-bili-text truncate flex-1">
          {detail ? detail.vod_name : '影片详情'}
        </h1>
      </header>

      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 custom-scrollbar bg-white">
        <div className="max-w-6xl mx-auto">
          {loading ? (
            <div className="flex flex-col justify-center items-center min-h-[40vh] gap-3">
              <div className="w-10 h-10 border-4 border-bili-grayBg border-t-bili-blue rounded-full animate-spin"></div>
              <span className="text-bili-textLight text-sm">正在加载中...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
              <SmartImage alt="error" className="w-48 mb-4 opacity-80" fallbackText="加载失败" />
              <p className="text-bili-text font-medium mb-1">{error}</p>
            </div>
          ) : detail ? (
            <div className="space-y-8">
              {/* 影片信息区域 */}
              <div className="flex flex-col md:flex-row gap-6 lg:gap-10">
                <div className="w-40 sm:w-48 lg:w-56 flex-shrink-0 mx-auto md:mx-0">
                  <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-bili-grayBg shadow-md">
                    <SmartImage src={detail.vod_pic} alt={detail.vod_name} fallbackText={detail.vod_name} className="w-full h-full object-cover" />
                  </div>
                </div>
                
                <div className="flex-1 flex flex-col justify-center space-y-4">
                  <div>
                    <h2 className="text-2xl sm:text-3xl font-bold text-bili-text leading-tight mb-2">{detail.vod_name}</h2>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-sm">
                      {detail.type_name && <span className="px-2 py-0.5 bg-bili-grayBg text-bili-textLight rounded">{detail.type_name}</span>}
                      {detail.vod_year && <span className="text-bili-textLight">{detail.vod_year}</span>}
                      {detail.vod_area && <span className="text-bili-textLight">{detail.vod_area}</span>}
                      {detail.vod_remarks && <span className="text-bili-pink font-medium">{detail.vod_remarks}</span>}
                    </div>
                  </div>
                  
                  <div className="text-sm text-bili-textLight space-y-2">
                    {detail.vod_director && <p><span className="text-bili-textMuted mr-3">导演</span><span className="text-bili-text">{detail.vod_director}</span></p>}
                    {detail.vod_actor && <p><span className="text-bili-textMuted mr-3">主演</span><span className="text-bili-text leading-relaxed">{detail.vod_actor}</span></p>}
                  </div>
                  
                  {detail.vod_content && (
                    <div className="pt-2">
                      <p className="text-sm text-bili-textLight leading-relaxed line-clamp-3 hover:line-clamp-none transition-all cursor-pointer" dangerouslySetInnerHTML={{ __html: detail.vod_content.replace(/<[^>]+>/g, '') }}></p>
                    </div>
                  )}
                </div>
              </div>

              {/* 播放线路和剧集列表 */}
              {playSources.length > 0 && (
                <div className="pt-8 border-t border-bili-border">
                  <div className="flex items-center gap-4 mb-6">
                    <h3 className="text-lg font-bold text-bili-text">播放列表</h3>
                    <div className="flex bg-bili-grayBg rounded-lg p-1 overflow-x-auto custom-scrollbar">
                      {playSources.map((source, index) => (
                        <button
                          key={index}
                          onClick={() => setCurrentSourceIndex(index)}
                          className={`whitespace-nowrap px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                            currentSourceIndex === index
                              ? 'bg-white text-bili-blue shadow-sm'
                              : 'text-bili-textLight hover:text-bili-text'
                          }`}
                        >
                          {source.sourceName}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                    {playSources[currentSourceIndex]?.episodes.map((ep, index) => (
                      <button
                        key={index}
                        className="px-3 py-2.5 bg-white border border-bili-border rounded-lg text-sm text-bili-text hover:border-bili-blue hover:text-bili-blue hover:bg-bili-blue/5 transition-all truncate text-center font-medium"
                        title={ep.name}
                        onClick={() => {
                          navigate(`/play/${siteKey}/${vodId}/${currentSourceIndex}/${index}`, {
                            state: { detail, playSources }
                          })
                        }}
                      >
                        {ep.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  )
}

export default Detail
