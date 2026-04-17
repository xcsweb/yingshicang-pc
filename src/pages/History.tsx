import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SmartImage from '../components/SmartImage'
import { clearWatchHistory, loadWatchHistory, removeWatchHistory, type WatchHistoryItemV1 } from '../utils/watchHistory'

const pad2 = (v: number): string => String(Math.max(0, Math.floor(v))).padStart(2, '0')

const formatSec = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  if (h > 0) return `${pad2(h)}:${pad2(m)}:${pad2(ss)}`
  return `${pad2(m)}:${pad2(ss)}`
}

const formatTime = (ms: number): string => {
  if (!ms) return ''
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = pad2(d.getMonth() + 1)
  const dd = pad2(d.getDate())
  const hh = pad2(d.getHours())
  const mm = pad2(d.getMinutes())
  return `${y}-${m}-${dd} ${hh}:${mm}`
}

const History: React.FC = () => {
  const navigate = useNavigate()
  const [items, setItems] = useState<WatchHistoryItemV1[]>([])

  useEffect(() => {
    setItems(loadWatchHistory())
  }, [])

  const groups = useMemo(() => {
    const byVod = new Map<string, WatchHistoryItemV1[]>()
    for (const item of items) {
      const key = `${item.siteKey}|${item.vodId}`
      const list = byVod.get(key) || []
      list.push(item)
      byVod.set(key, list)
    }
    return [...byVod.values()].map(list => list.sort((a, b) => b.updatedAt - a.updatedAt)[0]).sort((a, b) => b.updatedAt - a.updatedAt)
  }, [items])

  const handleClear = () => {
    if (window.confirm('确认清空全部播放历史吗？')) {
      clearWatchHistory()
      setItems([])
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-white text-bili-text">
      <header className="sticky top-0 z-50 bg-white border-b border-bili-border h-16 flex items-center justify-between px-4 sm:px-6 shadow-sm">
        <div className="flex items-center min-w-0">
          <button
            onClick={() => navigate(-1)}
            className="mr-3 p-2 text-bili-textLight hover:text-bili-text hover:bg-bili-grayBg rounded-full transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
          </button>
          <h1 className="text-lg font-medium text-bili-text truncate">
            播放历史
          </h1>
        </div>

        <button
          onClick={handleClear}
          className="px-3 py-1.5 text-sm rounded-lg border border-bili-border text-bili-textLight hover:text-bili-pink hover:border-bili-pink transition-colors"
        >
          清空
        </button>
      </header>

      <main className="flex-1 p-4 sm:p-6 lg:p-8 custom-scrollbar">
        <div className="max-w-4xl mx-auto">
          {groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
              <SmartImage alt="empty" className="w-48 mb-4 opacity-80" fallbackText="暂无历史" />
              <p className="text-bili-textLight text-sm">还没有播放记录</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {groups.map((item) => (
                <div
                  key={item.id}
                  className="bg-white border border-bili-border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                >
                  <button
                    className="w-full text-left"
                    onClick={() => navigate(`/detail/${item.siteKey}/${item.vodId}`)}
                  >
                    <div className="flex gap-3 p-3">
                      <div className="w-20 flex-shrink-0">
                        <div className="relative aspect-[3/4] rounded-lg overflow-hidden bg-bili-grayBg">
                          <SmartImage src={item.vodPic} alt={item.vodName} fallbackText={item.vodName} className="w-full h-full object-cover" />
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-bili-text line-clamp-2">{item.vodName}</div>
                        <div className="mt-1 text-xs text-bili-textLight line-clamp-1">上次看到：{item.episodeName || '正片'}</div>
                        {item.currentTime && item.currentTime > 0 ? (
                          <div className="mt-1 text-xs text-bili-blue">
                            进度：{formatSec(item.currentTime)} {item.duration ? `(${Math.min(100, Math.floor((item.currentTime / item.duration) * 100))}%)` : ''}
                          </div>
                        ) : null}
                        <div className="mt-1 text-xs text-bili-textMuted">{formatTime(item.updatedAt)}</div>
                      </div>
                    </div>
                  </button>

                  <div className="px-3 pb-3 flex items-center justify-between gap-3">
                    <button
                      onClick={() => navigate(`/play/${item.siteKey}/${item.vodId}/${item.sourceIndex}/${item.episodeIndex}`)}
                      className="flex-1 px-3 py-2 text-sm rounded-lg bg-bili-blue text-white hover:bg-bili-blueHover transition-colors"
                    >
                      继续播放
                    </button>
                    <button
                      onClick={() => setItems(removeWatchHistory(item.id))}
                      className="px-3 py-2 text-sm rounded-lg border border-bili-border text-bili-textLight hover:text-bili-pink hover:border-bili-pink transition-colors"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default History

