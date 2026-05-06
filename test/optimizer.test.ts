import fs from 'node:fs'
import { builtinModules } from 'node:module'
import path from 'node:path'

import { build as viteBuild, resolveConfig } from 'vite'
import { describe, expect, it } from 'vitest'

import type { RendererOptions } from '../src/index'
import { default as renderer } from '../src/index'
import { electronSnippet } from '../src/snippets'

const fixtures = path.join(__dirname, 'fixtures')
const CACHE_DIR = path.join(fixtures, 'node_modules/.vite-electron-renderer')
const renderer_resolve: RendererOptions['resolve'] = {
  execa: { type: 'esm' },
  serialport: { type: 'cjs' },
  'node-fetch': { type: 'esm' },
}

const builtins = [
  'electron',
  ...builtinModules.filter((m) => !m.startsWith('_')),
  ...builtinModules
    .filter((m) => !m.startsWith('_') && !m.startsWith('node:'))
    .map((mod) => `node:${mod}`),
]

function getConfig(command: 'build' | 'serve', options?: RendererOptions) {
  return resolveConfig(
    {
      configFile: false,
      plugins: [renderer(options)],
    },
    command,
  )
}

describe('optimizer', async () => {
  it('optimizeDeps.exclude', async () => {
    const buildExclude = (await getConfig('build')).optimizeDeps.exclude
    for (const builtin of builtins) {
      expect(buildExclude).toContain(builtin)
    }

    const resolveServeExclude = (await getConfig('serve', { resolve: renderer_resolve }))
      .optimizeDeps.exclude
    expect(resolveServeExclude).toContain('execa')
    expect(resolveServeExclude).toContain('serialport')
    expect(resolveServeExclude).toContain('node-fetch')

    const resolveBuildExclude = (await getConfig('build', { resolve: renderer_resolve }))
      .optimizeDeps.exclude
    expect(resolveBuildExclude).toContain('execa')
    expect(resolveBuildExclude).toContain('serialport')
    expect(resolveBuildExclude).toContain('node-fetch')
  })

  it('writes cache modules lazily in resolveId', async () => {
    fs.rmSync(CACHE_DIR, { recursive: true, force: true })

    const pluginRenderer = renderer({ resolve: renderer_resolve })
    await resolveConfig(
      {
        configFile: false,
        root: fixtures,
        plugins: [pluginRenderer],
      },
      'build',
    )

    expect(fs.existsSync(path.join(CACHE_DIR, 'electron.mjs'))).toBe(false)
    expect(fs.existsSync(path.join(CACHE_DIR, 'execa.mjs'))).toBe(false)
    expect(fs.existsSync(path.join(CACHE_DIR, 'serialport.mjs'))).toBe(false)
    expect(fs.existsSync(path.join(CACHE_DIR, 'node-fetch.mjs'))).toBe(false)

    if (typeof pluginRenderer.resolveId !== 'function') {
      throw new TypeError('renderer plugin is missing a resolveId hook')
    }

    await pluginRenderer.resolveId.call(pluginRenderer as any, 'electron', undefined, {} as any)
    await pluginRenderer.resolveId.call(pluginRenderer as any, 'execa', undefined, {} as any)
    await pluginRenderer.resolveId.call(pluginRenderer as any, 'serialport', undefined, {} as any)
    await pluginRenderer.resolveId.call(pluginRenderer as any, 'node-fetch', undefined, {} as any)

    expect(fs.existsSync(path.join(CACHE_DIR, 'electron.mjs'))).toBe(true)
    expect(fs.existsSync(path.join(CACHE_DIR, 'execa.mjs'))).toBe(true)
    expect(fs.existsSync(path.join(CACHE_DIR, 'serialport.mjs'))).toBe(true)
    expect(fs.existsSync(path.join(CACHE_DIR, 'node-fetch.mjs'))).toBe(true)
  })

  it('pre-bundling', async () => {
    fs.rmSync(CACHE_DIR, { recursive: true, force: true })

    const pluginRenderer = renderer({ resolve: renderer_resolve })
    const pluginRendererConfig = pluginRenderer.config
    if (!pluginRendererConfig) {
      throw new TypeError('renderer plugin is missing a config hook')
    }
    const pluginRendererConfigHandler =
      typeof pluginRendererConfig === 'function'
        ? pluginRendererConfig
        : pluginRendererConfig.handler

    pluginRenderer.config = {
      ...(typeof pluginRendererConfig === 'object' ? pluginRendererConfig : {}),
      handler(config, env) {
        env.command = 'serve'
        return pluginRendererConfigHandler.call(pluginRenderer as any, config, env)
      },
    }

    await viteBuild({
      configFile: false,
      root: fixtures,
      build: {
        lib: {
          entry: 'builtins.ts',
          formats: ['es'],
        },
      },
      plugins: [pluginRenderer],
    })

    expect(fs.readFileSync(path.join(CACHE_DIR, 'electron.mjs'), 'utf8')).toBe(electronSnippet)
    expect(fs.existsSync(path.join(CACHE_DIR, 'node:fs.mjs'))).toBe(true) // TODO: run
    expect(fs.existsSync(path.join(CACHE_DIR, 'node:path.mjs'))).toBe(true) // TODO: run

    await viteBuild({
      configFile: false,
      root: fixtures,
      build: {
        lib: {
          entry: 'third-party.ts',
          formats: ['es'],
        },
      },
      plugins: [pluginRenderer],
    })

    expect(fs.existsSync(path.join(CACHE_DIR, 'execa.mjs'))).toBe(true)
    expect(fs.existsSync(path.join(CACHE_DIR, 'serialport.mjs'))).toBe(true) // TODO: run
    expect(fs.existsSync(path.join(CACHE_DIR, 'node-fetch.mjs'))).toBe(true) // TODO: run
    const execaBundle = fs.readFileSync(path.join(CACHE_DIR, 'execa.mjs'), 'utf8')
    expect(execaBundle).toContain('from "node:child_process"')
    expect(execaBundle).not.toContain('from "execa"')
    const nodeFetchWrapper = path.join(CACHE_DIR, 'node-fetch.mjs')
    const nodeFetchBundle = fs.readFileSync(nodeFetchWrapper, 'utf8')
    expect(nodeFetchBundle).toContain('from "node:http"')
    expect(nodeFetchBundle).not.toContain('from "node-fetch"')

    fs.rmSync(path.join(fixtures, 'dist'), { recursive: true, force: true })
  })
})
