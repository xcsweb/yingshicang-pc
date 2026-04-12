import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Site {
  key: string
  name: string
  type: number
  api: string
  searchable?: number
  quickSearch?: number
  filterable?: number
  ext?: string
  url?: string
}

interface DataSourceState {
  url: string
  sites: Site[]
  setUrl: (url: string) => void
  setSites: (sites: Site[]) => void
}

export const useDataSourceStore = create<DataSourceState>()(
  persist(
    (set) => ({
      url: '',
      sites: [],
      setUrl: (url) => set({ url }),
      setSites: (sites) => set({ sites }),
    }),
    {
      name: 'data-source-storage',
    }
  )
)
