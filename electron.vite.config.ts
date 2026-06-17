import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve('shared') }
    },
    build: {
      lib: { entry: resolve('electron/main/index.ts') }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve('shared') }
    },
    build: {
      lib: { entry: resolve('electron/preload/index.ts') }
    }
  },
  renderer: {
    // Pin to a dedicated port so the harness never collides with other Vite dev
    // servers (e.g. blink_dashboard on the default 5173). strictPort fails loudly
    // instead of silently wandering onto another project's port.
    server: { port: 5180, strictPort: true },
    root: 'src',
    resolve: {
      alias: {
        '@': resolve('src'),
        '@shared': resolve('shared')
      }
    },
    build: {
      rollupOptions: {
        input: resolve('src/index.html')
      }
    },
    plugins: [react()]
  }
})
