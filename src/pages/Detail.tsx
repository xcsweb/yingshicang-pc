import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
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
        // 按照要求添加 ac=detail&ac=videolist&ids=vod_id
        params.delete('ac') // 清除可能已有的 ac 参数
        params.append('ac', 'detail')
        params.append('ac', 'videolist')
        params.set('ids', vodId)
        url.search = params.toString()
        
        const response = await fetchData<{list?: VideoDetail[]}>(url.toString())
        
        if (!response.success) {
          throw new Error(response.error || '请求失败')
        }
        
        if (response.data?.list && response.data.list.length > 0) {
          const videoData = response.data.list[0]
          setDetail(videoData)
          
          // 解析播放线路和剧集
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
    <div className="flex flex-col h-screen bg-gray-50 text-gray-800 overflow-hidden">
      {/* 头部导航 */}
      <div className="bg-white border-b border-gray-200 p-4 flex items-center shadow-sm z-10">
        <button 
          onClick={() => navigate(-1)} 
          className="mr-4 p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
        </button>
        <h1 className="text-xl font-bold text-gray-800 truncate flex-1">
          {detail ? detail.vod_name : '影片详情'}
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {loading ? (
          <div className="flex justify-center items-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-500 font-medium">加载详情中...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-red-500">
            <svg className="w-16 h-16 mb-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <p className="text-lg font-medium text-gray-800">{error}</p>
          </div>
        ) : detail ? (
          <div className="max-w-6xl mx-auto space-y-6">
            {/* 影片信息卡片 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-6 flex flex-col md:flex-row gap-4 md:gap-6">
              <div className="w-32 sm:w-40 md:w-48 flex-shrink-0 mx-auto md:mx-0">
                <div className="aspect-[3/4] rounded-lg overflow-hidden bg-gray-100 shadow-inner">
                  <img 
                    src={detail.vod_pic} 
                    alt={detail.vod_name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://via.placeholder.com/300x400?text=No+Image'
                    }}
                  />
                </div>
              </div>
              
              <div className="flex-1 space-y-3">
                <h2 className="text-2xl font-bold text-gray-900">{detail.vod_name}</h2>
                <div className="flex flex-wrap gap-2 text-sm text-gray-600">
                  {detail.type_name && <span className="px-2 py-1 bg-gray-100 rounded">{detail.type_name}</span>}
                  {detail.vod_year && <span className="px-2 py-1 bg-gray-100 rounded">{detail.vod_year}</span>}
                  {detail.vod_area && <span className="px-2 py-1 bg-gray-100 rounded">{detail.vod_area}</span>}
                  {detail.vod_remarks && <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded">{detail.vod_remarks}</span>}
                </div>
                
                <div className="text-sm space-y-1.5 mt-4 text-gray-700">
                  {detail.vod_director && <p><span className="text-gray-500 mr-2">导演:</span>{detail.vod_director}</p>}
                  {detail.vod_actor && <p><span className="text-gray-500 mr-2">主演:</span>{detail.vod_actor}</p>}
                </div>
                
                {detail.vod_content && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <h3 className="text-sm font-medium text-gray-900 mb-2">剧情简介</h3>
                    <p className="text-sm text-gray-600 leading-relaxed" dangerouslySetInnerHTML={{ __html: detail.vod_content.replace(/<[^>]+>/g, '') }}></p>
                  </div>
                )}
              </div>
            </div>

            {/* 播放线路和剧集列表 */}
            {playSources.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-6">
                <div className="flex flex-wrap gap-2 mb-4 md:mb-6 border-b border-gray-100 pb-3 md:pb-4">
                  {playSources.map((source, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentSourceIndex(index)}
                      className={`px-3 md:px-4 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium transition-colors ${
                        currentSourceIndex === index
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {source.sourceName}
                    </button>
                  ))}
                </div>
                
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2 md:gap-3">
                  {playSources[currentSourceIndex]?.episodes.map((ep, index) => (
                    <button
                      key={index}
                      className="px-2 py-2 bg-gray-50 border border-gray-200 rounded text-xs md:text-sm text-gray-700 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors truncate text-center"
                      title={ep.name}
                      onClick={() => {
                        console.log('Play episode:', ep.url)
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
    </div>
  )
}

export default Detail
