import { defineConfig } from 'vite'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import renderer from 'vite-plugin-electron-renderer'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // Use relative path for Electron, but repository name for GitHub Pages
  base: mode === 'githubpages' ? '/yingshicang-pc/' : './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'My App',
        short_name: 'App',
        description: 'My App Description',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    }),
    // Only include electron plugin when not building for GitHub Pages
    ...(mode !== 'githubpages' ? [
      electron({
        main: {
          entry: 'electron/main.ts',
        },
        preload: {
          input: path.join(__dirname, 'electron/preload.ts'),
        },
      }),
      renderer()
    ] : [])
  ],
}))
