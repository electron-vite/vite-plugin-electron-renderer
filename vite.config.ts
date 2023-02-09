import { defineConfig } from 'vite'
import { builtinModules } from 'node:module'
import pkg from './package.json'

export default defineConfig({
  build: {
    minify: false,
    emptyOutDir: false,
    outDir: '',
    lib: {
      entry: 'src/index.ts',
      formats: ['cjs', 'es'],
      fileName: format => format === 'es' ? '[name].mjs' : '[name].js',
    },
    rollupOptions: {
      external: [
        'esbuild',
        'vite',
        ...builtinModules,
        ...builtinModules.map(m => `node:${m}`),
        ...Object.keys(pkg.dependencies),
      ],
      output: {
        exports: 'named',
      },
    },
  },
  plugins: [{
    name: 'vite-plugin-builtins',
    async config() {
      // Runs at dev, build, test
      import('./builtins.mjs').then(({ generateBuiltins }) => generateBuiltins())
    },
  }],
})
