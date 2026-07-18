import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: (id) => {
                if (id === 'node-pty' || id.startsWith('node-pty/')) return true
                if (id.includes('conpty') || id.includes('pty.node') || id.includes('winpty')) return true
                if (id === 'better-sqlite3' || id === 'node:sqlite' || id === 'undici') return true
                if (id === 'pdf-parse' || id.startsWith('pdf-parse/')) return true
                if (id === 'canvas' || id.startsWith('canvas/')) return true
                if (id === 'tesseract.js' || id.startsWith('tesseract.js/')) return true
                return false
              }
            }
          }
        }
      },
      {
        entry: 'electron/preload.ts',
        onstart(args) {
          args.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron'
          }
        }
      }
    ]),
    renderer()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})
