import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron'

import renderer from '../../src/index'

export default defineConfig({
  plugins: [
    electron({
      entry: 'electron/main.ts',
    }),
    renderer({
      resolve: {
        'electron-store': { type: 'esm' },
      },
    }),
  ],
  build: {
    minify: false,
  },
})
