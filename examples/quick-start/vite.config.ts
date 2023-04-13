import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

export default defineConfig({
  plugins: [
    electron({
      entry: 'electron/main.ts',
    }),
    renderer({
      resolve: {
        serialport: { type: 'cjs' },
        got: { type: 'esm' },
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
