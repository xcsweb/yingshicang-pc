export {}

declare global {
  interface Window {
    ipcRenderer: {
      on: (channel: string, listener: (...args: unknown[]) => void) => unknown
      off: (channel: string, ...omit: unknown[]) => unknown
      send: (channel: string, ...omit: unknown[]) => unknown
      invoke: (channel: string, ...omit: unknown[]) => Promise<unknown>
    }
  }
}
