import fs from 'node:fs'
import { builtinModules } from 'node:module'
import path from 'node:path'

import { build as viteBuild, parseAst, resolveConfig } from 'vite'
import { describe, expect, it } from 'vitest'

import type { RendererOptions } from '../src/index'
import { default as renderer } from '../src/index'

const fixtures = path.join(__dirname, 'fixtures')
const CACHE_DIR = path.join(fixtures, 'node_modules/.vite-electron-renderer')
const BUNDLED_CACHE_DIR = path.join(CACHE_DIR, 'bundled')
const renderer_resolve: RendererOptions['resolve'] = {
  serialport: { type: 'cjs' },
  'node-fetch': { type: 'esm' },
}
const renderer_multi_bundle_resolve: RendererOptions['resolve'] = {
  'node-fetch': { type: 'esm' },
  'fixture-esm': { type: 'esm' },
}
const renderer_bundle_flags: RendererOptions['resolve'] = {
  bundledCjs: { type: 'cjs', bundle: true },
  runtimeEsm: { type: 'esm', bundle: false },
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

function getResolveIdHandler(plugin: ReturnType<typeof renderer>) {
  const resolveId = plugin.resolveId
  if (!resolveId) {
    throw new TypeError('renderer plugin is missing a resolveId hook')
  }

  return typeof resolveId === 'function' ? resolveId : resolveId.handler
}

function getTransformHandler(plugin: ReturnType<typeof renderer>) {
  const transform = plugin.transform
  if (!transform) {
    throw new TypeError('renderer plugin is missing a transform hook')
  }

  return typeof transform === 'function' ? transform : transform.handler
}

function createTransformContext() {
  return {
    parse(code: string) {
      return parseAst(code)
    },
  }
}

describe('optimizer', async () => {
  it('optimizeDeps.exclude', async () => {
    const buildExclude = (await getConfig('build')).optimizeDeps.exclude
    for (const builtin of builtins) {
      expect(buildExclude).toContain(builtin)
    }

    const resolveServeExclude = (await getConfig('serve', { resolve: renderer_resolve }))
      .optimizeDeps.exclude
    expect(resolveServeExclude).toContain('serialport')
    expect(resolveServeExclude).toContain('node-fetch')

    const resolveBuildExclude = (await getConfig('build', { resolve: renderer_resolve }))
      .optimizeDeps.exclude
    expect(resolveBuildExclude).toContain('serialport')
    expect(resolveBuildExclude).toContain('node-fetch')

    const explicitBundleExclude = (await getConfig('build', { resolve: renderer_bundle_flags }))
      .optimizeDeps.exclude
    expect(explicitBundleExclude).toContain('bundledCjs')
    expect(explicitBundleExclude).toContain('runtimeEsm')
  })

  it('writes cache modules lazily on resolve', async () => {
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
    expect(fs.existsSync(path.join(CACHE_DIR, 'serialport.mjs'))).toBe(false)
    expect(fs.existsSync(path.join(BUNDLED_CACHE_DIR, 'node-fetch.mjs'))).toBe(false)

    const resolveId = getResolveIdHandler(pluginRenderer)

    await resolveId.call(pluginRenderer as any, 'node:fs', undefined, {} as any)
    await resolveId.call(pluginRenderer as any, 'fs', undefined, {} as any)
    await resolveId.call(pluginRenderer as any, 'electron', undefined, {} as any)
    await resolveId.call(pluginRenderer as any, 'serialport', undefined, {} as any)
    const nodeFetchBuildResolution = await resolveId.call(
      pluginRenderer as any,
      'node-fetch',
      undefined,
      {} as any,
    )

    expect(fs.existsSync(path.join(CACHE_DIR, 'fs.mjs'))).toBe(true)
    expect(fs.existsSync(path.join(CACHE_DIR, 'node+fs.mjs'))).toBe(false)
    expect(fs.existsSync(path.join(CACHE_DIR, 'electron.mjs'))).toBe(true)
    expect(fs.existsSync(path.join(CACHE_DIR, 'serialport.mjs'))).toBe(true)
    expect(nodeFetchBuildResolution).toBe(path.join(BUNDLED_CACHE_DIR, 'node-fetch.mjs'))
    expect(fs.existsSync(path.join(BUNDLED_CACHE_DIR, 'node-fetch.mjs'))).toBe(true)

    const pluginRendererServe = renderer({ resolve: renderer_resolve })
    await resolveConfig(
      {
        configFile: false,
        root: fixtures,
        plugins: [pluginRendererServe],
      },
      'serve',
    )

    const serveResolveId = getResolveIdHandler(pluginRendererServe)
    const nodeFetchServeResolution = await serveResolveId.call(
      pluginRendererServe as any,
      'node-fetch',
      undefined,
      {} as any,
    )

    expect(nodeFetchServeResolution).toBe(path.join(CACHE_DIR, 'node-fetch.mjs'))
    expect(fs.existsSync(path.join(CACHE_DIR, 'node-fetch.mjs'))).toBe(true)
  })

  it('builds bundled deps only when requested', async () => {
    fs.rmSync(CACHE_DIR, { recursive: true, force: true })

    const pluginRenderer = renderer({ resolve: renderer_multi_bundle_resolve })
    await resolveConfig(
      {
        configFile: false,
        root: fixtures,
        plugins: [pluginRenderer],
      },
      'build',
    )

    const resolveId = getResolveIdHandler(pluginRenderer)

    expect(fs.existsSync(path.join(BUNDLED_CACHE_DIR, 'node-fetch.mjs'))).toBe(false)
    expect(fs.existsSync(path.join(BUNDLED_CACHE_DIR, 'fixture-esm.mjs'))).toBe(false)

    await resolveId.call(pluginRenderer as any, 'node-fetch', undefined, {} as any)

    expect(fs.existsSync(path.join(BUNDLED_CACHE_DIR, 'node-fetch.mjs'))).toBe(true)
    expect(fs.existsSync(path.join(BUNDLED_CACHE_DIR, 'fixture-esm.mjs'))).toBe(false)

    await resolveId.call(pluginRenderer as any, 'fixture-esm', undefined, {} as any)

    expect(fs.existsSync(path.join(BUNDLED_CACHE_DIR, 'fixture-esm.mjs'))).toBe(true)
  })

  it('pre-bundling', async () => {
    fs.rmSync(CACHE_DIR, { recursive: true, force: true })

    const pluginRenderer = renderer({ resolve: renderer_resolve })

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

    const builtinBundle = fs.readFileSync(
      path.join(fixtures, 'dist', 'vite-plugin-electron-renderer-test-fixtures.mjs'),
      'utf8',
    )

    expect(fs.existsSync(path.join(CACHE_DIR, 'electron.mjs'))).toBe(false)
    expect(fs.existsSync(path.join(CACHE_DIR, 'fs.mjs'))).toBe(false)
    expect(fs.existsSync(path.join(CACHE_DIR, 'path.mjs'))).toBe(false)
    expect(builtinBundle).toContain('e("node:fs").readFile')
    expect(builtinBundle).toContain('e("electron").ipcRenderer')
    expect(builtinBundle).toContain('Promise.resolve().then(() => e("node:path"))')
    expect(builtinBundle).not.toContain('.vite-electron-renderer')

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

    const thirdPartyBundle = fs.readFileSync(
      path.join(fixtures, 'dist', 'vite-plugin-electron-renderer-test-fixtures.mjs'),
      'utf8',
    )
    expect(fs.existsSync(path.join(CACHE_DIR, 'serialport.mjs'))).toBe(false)
    expect(fs.existsSync(path.join(BUNDLED_CACHE_DIR, 'node-fetch.mjs'))).toBe(true)
    expect(thirdPartyBundle).toContain('("serialport")')
    expect(thirdPartyBundle).not.toContain('Promise.resolve().then(() => e("node-fetch"))')
    fs.rmSync(path.join(fixtures, 'dist'), { recursive: true, force: true })
  })

  it('rewrites matched static imports to runtime require calls for app builds', async () => {
    const pluginRenderer = renderer({ resolve: renderer_resolve })

    await resolveConfig(
      {
        configFile: false,
        root: fixtures,
        plugins: [pluginRenderer],
      },
      'build',
    )

    const transform = getTransformHandler(pluginRenderer)
    const transformed = await transform.call(
      createTransformContext() as any,
      [
        "import { ipcRenderer } from 'electron'",
        "import fs from 'node:fs/promises'",
        "import { SerialPort as Port } from 'serialport'",
        "import fetch from 'node-fetch'",
        'import "./local"',
        'const electronMod = import("electron")',
        'const serialportMod = import("serialport")',
        'const nodeFetchMod = import("node-fetch")',
        'const localMod = import("./dynamic-local")',
        '',
        "const snippet = `import { ipcRenderer } from 'electron'`",
        'console.log(ipcRenderer, fs, Port, fetch, electronMod, serialportMod, nodeFetchMod, localMod, snippet)',
      ].join('\n'),
      path.join(fixtures, 'renderer-entry.ts'),
    )

    expect(transformed).toEqual({
      code: [
        'const __electron_import_0__ = require("electron");',
        'const ipcRenderer = __electron_import_0__["ipcRenderer"];',
        'const __electron_import_1__ = require("node:fs/promises");',
        'const fs = __electron_import_1__?.default ?? __electron_import_1__;',
        'const __electron_import_2__ = require("serialport");',
        'const Port = __electron_import_2__["SerialPort"];',
        "import fetch from 'node-fetch'",
        'import "./local"',
        'const electronMod = Promise.resolve().then(() => require("electron"))',
        'const serialportMod = Promise.resolve().then(() => require("serialport"))',
        'const nodeFetchMod = import("node-fetch")',
        'const localMod = import("./dynamic-local")',
        '',
        "const snippet = `import { ipcRenderer } from 'electron'`",
        'console.log(ipcRenderer, fs, Port, fetch, electronMod, serialportMod, nodeFetchMod, localMod, snippet)',
      ].join('\n'),
      map: null,
    })
  })

  it('uses explicit bundle flags when rewriting imports for app builds', async () => {
    const pluginRenderer = renderer({ resolve: renderer_bundle_flags })

    await resolveConfig(
      {
        configFile: false,
        root: fixtures,
        plugins: [pluginRenderer],
      },
      'build',
    )

    const transform = getTransformHandler(pluginRenderer)
    const transformed = await transform.call(
      createTransformContext() as any,
      [
        "import bundledCjs from 'bundledCjs'",
        "import runtimeEsm from 'runtimeEsm'",
        'const bundledCjsMod = import("bundledCjs")',
        'const runtimeEsmMod = import("runtimeEsm")',
        'console.log(bundledCjs, runtimeEsm, bundledCjsMod, runtimeEsmMod)',
      ].join('\n'),
      path.join(fixtures, 'renderer-entry.ts'),
    )

    expect(transformed).toEqual({
      code: [
        "import bundledCjs from 'bundledCjs'",
        'const __electron_import_0__ = require("runtimeEsm");',
        'const runtimeEsm = __electron_import_0__?.default ?? __electron_import_0__;',
        'const bundledCjsMod = import("bundledCjs")',
        'const runtimeEsmMod = Promise.resolve().then(() => require("runtimeEsm"))',
        'console.log(bundledCjs, runtimeEsm, bundledCjsMod, runtimeEsmMod)',
      ].join('\n'),
      map: null,
    })
  })

  it('rewrites matched imports for library builds too', async () => {
    const pluginRenderer = renderer({ resolve: renderer_resolve })

    await resolveConfig(
      {
        configFile: false,
        root: fixtures,
        build: {
          lib: {
            entry: path.join(fixtures, 'builtins.ts'),
            formats: ['es'],
          },
        },
        plugins: [pluginRenderer],
      },
      'build',
    )

    const transform = getTransformHandler(pluginRenderer)
    const transformed = await transform.call(
      createTransformContext() as any,
      "import { ipcRenderer } from 'electron'\nconsole.log(ipcRenderer)\n",
      path.join(fixtures, 'renderer-entry.ts'),
    )

    expect(transformed).toEqual({
      code: `const __electron_import_0__ = require("electron");
const ipcRenderer = __electron_import_0__["ipcRenderer"];
console.log(ipcRenderer)
`,
      map: null,
    })
  })

  it('externalizes worker shims during app builds', async () => {
    const outDir = path.join(fixtures, 'dist-worker')

    fs.rmSync(outDir, { recursive: true, force: true })

    await viteBuild({
      configFile: false,
      root: fixtures,
      build: {
        minify: false,
        outDir,
        rollupOptions: {
          input: path.join(fixtures, 'worker-index.html'),
        },
      },
      plugins: [renderer()],
    })

    const assetFiles = fs.readdirSync(path.join(outDir, 'assets'))
    const workerAsset = assetFiles.find(
      (file) => file.startsWith('worker-') && file.endsWith('.js'),
    )

    expect(workerAsset).toBeDefined()

    const workerBundle = fs.readFileSync(path.join(outDir, 'assets', workerAsset!), 'utf8')

    expect(workerBundle).toContain('require("node:fs/promises")')
    expect(workerBundle).toContain('require("node:path")["join"]')
    expect(workerBundle).not.toContain('.vite-electron-renderer')
    expect(workerBundle).not.toContain('__exportAll')

    fs.rmSync(outDir, { recursive: true, force: true })
  })
})
