import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import pkg from './package.json'

export default defineConfig({
  plugins: [
    electron({
      entry: 'electron/main.ts',
    }),
    renderer({
      // Enables use of Node.js API in the Renderer-process
      nodeIntegration: true,
      optimizeDeps: {
        resolve(args) {
          if (args.path === 'serialport') {
            return { platform: 'node' }
          }
        },
      },
    }),
  ],
  build: {
    minify: false,
    rollupOptions: {
      external: Object.keys(pkg.dependencies),
    },
  },
  optimizeDeps: {
    // If an npm package is a pure ESM format package, 
    // and the packages it depends on are also in ESM format, 
    // then put it in `optimizeDeps.exclude` and it will work normally.
    // exclude: ['only-support-pure-esmodule-package'],
  },
})
