import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

export default defineConfig({
  build: {
    minify: false,
  },
  plugins: [
    electron({
      entry: ['electron/main.ts', 'electron/worker.ts'],
    }),
    renderer(),
  ],
})
