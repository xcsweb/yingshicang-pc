import Hls from 'hls.js'

/**
 * 为 Hls.js 实例添加并发分片预取功能
 * 监听片段加载事件，主动并发拉取后续的分片到浏览器缓存中
 *
 * @param hls Hls.js 实例
 * @param urlTransformer 将原始片段 url 转换为实际请求的代理 url（与 xhrSetup 保持一致）
 * @param maxConcurrent 最大并发预取数
 */
export const enableHlsPrefetch = (
  hls: Hls,
  urlTransformer: (url: string) => string = (u) => u,
  maxConcurrent = 3
) => {
  // 记录已经发起过预取的 URL，防止重复请求
  const prefetchedUrls = new Set<string>()

  const onFragChanged = (_event: string, data: any) => {
    const currentFrag = data?.frag
    if (!currentFrag) return

    const level = hls.levels?.[currentFrag.level]
    if (!level || !level.details) return

    const fragments = level.details.fragments
    if (!Array.isArray(fragments)) return

    const currentIndex = fragments.findIndex((f: any) => f.sn === currentFrag.sn)
    if (currentIndex === -1) return

    // 提取当前片段后的 N 个片段进行预取
    const nextFrags = fragments.slice(currentIndex + 1, currentIndex + 1 + maxConcurrent)

    nextFrags.forEach((frag: any) => {
      const rawUrl = frag.url
      if (!rawUrl) return

      const fetchUrl = urlTransformer(rawUrl)
      if (prefetchedUrls.has(fetchUrl)) return

      prefetchedUrls.add(fetchUrl)

      // 控制 Set 大小，防止长时间播放内存泄漏
      if (prefetchedUrls.size > 2000) {
        const first = prefetchedUrls.values().next().value
        if (first) prefetchedUrls.delete(first)
      }

      // 使用 fetch 并发拉取，不阻塞主线程，利用浏览器自身缓存（Memory Cache / Disk Cache）
      fetch(fetchUrl, { mode: 'cors', credentials: 'omit' }).catch(() => {
        // 若失败，可以将其从 Set 移除，以便后续重试
        prefetchedUrls.delete(fetchUrl)
      })
    })
  }

  // 监听分片切换事件（当播放器决定加载某个片段时触发）
  hls.on(Hls.Events.FRAG_CHANGED, onFragChanged)

  // 实例销毁时清理
  hls.on(Hls.Events.DESTROYING, () => {
    prefetchedUrls.clear()
  })
}
