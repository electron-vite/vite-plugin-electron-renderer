import fs from 'node:fs'
import path from 'node:path'
import { builtinModules } from 'node:module'
import { type Alias, resolveConfig } from 'vite'
import {
  afterAll,
  describe,
  expect,
  it,
} from 'vitest'
import { node_modules } from 'vite-plugin-utils/function'
import { builtins } from '../src/build-config'
import {
  type DepOptimizationOptions,
  default as optimizer,
} from '../src/optimizer'

let cachePath: string

describe('src/build-config', async () => {
  it('optimizer.[alias, optimizeDeps]', async () => {
    const getConfig = (options: DepOptimizationOptions = {}) => resolveConfig({ configFile: false, plugins: [optimizer(options)] }, 'build')
    const resolved = await getConfig()

    // ---- alias ----
    const aliases: Alias[] = [
      {
        find: 'electron',
        replacement: 'vite-plugin-electron-renderer/electron-renderer',
      },
      ...builtins
        .filter(m => m !== 'electron')
        .filter(m => !m.startsWith('node:'))
        .map<Alias>(m => ({
          find: new RegExp(`^(node:)?${m}$`),
          replacement: `vite-plugin-electron-renderer/builtins/${m}`,
        })),
    ]
    for (const alias of aliases) {
      const _alias = resolved.resolve.alias.find(a => (a.find.toString() === alias.find.toString() && a.replacement === alias.replacement))
      expect(Object.prototype.toString.call(_alias)).eq('[object Object]')
    }

    // ---- optimizeDeps ----
    const modules = builtinModules.filter(m => !m.startsWith('_'))
    const exclude = [
      'electron',
      ...modules,
      ...modules.map(mod => `node:${mod}`),
      'vite-plugin-electron-renderer/electron-renderer',
      ...modules.map(m => `vite-plugin-electron-renderer/builtins/${m}`),
    ]
    expect(resolved.optimizeDeps.exclude).toEqual(exclude)
  })

  it('optimizer.PreBundle', async () => {
    const resolved = await resolveConfig({
      configFile: false,
      plugins: [optimizer({
        include: [{ name: 'vite-plugin-utils/constant', type: 'module' }],
      })],
    }, 'serve')
    cachePath = path.join(node_modules(resolved.root)[0], '.vite-electron-renderer')
    const cjsModule = require(path.join(cachePath, 'vite-plugin-utils/constant/index.cjs'))
    const esmModule = await import('vite-plugin-utils/constant')

    expect(Object.keys(cjsModule)).toEqual(Object.keys(esmModule))
  })
})

afterAll(() => {
  fs.rmSync(cachePath, { recursive: true, force: true })
})
