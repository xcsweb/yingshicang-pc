export type WatchHistoryItemV1 = {
  version: 1
  id: string
  siteKey: string
  vodId: string
  vodName: string
  vodPic: string
  sourceIndex: number
  episodeIndex: number
  episodeName: string
  currentTime?: number
  duration?: number
  updatedAt: number
}

const STORAGE_KEY = 'yingshicang-pc:watchHistory:v1'
const MAX_ITEMS = 200

const safeJsonParse = (raw: string): any => {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export const loadWatchHistory = (): WatchHistoryItemV1[] => {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(STORAGE_KEY) || ''
  const data = safeJsonParse(raw)
  if (!Array.isArray(data)) return []
  return data
    .filter((it: any) => it && it.version === 1 && typeof it.id === 'string')
    .slice(0, MAX_ITEMS)
}

const saveWatchHistory = (items: WatchHistoryItemV1[]) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)))
}

export const upsertWatchHistory = (item: Omit<WatchHistoryItemV1, 'version' | 'updatedAt'>) => {
  const now = Date.now()
  const normalized: WatchHistoryItemV1 = { ...item, version: 1, updatedAt: now }
  const items = loadWatchHistory()
  const next = [normalized, ...items.filter(i => i.id !== normalized.id)]
  saveWatchHistory(next)
  return next
}

export const removeWatchHistory = (id: string) => {
  if (!id) return loadWatchHistory()
  const items = loadWatchHistory()
  const next = items.filter(i => i.id !== id)
  saveWatchHistory(next)
  return next
}

export const clearWatchHistory = () => {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
}

