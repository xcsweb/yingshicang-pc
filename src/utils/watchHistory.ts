export interface WatchHistoryItemV1 {
  siteKey: string;
  vodId: string;
  vodName: string;
  vodPic: string;
  sourceIndex: number;
  episodeIndex: number;
  currentTime?: number;
  duration?: number;
  updatedAt: number;
}

const HISTORY_KEY = 'yingshicang-pc:watchHistory:v1';

export const loadWatchHistory = (): WatchHistoryItemV1[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
};

export const saveWatchHistory = (history: WatchHistoryItemV1[]): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    console.error('Failed to save history', e);
  }
};

export const upsertWatchHistory = (item: WatchHistoryItemV1): void => {
  const history = loadWatchHistory();
  const index = history.findIndex(h => h.siteKey === item.siteKey && h.vodId === item.vodId);
  
  if (index !== -1) {
    history[index] = { ...history[index], ...item, updatedAt: Date.now() };
  } else {
    history.unshift({ ...item, updatedAt: Date.now() });
  }
  
  // 保留最近 100 条记录
  if (history.length > 100) {
    history.length = 100;
  }
  
  saveWatchHistory(history);
};

export const removeWatchHistory = (siteKey: string, vodId: string): void => {
  const history = loadWatchHistory();
  const next = history.filter(h => !(h.siteKey === siteKey && h.vodId === vodId));
  saveWatchHistory(next);
};

export const clearWatchHistory = (): void => {
  saveWatchHistory([]);
};
