import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { builtinModules } from 'node:module'
import { defineConfig } from 'vite'
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
    name: 'generate-types',
    async closeBundle() {
      removeTypes()
      generateTypes()
    },
  }],
})

function removeTypes() {
  fs.rmSync(path.join(__dirname, 'types'), { recursive: true, force: true })
}

function generateTypes() {
  return new Promise(resolve => {
    const cp = spawn(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['run', 'types'],
      { stdio: 'inherit' },
    )
    cp.on('exit', code => {
      !code && console.log('[types]', 'declaration generated')
      resolve(code)
    })
    cp.on('error', process.exit)
  })
}
