import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import { builtinModules } from 'node:module'
import libEsm from 'lib-esm'
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
})

// --------------------------------------------------------------------------

export const builtins = builtinModules.filter(m => !m.startsWith('_'))
const builtins_dir = path.join(__dirname, 'builtins')
fs.rmSync(builtins_dir, { recursive: true, force: true })

for (const module of builtins) {
  const filename = path.join(builtins_dir, module) + '.js'
  const dirname = path.dirname(filename)
  !fs.existsSync(dirname) && fs.mkdirSync(dirname, { recursive: true })

  const { exports } = libEsm({ exports: Object.keys(require(module)) })
  fs.writeFileSync(filename, `const _M_ = require("${module}");\n${exports}`)
}

console.log('[builtins] build success.\n')
