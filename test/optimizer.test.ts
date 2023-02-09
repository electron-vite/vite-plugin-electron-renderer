import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { resolveConfig } from 'vite'
import { expect, test } from 'vitest'
import { node_modules } from 'vite-plugin-utils/function'
import optimizer from '../src/optimizer'


var require = createRequire(import.meta.url)
const cacheDir = path.join(node_modules(process.cwd())[0], '.vite-electron-renderer')
fs.rmSync(cacheDir, { recursive: true, force: true })

test('src/optimizer.ts', async () => {
  await resolveConfig({
    configFile: false,
    plugins: [optimizer({
      include: [{ name: 'vite-plugin-utils/constant', type: 'module' }],
    })],
  }, 'serve')

  const cjsModule = require(path.join(cacheDir, 'vite-plugin-utils/constant/index.cjs'))
  const esmModule = await import('vite-plugin-utils/constant')

  expect(Object.keys(cjsModule)).toEqual(Object.keys(esmModule))
})
