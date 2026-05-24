import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron'

import renderer from '../../src/index'

export default defineConfig({
  resolve: {
    alias: {
      vue: 'vue/dist/vue.runtime.esm-bundler.js',
    },
  },
  plugins: [
    vue(),
    electron({
      entry: 'electron/main.ts',
    }),
    renderer({
      resolve: {
        sqlite3: { type: 'cjs', bundle: true }, // C/C++ native addon
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
  optimizeDeps: {
    // If an npm package is a pure ESM format package,
    // and the packages it depends on are also in ESM format,
    // then put it in `optimizeDeps.exclude` and it will work normally.
    // exclude: ['only-support-pure-esmodule-package'],
  },
})
