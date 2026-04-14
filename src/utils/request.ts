export const fetchData = async <T = any>(url: string, options?: RequestInit): Promise<{ success: boolean; data?: T; error?: string }> => {
  // If running in Electron, use ipcRenderer
  if (typeof window !== 'undefined' && window.ipcRenderer) {
    return window.ipcRenderer.invoke('fetch-data', url) as Promise<{ success: boolean; data?: T; error?: string }>;
  }

  try {
    let text = '';
    const normalizedUrl = (() => {
      if (!url) return url
      const trimmed = url.trim()
      if (!/^https?:\/\//i.test(trimmed)) return trimmed
      try {
        return new URL(trimmed).toString()
      } catch {
        return trimmed
      }
    })()
    
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
    } else {
      const useLocalProxy = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV)
      if (useLocalProxy) {
        const proxyUrl = `/proxy?ua=tvbox&url=${encodeURIComponent(normalizedUrl)}`
        const response = await fetch(proxyUrl, options)
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
        const decode = (buffer: ArrayBuffer, encoding: string): string => {
          try {
            return new TextDecoder(encoding).decode(buffer)
          } catch {
            return new TextDecoder('utf-8').decode(buffer)
          }
        }
        const countReplacement = (s: string): number => {
          let n = 0
          for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 0xfffd) n += 1
          return n
        }
        const countPrivateUse = (s: string): number => {
          let n = 0
          for (let i = 0; i < s.length; i++) {
            const code = s.charCodeAt(i)
            if (code >= 0xe000 && code <= 0xf8ff) n += 1
          }
          return n
        }
        const buffer = await response.arrayBuffer()
        const utf8 = decode(buffer, 'utf-8')
        const replacementCount = countReplacement(utf8)
        const privateUseCount = countPrivateUse(utf8)
        text = replacementCount >= 10 || privateUseCount >= 10 ? decode(buffer, 'gb18030') : utf8
      } else {
        const corsProxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(normalizedUrl)}`
        const response = await fetch(corsProxyUrl, options)
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
        const jsonResponse = await response.json()

        if (jsonResponse.status && jsonResponse.status.http_code !== 200) {
          throw new Error(`HTTP error! status: ${jsonResponse.status.http_code}`)
        }
        text = jsonResponse.contents
      }
    }
    
    try {
      const trimmed = text.trimStart()
      if (/^<!doctype\s+html/i.test(trimmed) || /^<html/i.test(trimmed)) {
        throw new Error('Invalid JSON format')
      }
      const data = JSON.parse(text);
      return { success: true, data };
    } catch {
      // Fallback for TVBox configs that might have prefix/suffix (like **...**)
      const trimmed = text.trimStart()
      if (/^<!doctype\s+html/i.test(trimmed) || /^<html/i.test(trimmed)) {
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
      const data = JSON.parse(jsonText)
      return { success: true, data }
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
};
