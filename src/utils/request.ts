export const fetchData = async <T = any>(url: string, options?: RequestInit): Promise<{ success: boolean; data?: T; error?: string }> => {
  // If running in Electron, use ipcRenderer
  if (typeof window !== 'undefined' && window.ipcRenderer) {
    return window.ipcRenderer.invoke('fetch-data', url) as Promise<{ success: boolean; data?: T; error?: string }>;
  }

  try {
    let text = '';
    
    // 如果是 mock API 或者是本地环境直接返回 Mock 数据
    if (url.includes('mock.api') || (typeof window !== 'undefined' && window.location.hostname === 'localhost')) {
      console.log("Using mock data for local testing");
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
      // 否则使用单一的代理
      const corsProxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
      const response = await fetch(corsProxyUrl, options);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const jsonResponse = await response.json();
      
      if (jsonResponse.status && jsonResponse.status.http_code !== 200) {
          throw new Error(`HTTP error! status: ${jsonResponse.status.http_code}`);
      }
      text = jsonResponse.contents;
    }
    
    try {
      const data = JSON.parse(text);
      return { success: true, data };
    } catch {
      // Fallback for TVBox configs that might have prefix/suffix (like **...**)
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const data = JSON.parse(match[0]);
        return { success: true, data };
      }
      throw new Error('Invalid JSON format');
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
};
