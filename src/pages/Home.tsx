import React, { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDataSourceStore } from '../store/dataSource'
import { fetchData } from '../utils/request'
import SmartImage from '../components/SmartImage'

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
  
  const validSites = sites.filter(s => {
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

  useEffect(() => {
    if (!sites || sites.length === 0) return
    if (!currentSiteKey && validSites.length > 0) {
      setCurrentSiteKey(validSites[0].key)
    }
  }, [sites, currentSiteKey, validSites])

  const loadSiteData = async (siteKey: string, categoryId?: string | number, searchKeyword?: string) => {
    const site = validSites.find(s => s.key === siteKey)
    if (!site) return false
    
    setLoading(true)
    setError(null)
    
    try {
      const apiUrl = site.api || site.url || ''
      if (!apiUrl) throw new Error('Invalid site API')

      if (typeof window !== 'undefined' && window.location.hostname === 'localhost' && site.key === 'mock1') {
        const mockCategories: Category[] = [
          { type_id: 1, type_name: "电影" },
          { type_id: 2, type_name: "电视剧" },
          { type_id: 3, type_name: "综艺" },
          { type_id: 4, type_name: "动漫" },
        ]

        const allVideos = Array.from({ length: 24 }).map((_, i) => {
          const typeId = (i % mockCategories.length) + 1
          return {
            vod_id: i + 1,
            vod_name: `测试${mockCategories[typeId - 1].type_name}内容 ${i + 1}`,
            vod_pic: `https://picsum.photos/seed/${i + 1}/300/400`,
            vod_remarks: "HD",
            __type_id: typeId,
          }
        })

        const filteredVideos = searchKeyword
          ? allVideos.filter(v => v.vod_name.includes(searchKeyword))
          : categoryId
            ? allVideos.filter(v => String(v.__type_id) === String(categoryId))
            : allVideos

        setCategories(mockCategories)
        setVideos(filteredVideos.map(({ __type_id: _typeId, ...rest }) => rest))
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
      
      const response = await fetchData<SiteResponse>(url.toString())
      if (!response.success) {
        // 如果是 530 这种特定的代理错误，明确抛出以供区分
        if (response.error?.includes('530')) throw new Error('ProxyError: 530')
        throw new Error(response.error || '请求失败')
      }
      
      const data = response.data
      const nextCategories = data?.class && Array.isArray(data.class) ? data.class : []
      if (!categoryId && !searchKeyword) {
        setCategories(nextCategories)
      }

      const nextVideos = data?.list && Array.isArray(data.list) ? data.list : []
      setVideos(nextVideos)

      return nextCategories.length > 0 || nextVideos.length > 0
    } catch (err: unknown) {
      console.error("Home: Failed to load videos", err)
      const errorMsg = err instanceof Error ? err.message : '获取数据失败'
      
      // 如果明确是 530（目标源 DNS 挂了或者防爬），记录提示但不阻断自动切换
      if (errorMsg.includes('ProxyError: 530')) {
        setError('该站点当前不可用（源服务器 DNS 解析失败或反代拦截），正在尝试下一个源...')
      } else {
        setError(errorMsg)
      }
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

  useEffect(() => {
    if (currentSite) {
       const tryLoad = async () => {
         const success = await loadSiteData(currentSite.key, currentCategory, keyword)
         if (!success) {
           // 无论是不是分类或搜索，只要加载失败，如果是刚进首页就自动尝试下一个源
           if (!currentCategory && !keyword) {
             autoNextSite(currentSite.key)
           }
         }
       }
       tryLoad()
    }
  }, [currentSite, currentCategory, keyword])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentSiteKey) return
    setLoading(true)
    setError(null)
    setVideos([])
    setKeyword(searchInput)
    setCurrentCategory('')
  }

  if (sites.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white text-bili-text">
        <h2 className="text-2xl mb-4 font-medium">尚未配置数据源</h2>
        <p className="text-bili-textLight mb-6">请先前往设置页面配置 TVBox 数据源接口</p>
        <button 
          onClick={() => navigate('/settings')} 
          className="px-6 py-2.5 bg-bili-blue hover:bg-bili-blueHover text-white rounded-lg transition-colors"
        >
          前往设置
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-white text-bili-text">
      {/* 顶部导航 Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-bili-border h-16 flex items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <h1 className="text-2xl font-bold text-bili-pink cursor-pointer tracking-wide" onClick={() => {
            setCurrentCategory('')
            setKeyword('')
            setSearchInput('')
          }}>
            影视仓<span className="text-bili-text text-lg ml-1">PC</span>
          </h1>
          
          {/* Site Selector (Desktop) */}
          <div className="hidden md:flex items-center">
            <select 
              value={currentSiteKey} 
              onChange={(e) => {
                setCurrentSiteKey(e.target.value)
                setCurrentCategory('')
                setKeyword('')
                setSearchInput('')
                triedSitesRef.current.clear()
              }}
              className="bg-transparent border-none text-sm text-bili-textLight hover:text-bili-text cursor-pointer focus:ring-0 outline-none"
            >
              {validSites.map(site => (
                <option key={site.key} value={site.key}>{site.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex-1 max-w-xl px-4 hidden sm:block">
          <form onSubmit={handleSearch} className="relative flex items-center w-full">
            <input 
              type="text" 
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="搜索影片..." 
              className="w-full bg-bili-grayBg border border-transparent hover:bg-white hover:border-bili-border focus:bg-white focus:border-bili-border rounded-full py-2 pl-4 pr-12 text-sm outline-none transition-all"
            />
            <button 
              type="submit" 
              className="absolute right-2 p-1.5 text-bili-textLight hover:text-bili-text"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </button>
          </form>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-4">
          <button 
            className="sm:hidden p-2 text-bili-textLight hover:text-bili-text"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </button>
          <button
            onClick={() => navigate('/live')}
            className="flex items-center gap-1.5 text-sm text-bili-textLight hover:text-bili-text transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14m-6 0h3a2 2 0 002-2V8a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm-2 7h8"></path></svg>
            <span className="hidden sm:inline">直播</span>
          </button>
          <button 
            onClick={() => navigate('/settings')}
            className="flex items-center gap-1.5 text-sm text-bili-textLight hover:text-bili-text transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            <span className="hidden sm:inline">设置</span>
          </button>
        </div>
      </header>

      {/* Mobile Search & Site Selector Dropdown */}
      {isMobileMenuOpen && (
        <div className="sm:hidden bg-white border-b border-bili-border p-4 space-y-3 shadow-md absolute w-full z-40 top-16">
          <form onSubmit={(e) => { handleSearch(e); setIsMobileMenuOpen(false) }} className="relative flex items-center w-full">
            <input 
              type="text" 
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="搜索影片..." 
              className="w-full bg-bili-grayBg rounded-full py-2 pl-4 pr-10 text-sm outline-none"
            />
            <button type="submit" className="absolute right-3 text-bili-textLight">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </button>
          </form>
          <div className="flex items-center gap-2 text-sm text-bili-textLight">
            <span>当前站点:</span>
            <select 
              value={currentSiteKey} 
              onChange={(e) => {
                setCurrentSiteKey(e.target.value)
                setCurrentCategory('')
                setKeyword('')
                setSearchInput('')
                triedSitesRef.current.clear()
                setIsMobileMenuOpen(false)
              }}
              className="flex-1 bg-bili-grayBg border-none rounded py-1 px-2 outline-none"
            >
              {validSites.map(site => (
                <option key={site.key} value={site.key}>{site.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Category Tabs */}
      <div className="bg-white border-b border-bili-border z-30 shadow-sm">
        <div className="flex overflow-x-auto px-4 sm:px-6 py-2 gap-6 custom-scrollbar text-sm">
           <button
             onClick={() => {
               if (currentCategory === '' && !keyword) return
               setLoading(true)
               setError(null)
               setVideos([])
               setCurrentCategory('')
               setKeyword('')
               setSearchInput('')
             }}
             className={`whitespace-nowrap py-2 transition-colors relative font-medium ${
               currentCategory === '' && !keyword
                 ? 'text-bili-blue' 
                 : 'text-bili-text hover:text-bili-blue'
             }`}
           >
             首页
             {currentCategory === '' && !keyword && (
               <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-bili-blue rounded-full"></span>
             )}
           </button>
           {categories.map(cat => (
             <button
               key={cat.type_id}
               onClick={() => {
                 if (String(currentCategory) === String(cat.type_id) && !keyword) return
                 setLoading(true)
                 setError(null)
                 setVideos([])
                 setCurrentCategory(cat.type_id)
                 setKeyword('')
                 setSearchInput('')
               }}
               className={`whitespace-nowrap py-2 transition-colors relative font-medium ${
                 currentCategory === cat.type_id && !keyword
                   ? 'text-bili-blue' 
                   : 'text-bili-text hover:text-bili-blue'
               }`}
             >
               {cat.type_name}
               {currentCategory === cat.type_id && !keyword && (
                 <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-bili-blue rounded-full"></span>
               )}
             </button>
           ))}
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-white p-4 sm:p-6 custom-scrollbar">
        {loading ? (
          <div className="flex flex-col justify-center items-center h-full min-h-[40vh] gap-3">
            <div className="w-10 h-10 border-4 border-bili-grayBg border-t-bili-blue rounded-full animate-spin"></div>
            <span className="text-bili-textLight text-sm">正在加载中...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
            <SmartImage alt="error" className="w-48 mb-4 opacity-80" fallbackText="加载失败" />
            <p className="text-bili-text font-medium mb-1">{error}</p>
            <p className="text-bili-textLight text-sm mb-6">该站点可能无法访问或接口格式不支持</p>
            <button 
              onClick={() => autoNextSite(currentSiteKey)} 
              className="px-6 py-2 bg-bili-blue text-white rounded-lg hover:bg-bili-blueHover transition-colors text-sm font-medium"
            >
              尝试下一个站点
            </button>
          </div>
        ) : videos.length === 0 ? (
          <div className="flex flex-col justify-center items-center min-h-[40vh]">
            <SmartImage alt="nodata" className="w-48 mb-4 opacity-80" fallbackText="暂无数据" />
            <p className="text-bili-textLight text-sm">什么都没有找到呢~</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-6">
            {videos.map(video => (
              <div 
                key={video.vod_id} 
                onClick={() => navigate(`/detail/${currentSiteKey}/${video.vod_id}`)}
                className="group cursor-pointer flex flex-col"
              >
                <div className="relative aspect-[3/4] w-full rounded-xl overflow-hidden bg-bili-grayBg mb-2">
                  <SmartImage
                    src={video.vod_pic}
                    alt={video.vod_name}
                    fallbackText={video.vod_name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  {video.vod_remarks && (
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-6 pb-1.5 px-2">
                      <span className="text-white text-xs font-medium line-clamp-1">{video.vod_remarks}</span>
                    </div>
                  )}
                  {/* Play icon overlay on hover */}
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <svg className="w-10 h-10 text-white opacity-90" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  </div>
                </div>
                <h3 className="text-sm font-medium text-bili-text group-hover:text-bili-blue transition-colors line-clamp-2 leading-snug" title={video.vod_name}>
                  {video.vod_name}
                </h3>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

export default Home
