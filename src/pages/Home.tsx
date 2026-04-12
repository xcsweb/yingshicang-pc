import React, { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDataSourceStore } from '../store/dataSource'
import { fetchData } from '../utils/request'

interface Category {
  type_id: string | number
  type_name: string
}

interface Video {
  vod_id: string | number
  vod_name: string
  vod_pic: string
  vod_remarks?: string
}

interface SiteResponse {
  class?: Category[]
  list?: Video[]
}

const Home: React.FC = () => {
  const navigate = useNavigate()
  const { sites } = useDataSourceStore()
  
  // 过滤出 API 为 HTTP/HTTPS 开头的站点
  const validSites = sites.filter(s => {
      // console.log("Checking valid site:", s.name, s.api, s.url);
      return s.api?.startsWith('http') || s.url?.startsWith('http') || s.api?.includes('mock') || s.url?.includes('mock')
  })
  
  const [currentSiteKey, setCurrentSiteKey] = useState<string>('')
  
  const currentSite = React.useMemo(() => {
    const site = validSites.find(s => s.key === currentSiteKey)
    if (site) return site
    return validSites.length > 0 ? validSites[0] : null
  }, [validSites, currentSiteKey])

  const [categories, setCategories] = useState<Category[]>([])
  const [videos, setVideos] = useState<Video[]>([])
  const [currentCategory, setCurrentCategory] = useState<string | number>('')
  const [keyword, setKeyword] = useState<string>('')
  const [searchInput, setSearchInput] = useState<string>('')
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const triedSitesRef = useRef<Set<string>>(new Set())

  // 初始化默认选中第一个有效站点
  useEffect(() => {
    if (!sites || sites.length === 0) return
    // Default to the first valid site if none selected
    if (!currentSiteKey && validSites.length > 0) {
      setCurrentSiteKey(validSites[0].key)
    }
  }, [sites, currentSiteKey, validSites])

  const loadSiteData = async (siteKey: string, categoryId?: string | number, searchKeyword?: string) => {
    const site = validSites.find(s => s.key === siteKey)
    if (!site) {
      console.log("No valid site found for key", siteKey, validSites)
      return false
    }
    
    setLoading(true)
    setError(null)
    
    try {
      console.log("Loading site data for:", site)
        const apiUrl = site.api || site.url || ''
        if (!apiUrl) {
            console.error("Invalid site API", site)
            throw new Error('Invalid site API')
        }
      if (typeof window !== 'undefined' && window.location.hostname === 'localhost' && site.key === 'mock1') {
        const mockData = {
          class: [{ type_id: 1, type_name: "电影" }],
          list: [
            { vod_id: 1, vod_name: "Test Movie", vod_pic: "https://via.placeholder.com/150", vod_remarks: "HD", vod_play_from: "m3u8$$$mp4", vod_play_url: "第1集$http://mock.mp4#第2集$http://mock.mp4" }
          ]
        }
        setCategories(mockData.class)
        setVideos(mockData.list)
        setLoading(false)
        return true
      }
      
      const url = new URL(apiUrl)
      
      if (searchKeyword) {
        url.searchParams.set('ac', 'detail')
        url.searchParams.set('wd', searchKeyword)
      } else {
        url.searchParams.set('ac', categoryId ? 'videolist' : 'list')
        if (categoryId) {
          url.searchParams.set('t', String(categoryId))
        }
      }
      
      const fetchUrl = url.toString()
      console.log("Fetching home data from:", fetchUrl)
      const response = await fetchData<SiteResponse>(fetchUrl)
      
      if (!response.success) {
        throw new Error(response.error || '请求失败')
      }
      
      const data = response.data
      
      if (data?.class && !categoryId && !searchKeyword) {
        if (Array.isArray(data.class)) {
          setCategories(data.class)
        } else {
          setCategories([])
        }
      }
      
      if (data?.list) {
        if (Array.isArray(data.list)) {
          setVideos(data.list)
        } else {
          setVideos([])
        }
      } else {
        setVideos([])
      }
      
      return true
    } catch (err: unknown) {
      console.error("Home: Failed to load videos", err)
      setError(err instanceof Error ? err.message : '获取数据失败')
      return false
    } finally {
      setLoading(false)
    }
  }

  const autoNextSite = (failedKey: string) => {
    triedSitesRef.current.add(failedKey)
    const currentIndex = validSites.findIndex(s => s.key === failedKey)
    if (currentIndex >= 0 && currentIndex < validSites.length - 1) {
      for (let i = currentIndex + 1; i < validSites.length; i++) {
        const nextSite = validSites[i]
        if (!triedSitesRef.current.has(nextSite.key)) {
          setCurrentSiteKey(nextSite.key)
          setCurrentCategory('')
          setKeyword('')
          setSearchInput('')
          return
        }
      }
    }
  }

  // 监听站点或分类或搜索变化
  useEffect(() => {
    if (currentSite) {
       const tryLoad = async () => {
         const success = await loadSiteData(currentSite.key, currentCategory, keyword)
         // 如果请求失败且是加载首页（非特定分类和非搜索），则尝试下一个站点
         if (!success && !currentCategory && !keyword) {
           autoNextSite(currentSite.key)
         }
       }
       tryLoad()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSite, currentCategory, keyword])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentSiteKey) return
    setKeyword(searchInput)
    setCurrentCategory('')
  }

  const handleSiteChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCurrentSiteKey(e.target.value)
    setCurrentCategory('') // 切换站点时重置分类
    setKeyword('') // 切换站点时重置搜索
    setSearchInput('') // 重置输入框
    triedSitesRef.current.clear() // 手动切换时重置尝试记录
  }

  if (sites.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 text-gray-800">
        <h2 className="text-2xl mb-4 font-semibold">尚未配置数据源</h2>
        <p className="text-gray-500 mb-6">请先前往设置页面配置 TVBox 数据源接口</p>
        <button 
          onClick={() => navigate('/settings')} 
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded shadow transition-colors"
        >
          去设置
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-gray-50 text-gray-800">
      {/* 移动端侧边栏遮罩 */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* 侧边栏 */}
      <div className={`fixed inset-y-0 left-0 z-40 transform bg-white w-64 border-r border-gray-200 flex flex-col transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <h1 className="text-xl font-bold text-gray-800">影视仓 PC</h1>
          <button 
            onClick={() => {
              setIsMobileMenuOpen(false)
              navigate('/settings')
            }} 
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            设置
          </button>
        </div>
        
        <div className="p-4 border-b border-gray-100">
          <label className="block text-sm font-medium text-gray-700 mb-2">选择站点</label>
          <select 
            value={currentSiteKey} 
            onChange={(e) => {
              handleSiteChange(e)
              setIsMobileMenuOpen(false)
            }}
            className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {validSites.map(site => (
              <option key={site.key} value={site.key}>{site.name}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {validSites.map(site => (
             <div 
               key={site.key}
               onClick={() => {
                 setCurrentSiteKey(site.key)
                 setCurrentCategory('')
                 setKeyword('')
                 setSearchInput('')
                 triedSitesRef.current.clear()
                 setIsMobileMenuOpen(false)
               }}
               className={`px-4 py-3 cursor-pointer text-sm border-b border-gray-50 transition-colors ${
                 currentSiteKey === site.key 
                   ? 'bg-blue-50 text-blue-700 font-medium border-l-4 border-l-blue-600' 
                   : 'text-gray-600 hover:bg-gray-100 border-l-4 border-l-transparent'
               }`}
             >
               {site.name}
             </div>
          ))}
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 relative z-10">
        {/* 顶部搜索区 */}
        <div className="bg-white border-b border-gray-200 p-3 flex justify-between items-center shadow-sm z-20 gap-3">
          <button 
            className="md:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-lg focus:outline-none"
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
          </button>

          <form onSubmit={handleSearch} className="flex flex-1 max-w-md ml-auto">
            <input 
              type="text" 
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="搜索影片..." 
              className="flex-1 border border-gray-300 rounded-l px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 min-w-0"
            />
            <button 
              type="submit" 
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 sm:px-4 py-1.5 rounded-r text-sm font-medium transition-colors flex-shrink-0"
            >
              搜索
            </button>
          </form>
        </div>

        {/* 分类 Tabs */}
        <div className="bg-white border-b border-gray-200 shadow-sm z-10">
          <div className="flex overflow-x-auto p-3 gap-2 custom-scrollbar">
             <button
               onClick={() => {
                 setCurrentCategory('')
                 setKeyword('')
                 setSearchInput('')
               }}
               className={`whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                 currentCategory === '' && !keyword
                   ? 'bg-blue-600 text-white shadow-sm' 
                   : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
               }`}
             >
               最新推荐
             </button>
             {categories.map(cat => (
               <button
                 key={cat.type_id}
                 onClick={() => {
                   setCurrentCategory(cat.type_id)
                   setKeyword('')
                   setSearchInput('')
                 }}
                 className={`whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                   currentCategory === cat.type_id && !keyword
                     ? 'bg-blue-600 text-white shadow-sm' 
                     : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                 }`}
               >
                 {cat.type_name}
               </button>
             ))}
          </div>
        </div>

        {/* 影视卡片列表 */}
        <div className="flex-1 overflow-y-auto p-2 sm:p-4 custom-scrollbar">
          {loading ? (
            <div className="flex justify-center items-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-500 font-medium">加载中...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full text-red-500 p-4 text-center">
              <svg className="w-16 h-16 mb-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              <p className="text-lg font-medium text-gray-800">{error}</p>
              <p className="text-gray-500 mt-2 text-sm">该站点可能无法访问或接口格式不支持</p>
              <button 
                onClick={() => autoNextSite(currentSiteKey)} 
                className="mt-6 px-6 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors font-medium"
              >
                尝试下一个站点
              </button>
            </div>
          ) : videos.length === 0 ? (
            <div className="flex flex-col justify-center items-center h-full text-gray-400">
              <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path></svg>
              <p className="text-lg">暂无数据</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-4">
              {videos.map(video => (
                <div 
                  key={video.vod_id} 
                  onClick={() => navigate(`/detail/${currentSiteKey}/${video.vod_id}`)}
                  className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden group cursor-pointer hover:shadow-md transition-all duration-300 flex flex-col"
                >
                  <div className="relative aspect-[3/4] overflow-hidden bg-gray-100 w-full">
                    <img 
                      src={video.vod_pic} 
                      alt={video.vod_name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://via.placeholder.com/300x400?text=No+Image'
                      }}
                    />
                    {video.vod_remarks && (
                      <div className="absolute bottom-0 right-0 bg-black/70 text-white text-xs px-2 py-1 rounded-tl-lg backdrop-blur-sm">
                        {video.vod_remarks}
                      </div>
                    )}
                  </div>
                  <div className="p-2.5 flex-1 flex flex-col justify-center">
                    <h3 className="text-sm font-medium truncate text-gray-800 group-hover:text-blue-600 transition-colors" title={video.vod_name}>
                      {video.vod_name}
                    </h3>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Home
