import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron'

import renderer from '../../src/index'

export default defineConfig({
  plugins: [
    vue(),
    electron({
      entry: 'electron/main.ts',
    }),
    renderer({
      // prebuildEsm: true,
      resolve: {
        sqlite3: { type: 'cjs' }, // C/C++ native addon
        got: { type: 'esm' }, // pure-ESM package
        serialport: { type: 'cjs' }, // C/C++ native addon
        execa: { type: 'esm' }, // pure-ESM package
        'node-fetch': { type: 'esm', bundle: false }, // pure-ESM package
      },
    }),
  ],
  build: {
    minify: false,
  },
})
