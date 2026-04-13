import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDataSourceStore, type Site } from '../store/dataSource'
import { fetchData } from '../utils/request'

const PRESET_URLS = [
  { name: '饭太硬', url: 'http://www.饭太硬.com/tv/' },
  { name: '肥猫', url: 'http://肥猫.com' },
  { name: '菜妮丝', url: 'https://tv.菜妮丝.top' },
  { name: '巧技', url: 'http://cdn.qiaoji8.com/tvbox.json' },
  { name: '春盈天下', url: 'https://盒子迷.top/春盈天下' },
  { name: '王小二', url: 'http://tvbox.xn--4kq62z5rby2qupq9ub.top/' },
  { name: '欧歌', url: 'http://tv.nxog.top' },
]

const Settings: React.FC = () => {
  const navigate = useNavigate()
  const { url: storedUrl, sites, setUrl, setSites } = useDataSourceStore()
  
  const [inputUrl, setInputUrl] = useState(storedUrl || PRESET_URLS[0].url)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePresetClick = (url: string) => {
    setInputUrl(url)
    handleSave(url)
  }

  const handleSave = async (urlToSave?: any) => {
    const targetUrl = typeof urlToSave === 'string' ? urlToSave : inputUrl
    if (!targetUrl) return
    
    setLoading(true)
    setError(null)
    
    try {
      console.log("Settings: fetching data from", targetUrl)
      if (typeof window !== 'undefined' && window.location.hostname === 'localhost' && targetUrl === 'http://mock.api') {
          console.log("Settings: Setting local mock data")
          setUrl(targetUrl)
          setSites([{ key: "mock1", name: "Mock Site 1", type: 1, api: "http://mock.api", url: "http://mock.api" }])
          setLoading(false)
          return
      }
      
      const result = await fetchData<{ sites?: Site[], urls?: Site[] }>(targetUrl)
      console.log("Settings: fetch result", result)
      
      if (result.success && result.data && Array.isArray(result.data.sites)) {
        setUrl(targetUrl)
        setSites(result.data.sites)
      } else if (result.success && result.data && result.data.sites) {
        setUrl(targetUrl)
        setSites(Array.isArray(result.data.sites) ? result.data.sites : [result.data.sites])
      } else if (result.success && result.data && Array.isArray(result.data.urls)) {
        setUrl(targetUrl)
        setSites(result.data.urls)
      } else {
        throw new Error(result.error || '解析数据源失败')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
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
          <div className="bg-white rounded-xl shadow-sm border border-bili-border p-6">
            <div className="flex items-center gap-3 mb-6">
              <svg className="w-6 h-6 text-bili-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
              <h2 className="text-xl font-bold text-bili-text">数据源配置</h2>
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
                {error && <p className="text-bili-pink text-sm mt-2 flex items-center gap-1"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>{error}</p>}
              </div>
              
              <div>
                <span className="block text-sm font-medium text-bili-text mb-3">推荐源一键配置</span>
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
                      {preset.name}
                    </button>
                  ))}
                </div>
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
                      <span className="flex-shrink-0 text-xs px-2.5 py-1 rounded-md bg-bili-grayBg text-bili-textLight border border-bili-border">
                        {site.type === 3 ? '网盘/解析' : site.type === 1 ? 'XML' : site.type === 0 ? 'CMS' : `Type ${site.type}`}
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
