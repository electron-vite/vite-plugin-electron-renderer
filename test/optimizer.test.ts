import fs from 'node:fs'
import path from 'node:path'
import {
  type Alias,
  build as viteBuild,
  resolveConfig,
} from 'vite'
import {
  describe,
  expect,
  it,
} from 'vitest'
import {
  type RendererOptions,
  default as renderer,
  electron as electronSnippets,
} from '..'
import { builtins } from './config.test'

const CACHE_DIR = path.join(__dirname, '../node_modules/.vite-electron-renderer')
const fixtures = path.join(__dirname, 'fixtures')
const renderer_resolve: RendererOptions['resolve'] = {
  serialport: { type: 'cjs' },
  'node-fetch': { type: 'esm' },
}

function getConfig(
  command: 'build' | 'serve',
  options?: RendererOptions,
) {
  return resolveConfig({
    configFile: false,
    plugins: [renderer(options)],
  }, command)
}

function excludeViteAlias(aliases: Alias[]) {
  return aliases.filter(a => !a.find.toString().includes('@vite'))
}

describe('optimizer', async () => {
  it('alias', async () => {
    const builtins_alias = excludeViteAlias((await getConfig('build')).resolve.alias)

    expect(builtins_alias).length(1)
    expect(builtins_alias[0].replacement).equal('$1')
    expect(builtins_alias[0].customResolver).toBeTypeOf('function')
    const builtinsReg = builtins_alias[0].find as RegExp
    for (const builtin of builtins) {
      expect(builtin).match(builtinsReg)
    }

    const resolve_serve_alias = excludeViteAlias((await getConfig('serve', { resolve: renderer_resolve })).resolve.alias)
    expect(resolve_serve_alias).length(2) // builtins, resolve
    expect(resolve_serve_alias[1].replacement).equal('$1')
    expect(resolve_serve_alias[1].customResolver).toBeTypeOf('function')
    const resolve_serve_reg = resolve_serve_alias[1].find as RegExp
    expect('serialport').match(resolve_serve_reg)
    expect('node-fetch').match(resolve_serve_reg)

    const resolve_build_alias = excludeViteAlias((await getConfig('build', { resolve: renderer_resolve })).resolve.alias)
    expect(resolve_build_alias).length(2) // builtins, resolve
    expect(resolve_build_alias[1].replacement).equal('$1')
    expect(resolve_build_alias[1].customResolver).toBeTypeOf('function')
    const build_serve_reg = resolve_build_alias[1].find as RegExp
    expect(build_serve_reg.test('serialport')).true
    // https://github.com/electron-vite/vite-plugin-electron-renderer/blob/v0.14.3/src/index.ts#L133-L137
    expect(build_serve_reg.test('node-fetch')).false

  })

  it('pre-bundling', async () => {
    fs.rmSync(CACHE_DIR, { recursive: true, force: true })

    const plugin_renderer = renderer({ resolve: renderer_resolve })
    const plugin_renderer_config = plugin_renderer.config
    plugin_renderer.config = function plugin_renderer(config, env) {
      // For force pre-bundling `esm` module
      // https://github.com/electron-vite/vite-plugin-electron-renderer/blob/v0.14.3/src/index.ts#L133-L137
      env.command = 'serve'
      return (plugin_renderer_config as Function)(config, env)
    }.bind(plugin_renderer.config)

    await viteBuild({
      configFile: false,
      root: fixtures,
      build: {
        lib: {
          entry: 'builtins.ts',
          formats: ['es'],
        },
      },
      plugins: [plugin_renderer],
    })

    expect(fs.readFileSync(path.join(CACHE_DIR, 'electron.mjs'), 'utf8')).equal(electronSnippets)
    expect(fs.existsSync(path.join(CACHE_DIR, 'fs.mjs'))).true // TODO: run
    expect(fs.existsSync(path.join(CACHE_DIR, 'path.mjs'))).true // TODO: run

    await viteBuild({
      configFile: false,
      root: fixtures,
      build: {
        lib: {
          entry: 'third-party.ts',
          formats: ['es'],
        },
      },
      plugins: [plugin_renderer],
    })

    expect(fs.existsSync(path.join(CACHE_DIR, 'serialport.mjs'))).true // TODO: run
    expect(fs.existsSync(path.join(CACHE_DIR, 'node-fetch.cjs'))).true // TODO: run
    expect(fs.existsSync(path.join(CACHE_DIR, 'node-fetch.mjs'))).true // TODO: run

    fs.rmSync(path.join(fixtures, 'dist'), { recursive: true, force: true })
  })
})
