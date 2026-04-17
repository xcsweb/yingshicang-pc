import { useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import About from './pages/About'
import Settings from './pages/Settings'
import Detail from './pages/Detail'
import Play from './pages/Play'
import Live from './pages/Live'
import History from './pages/History'
import { useDataSourceStore } from './store/dataSource'
import { fetchData } from './utils/request'

function App() {
  const { url, setUrl, setSites } = useDataSourceStore()

  useEffect(() => {
    const loadDefaultConfig = async () => {
      // 在本地环境或测试环境中，直接使用 Mock 数据
      if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
        if (!url) {
          console.log("Using mock data directly for local testing...")
          setUrl('http://mock.api')
          setSites([{ key: "mock1", name: "Mock Site 1", type: 1, api: "http://mock.api", url: "http://mock.api" }])
        }
        return
      }
      
      // 真实环境：如果未设置过 URL，则设置默认的饭太硬数据源并拉取
      if (!url) {
        const defaultUrl = 'http://www.饭太硬.com/tv/'
        setUrl(defaultUrl)
        try {
            const result = await fetchData<{ sites?: any[], urls?: any[] }>(defaultUrl)
            if (result.success && result.data) {
                if (Array.isArray(result.data.sites)) {
                    setSites(result.data.sites)
                } else if (Array.isArray(result.data.urls)) {
                    setSites(result.data.urls)
                } else if (result.data.sites) {
                    setSites([result.data.sites])
                }
            }
        } catch (e) {
            console.error("Failed to load default config", e)
        }
      }
    }
    loadDefaultConfig()
  }, [url, setUrl, setSites])

  // Use HashRouter for Electron app to ensure paths work locally via file protocol
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/detail/:siteKey/:vodId" element={<Detail />} />
        <Route path="/play/:siteKey/:vodId/:sourceIndex/:episodeIndex" element={<Play />} />
        <Route path="/live" element={<Live />} />
        <Route path="/history" element={<History />} />
        <Route path="/about" element={<About />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </HashRouter>
  )
}

export default App
