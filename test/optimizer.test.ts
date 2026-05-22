import fs from 'node:fs'
import { builtinModules } from 'node:module'
import path from 'node:path'

import { build as viteBuild, parseAst, resolveConfig } from 'vite'
import { describe, expect, it } from 'vitest'

import type { RendererOptions } from '../src/index'
import { default as renderer } from '../src/index'

const fixtures = path.join(__dirname, 'fixtures')
const CACHE_DIR = path.join(fixtures, 'node_modules/.vite-electron-renderer')
const renderer_resolve: RendererOptions['resolve'] = {
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
    expect(fs.existsSync(path.join(CACHE_DIR, 'node-fetch.mjs'))).toBe(false)

    const resolveId = getResolveIdHandler(pluginRenderer)

    await resolveId.call(pluginRenderer as any, 'node:fs', undefined, {} as any)
    await resolveId.call(pluginRenderer as any, 'fs', undefined, {} as any)
    await resolveId.call(pluginRenderer as any, 'electron', undefined, {} as any)
    await resolveId.call(pluginRenderer as any, 'serialport', undefined, {} as any)
    await resolveId.call(pluginRenderer as any, 'node-fetch', undefined, {} as any)

    expect(fs.existsSync(path.join(CACHE_DIR, 'fs.mjs'))).toBe(true)
    expect(fs.existsSync(path.join(CACHE_DIR, 'node+fs.mjs'))).toBe(false)
    expect(fs.existsSync(path.join(CACHE_DIR, 'electron.mjs'))).toBe(true)
    expect(fs.existsSync(path.join(CACHE_DIR, 'serialport.mjs'))).toBe(true)
    expect(fs.existsSync(path.join(CACHE_DIR, 'node-fetch.mjs'))).toBe(true)
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
    expect(fs.existsSync(path.join(CACHE_DIR, 'node-fetch.mjs'))).toBe(false)
    expect(thirdPartyBundle).toContain('e("serialport")')
    expect(thirdPartyBundle).toContain('Promise.resolve().then(() => e("node-fetch"))')
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
        'import "./local"',
        'const electronMod = import("electron")',
        'const serialportMod = import("serialport")',
        'const localMod = import("./dynamic-local")',
        '',
        "const snippet = `import { ipcRenderer } from 'electron'`",
        'console.log(ipcRenderer, fs, Port, electronMod, serialportMod, localMod, snippet)',
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
        'import "./local"',
        'const electronMod = Promise.resolve().then(() => require("electron"))',
        'const serialportMod = Promise.resolve().then(() => require("serialport"))',
        'const localMod = import("./dynamic-local")',
        '',
        "const snippet = `import { ipcRenderer } from 'electron'`",
        'console.log(ipcRenderer, fs, Port, electronMod, serialportMod, localMod, snippet)',
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
})
