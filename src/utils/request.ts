type FetchResult<T> = { success: boolean; data?: T; error?: string }

const normalizeUrl = (raw: string): string => {
  if (!raw) return raw
  const trimmed = raw.trim()
  if (!/^https?:\/\//i.test(trimmed)) return trimmed
  try {
    return new URL(trimmed).toString()
  } catch {
    return trimmed
  }
}

const decodeMaybeGb18030 = (buffer: ArrayBuffer): string => {
  const decode = (encoding: string): string => {
    try {
      return new TextDecoder(encoding).decode(buffer)
    } catch {
      return new TextDecoder('utf-8').decode(buffer)
    }
  }
  const utf8 = decode('utf-8')
  let replacementCount = 0
  let privateUseCount = 0
  for (let i = 0; i < utf8.length; i++) {
    const code = utf8.charCodeAt(i)
    if (code === 0xfffd) replacementCount += 1
    if (code >= 0xe000 && code <= 0xf8ff) privateUseCount += 1
  }
  return replacementCount >= 10 || privateUseCount >= 10 ? decode('gb18030') : utf8
}

const isHtmlLike = (text: string): boolean => {
  const trimmed = (text || '').trimStart()
  return /^<!doctype\s+html/i.test(trimmed) || /^<html/i.test(trimmed)
}

const getHttpProxy = (): string => {
  const v = typeof import.meta !== 'undefined' ? String((import.meta as any).env?.VITE_HTTP_PROXY || '').trim() : ''
  return v
}

const generateFallbackUrls = (url: string): string[] => {
  const urls = [url]
  if (url.startsWith('local://')) {
    // 对内置的 local 协议，不做回退
    return urls
  }
  if (url.includes('fastly.jsdelivr.net') && (url.endsWith('.json') || url.endsWith('.txt'))) {
    const match = url.match(/fastly\.jsdelivr\.net\/gh\/([^/]+)\/([^@/]+)(?:@([^/]+))?\/(.+)$/i)
    if (match) {
      const [, user, repo, branch = 'main', file] = match
      urls.push(`https://raw.kkgithub.com/${user}/${repo}/${branch}/${file}`)
      urls.push(`https://gcore.jsdelivr.net/gh/${user}/${repo}@${branch}/${file}`)
    } else {
      urls.push(url.replace('fastly.jsdelivr.net', 'raw.kkgithub.com'))
      urls.push(url.replace('fastly.jsdelivr.net', 'gcore.jsdelivr.net'))
    }
  }
  return urls
}

// 内存缓存：记录请求 URL 对应的解析后数据和时间戳
const memCache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 缓存 5 分钟

const _fetchText = async (url: string, options?: RequestInit): Promise<FetchResult<string>> => {
  if (typeof window !== 'undefined' && (window as any).ipcRenderer) {
    return (window as any).ipcRenderer.invoke('fetch-text', url) as Promise<FetchResult<string>>
  }

  try {
    const normalizedUrl = normalizeUrl(url)
    if (normalizedUrl.includes('mock.api')) return { success: true, data: '' }

    // 处理内置 local:// 协议，直接读取 public 目录下的文件
    if (url.startsWith('local://')) {
      const fileName = url.replace('local://', '')
      const basePath = typeof import.meta !== 'undefined' && (import.meta as any).env?.BASE_URL 
        ? (import.meta as any).env.BASE_URL 
        : '/'
      const cleanBasePath = basePath.endsWith('/') ? basePath : `${basePath}/`
      const fetchUrl = `${cleanBasePath}${fileName}`
      
      const response = await fetch(fetchUrl, options)
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
      const buffer = await response.arrayBuffer()
      return { success: true, data: decodeMaybeGb18030(buffer) }
    }

    const useLocalProxy = typeof import.meta !== 'undefined' && Boolean((import.meta as any).env?.DEV)
    if (useLocalProxy) {
      const proxyUrl = `/proxy?ua=tvbox&url=${encodeURIComponent(normalizedUrl)}`
      const response = await fetch(proxyUrl, options)
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
      const buffer = await response.arrayBuffer()
      return { success: true, data: decodeMaybeGb18030(buffer) }
    }

    const httpProxy = getHttpProxy()
    if (httpProxy) {
      const sep = httpProxy.includes('?') ? '&' : '?'
      const proxyUrl = `${httpProxy}${sep}url=${encodeURIComponent(normalizedUrl)}`
      const response = await fetch(proxyUrl, options)
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
      const buffer = await response.arrayBuffer()
      return { success: true, data: decodeMaybeGb18030(buffer) }
    }
    
    let text = ''
    const publicProxies = [
      `https://cors.eu.org/`,
      `https://api.allorigins.win/raw?url=`,
      `https://api.codetabs.com/v1/proxy?quest=`
    ]
    let lastError: Error | null = null

    for (const proxyBase of publicProxies) {
      try {
        const corsProxyUrl = proxyBase === 'https://cors.eu.org/'
          ? `${proxyBase}${normalizedUrl}`
          : `${proxyBase}${encodeURIComponent(normalizedUrl)}`
        const response = await fetch(corsProxyUrl, options)
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
        text = await response.text()
        lastError = null
        break // 成功则跳出循环
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e))
      }
    }
    
    if (lastError) throw lastError

    return { success: true, data: text }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export const fetchText = async (url: string, options?: RequestInit): Promise<FetchResult<string>> => {
  const urls = generateFallbackUrls(url)
  let lastResult: FetchResult<string> = { success: false, error: 'Unknown error' }
  for (const u of urls) {
    lastResult = await _fetchText(u, options)
    if (lastResult.success) return lastResult
  }
  return lastResult
}

const _fetchData = async <T = any>(url: string, options?: RequestInit & { noCache?: boolean }): Promise<FetchResult<T>> => {
  const normalizedUrl = normalizeUrl(url)
  const isCacheable = !options?.noCache && (!options?.method || options.method.toUpperCase() === 'GET')

  // 1. 尝试读取内存缓存
  if (isCacheable) {
    const cached = memCache.get(normalizedUrl)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      console.log('Using cached data for:', normalizedUrl)
      return { success: true, data: cached.data as T }
    }
  }

  // 2. 为请求添加全局超时控制（10秒）
  const controller = new AbortController()
  if (options?.signal) {
    options.signal.addEventListener('abort', () => controller.abort())
  }
  const timeoutId = setTimeout(() => controller.abort(), 10000)
  const fetchOptions = { ...options, signal: controller.signal }

  // If running in Electron, use ipcRenderer
  if (typeof window !== 'undefined' && window.ipcRenderer) {
    clearTimeout(timeoutId)
    const res = await window.ipcRenderer.invoke('fetch-data', url) as { success: boolean; data?: T; error?: string };
    if (isCacheable && res && res.success) {
      memCache.set(normalizedUrl, { data: res.data, timestamp: Date.now() })
    }
    return res;
  }

  try {
    let text = ''
    
    // 如果是 mock API 才返回 Mock 数据（避免本地开发时无法请求真实数据源）
    if (normalizedUrl.includes('mock.api')) {
      if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
        console.log("Using mock data for local testing");
      }
      text = JSON.stringify({
          sites: [
              { key: "mock1", name: "Mock Site 1", type: 1, api: "http://mock.api", url: "http://mock.api" }
          ],
          urls: [
              { key: "mock1", name: "Mock Site 1", type: 1, api: "http://mock.api", url: "http://mock.api" }
          ],
          class: [
              { type_id: 1, type_name: "电影" }
          ],
          list: [
              { vod_id: 1, vod_name: "Test Movie", vod_pic: "https://via.placeholder.com/150", vod_remarks: "HD", vod_play_from: "m3u8$$$mp4", vod_play_url: "第1集$http://mock.mp4#第2集$http://mock.mp4" }
          ]
      });
    } else if (url.startsWith('local://')) {
      // 处理内置 local:// 协议，直接读取 public 目录下的文件
      const fileName = url.replace('local://', '')
      const basePath = typeof import.meta !== 'undefined' && (import.meta as any).env?.BASE_URL 
        ? (import.meta as any).env.BASE_URL 
        : '/'
      const cleanBasePath = basePath.endsWith('/') ? basePath : `${basePath}/`
      const fetchUrl = `${cleanBasePath}${fileName}`
      
      const response = await fetch(fetchUrl, fetchOptions)
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
      const buffer = await response.arrayBuffer()
      text = decodeMaybeGb18030(buffer)
    } else {
      const useLocalProxy = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV)
      if (useLocalProxy) {
        const proxyUrl = `/proxy?ua=tvbox&url=${encodeURIComponent(normalizedUrl)}`
        const response = await fetch(proxyUrl, fetchOptions)
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
        const buffer = await response.arrayBuffer()
        text = decodeMaybeGb18030(buffer)
      } else {
        const httpProxy = getHttpProxy()
        let proxySuccess = false
        
        if (httpProxy) {
          try {
            const sep = httpProxy.includes('?') ? '&' : '?'
            const proxyUrl = `${httpProxy}${sep}url=${encodeURIComponent(normalizedUrl)}`
            const response = await fetch(proxyUrl, fetchOptions)
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
            const buffer = await response.arrayBuffer()
            text = decodeMaybeGb18030(buffer)
            proxySuccess = true
          } catch (e: any) {
            console.warn('Custom proxy failed, falling back to public proxies', e)
          }
        }
        
        if (!proxySuccess) {
          let jsonResponse: any = null
          let lastError: Error | null = null
          const publicProxies = [
            `https://cors.eu.org/`,
            `https://api.allorigins.win/get?url=`,
            `https://api.codetabs.com/v1/proxy?quest=`
          ]

          for (const proxyBase of publicProxies) {
            try {
              const corsProxyUrl = proxyBase === 'https://cors.eu.org/' 
                ? `${proxyBase}${normalizedUrl}`
                : `${proxyBase}${encodeURIComponent(normalizedUrl)}`
              const response = await fetch(corsProxyUrl, fetchOptions)
              if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
              
              if (proxyBase.includes('allorigins')) {
                jsonResponse = await response.json()
                if (jsonResponse.status && jsonResponse.status.http_code !== 200) {
                  throw new Error(`HTTP error! status: ${jsonResponse.status.http_code}`)
                }
                text = jsonResponse.contents
              } else {
                // codetabs 直接返回 raw 内容
                text = await response.text()
              }
              lastError = null
              break // 成功则跳出循环
            } catch (e) {
              lastError = e instanceof Error ? e : new Error(String(e))
            }
          }
          if (lastError) throw lastError
        }
      }
    }
    
    let parsedData: any;
    try {
      if (isHtmlLike(text)) {
        throw new Error('Invalid JSON format')
      }
      parsedData = JSON.parse(text);
    } catch {
      // Fallback for TVBox configs that might have prefix/suffix (like **...**)
      if (isHtmlLike(text)) {
        throw new Error('Invalid JSON format')
      }
      const objStart = text.indexOf('{')
      const arrStart = text.indexOf('[')
      const startCandidates = [objStart, arrStart].filter(i => i >= 0)
      if (startCandidates.length === 0) throw new Error('Invalid JSON format')

      const start = Math.min(...startCandidates)
      const isObj = start === objStart && (arrStart === -1 || objStart < arrStart)
      const end = isObj ? text.lastIndexOf('}') : text.lastIndexOf(']')
      if (end <= start) throw new Error('Invalid JSON format')

      const jsonText = text.slice(start, end + 1)
      parsedData = JSON.parse(jsonText)
    }

    if (isCacheable) {
      memCache.set(normalizedUrl, { data: parsedData, timestamp: Date.now() })
    }
    clearTimeout(timeoutId)
    return { success: true, data: parsedData }
  } catch (error: any) {
    clearTimeout(timeoutId)
    // 处理 fetch 抛出的 AbortError（超时）
    if (error?.name === 'AbortError' || String(error).includes('aborted')) {
      return { success: false, error: 'RequestTimeout: 接口请求超时(10s)' }
    }
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
};

export const fetchData = async <T = any>(url: string, options?: RequestInit & { noCache?: boolean }): Promise<FetchResult<T>> => {
  const urls = generateFallbackUrls(url)
  let lastResult: FetchResult<T> = { success: false, error: 'Unknown error' }
  for (const u of urls) {
    lastResult = await _fetchData<T>(u, options)
    if (lastResult.success) return lastResult
  }
  return lastResult
};
