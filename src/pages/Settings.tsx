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
      // 1. Send IPC message to fetch data source to bypass CORS
      const result = await fetchData<{ sites?: Site[], urls?: Site[] }>(targetUrl)
      console.log("Settings: fetch result", result)
      
      if (result.success && result.data && Array.isArray(result.data.sites)) {
        setUrl(targetUrl)
        setSites(result.data.sites)
        // Store it so home can detect
      } else if (result.success && result.data && result.data.sites) {
        // sometimes sites is an object or just defined differently in mock
        setUrl(targetUrl)
        setSites(Array.isArray(result.data.sites) ? result.data.sites : [result.data.sites])
      } else if (result.success && result.data && Array.isArray(result.data.urls)) {
        setUrl(targetUrl)
        setSites(result.data.urls)
      } else {
        throw new Error(result.error || 'Failed to fetch data source')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center p-8 w-full max-w-3xl mx-auto text-left">
      <div className="flex w-full justify-between items-center mb-8">
        <h1 className="text-3xl font-bold m-0 text-[var(--text-h)]">设置 (Settings)</h1>
        <button 
          onClick={() => navigate('/')}
          className="px-4 py-2 rounded bg-[var(--social-bg)] text-[var(--text-h)] hover:shadow-md transition-shadow"
        >
          返回首页
        </button>
      </div>

      <div className="w-full bg-[var(--code-bg)] p-6 rounded-lg border border-[var(--border)]">
        <h2 className="text-xl mb-4 text-[var(--text-h)]">数据源配置</h2>
        
        <div className="flex flex-col gap-2 mb-4">
          <label className="text-sm font-medium">TVBox JSON 接口地址</label>
          <div className="flex gap-2">
            <input 
              type="text" 
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="例如: http://饭太硬.top/tv"
              className="flex-1 px-4 py-2 rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
            />
            <button 
              onClick={() => handleSave(inputUrl)}
              disabled={loading || !inputUrl}
              className="px-6 py-2 rounded bg-[var(--accent)] text-white font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {loading ? '加载中...' : '保存并加载'}
            </button>
          </div>
          
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="text-sm text-[var(--text-muted)] py-1">推荐源:</span>
            {PRESET_URLS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => handlePresetClick(preset.url)}
                className="px-3 py-1.5 text-sm rounded bg-[var(--social-bg)] text-[var(--text)] hover:bg-[var(--accent-bg)] hover:text-[var(--accent)] transition-colors"
              >
                {preset.name}
              </button>
            ))}
          </div>

          {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
        </div>

        {sites.length > 0 && (
          <div className="mt-6">
            <h3 className="text-lg mb-2 text-[var(--text-h)]">已加载的站点 ({sites.length})</h3>
            <div className="max-h-64 overflow-y-auto border border-[var(--border)] rounded bg-[var(--bg)]">
              <ul className="divide-y divide-[var(--border)]">
                {sites.map(site => (
                  <li key={site.key} className="p-3 hover:bg-[var(--social-bg)] flex justify-between items-center">
                    <span className="font-medium text-[var(--text-h)]">{site.name}</span>
                    <span className="text-xs px-2 py-1 rounded bg-[var(--accent-bg)] text-[var(--accent)]">
                      {site.type === 3 ? '网盘/解析' : site.type === 1 ? 'XML' : site.type === 0 ? 'CMS' : site.type}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Settings
