import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { builtinModules } from 'node:module'
import type {
  Alias,
  BuildOptions,
  Plugin as VitePlugin,
  UserConfig,
} from 'vite'
import type { RollupOptions } from 'rollup'
import type { Plugin as EsbuildPlugin } from 'esbuild'
import libEsm from 'lib-esm'
import cjsShim from './cjs-shim'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const builtins = builtinModules.filter(m => !m.startsWith('_')); builtins.push(...builtins.map(m => `node:${m}`))
const electronBuiltins = ['electron', ...builtins]
// Must be use absolute path for `pnnpm` monorepo - `shamefully-hoist=true`
const BUILTINS_PATH = path.join(__dirname, 'builtins')
const RESOLVE_PATH = path.join(__dirname, '.resolve')

export interface RendererOptions {
  /**
   * Explicitly tell Vite how to load modules, which is very useful for C/C++ modules.  
   * Most of the time, you don't need to use it when a module is a C/C++ module, you can load them by return `{ platform: 'node' }`.  
   * 
   * If you know exactly how Vite works, you can customize the return snippets.  
   * `e.g.`
   * ```js
   * renderer({
   *   resolve: (id) => `const lib = require("${id}");\nexport default lib.default || lib;`
   * })
   * ```
   * 
   * @experimental
   */
  resolve?: {
    [id: string]: (() => string | { platform: 'browser' | 'node' } | Promise<string | { platform: 'browser' | 'node' }>)
  }
}

export default function renderer(options: RendererOptions = {}): VitePlugin[] {
  return [
    cjsShim(),
    {
      name: 'vite-plugin-electron-renderer:build-config',
      async config(config) {
        // Make sure that Electron can be loaded into the local file using `loadFile` after packaging
        config.base ??= './'

        config.build ??= {}

        // TODO: init `config.build.target`
        // https://github.com/vitejs/vite/pull/8843

        // https://github.com/electron-vite/electron-vite-vue/issues/107
        config.build.cssCodeSplit ??= false

        // TODO: compatible with custom assetsDir
        // This will guarantee the proper loading of static resources, such as images, `worker.js`
        // The `.js` file can be loaded correctly with cjs-shim.ts
        config.build.assetsDir ??= ''

        config.build.rollupOptions ??= {}
        config.build.rollupOptions.output ??= {}

        // `fs-extra` will extend the `fs` module
        setOutputFreeze(config.build.rollupOptions)

        // Some third-party modules, such as `fs-extra`, extend the native module
        // `__esModule` to bypass Rollup's `getAugmentedNamespace`
        // see - https://github.com/rollup/plugins/blob/commonjs-v24.0.0/packages/commonjs/src/helpers.js#L38
        withIgnore(config.build)

        // -------------------------------------------------

        config.optimizeDeps ??= {}
        config.optimizeDeps.esbuildOptions ??= {}
        config.optimizeDeps.esbuildOptions.plugins ??= []
        config.optimizeDeps.esbuildOptions.plugins.push(esbuildPlugin())

        // -------------------------------------------------

        const resolveAliases = await buildResolve(options)
        const builtinAliases: Alias[] = electronBuiltins
          .filter(m => !m.startsWith('node:'))
          .map<Alias>(m => ({
            find: new RegExp(`^(node:)?${m}$`),
            replacement: path.join(BUILTINS_PATH, m),
          }))

        // Why is the builtin modules loaded by modifying `resolve.alias` instead of using the plugin `resolveId` + `load` hooks?
        // `resolve.alias` can work in both the Renderer process and Web Worker, but not the plugin :(
        // see - https://github.com/vitejs/vite/blob/v4.2.0/packages/vite/src/node/config.ts#L253-L256
        modifyAlias(config, [...resolveAliases, ...builtinAliases])
      },
    }
  ]
}


function setOutputFreeze(rollupOptions: RollupOptions) {
  rollupOptions.output ??= {}
  if (Array.isArray(rollupOptions.output)) {
    for (const o of rollupOptions.output) {
      o.freeze ??= false
    }
  } else {
    rollupOptions.output.freeze ??= false
  }
}

function withIgnore(configBuild: BuildOptions) {
  configBuild.commonjsOptions ??= {}
  if (configBuild.commonjsOptions.ignore) {
    if (typeof configBuild.commonjsOptions.ignore === 'function') {
      const userIgnore = configBuild.commonjsOptions.ignore
      configBuild.commonjsOptions.ignore = id => {
        if (userIgnore?.(id) === true) {
          return true
        }
        return electronBuiltins.includes(id)
      }
    } else {
      // @ts-ignore
      configBuild.commonjsOptions.ignore.push(...electronBuiltins)
    }
  } else {
    configBuild.commonjsOptions.ignore = electronBuiltins
  }
}

function modifyAlias(config: UserConfig, aliases: Alias[]) {
  config.resolve ??= {}
  config.resolve.alias ??= []
  if (Object.prototype.toString.call(config.resolve.alias) === '[object Object]') {
    config.resolve.alias = Object
      .entries(config.resolve.alias)
      .reduce<Alias[]>((memo, [find, replacement]) => memo.concat({ find, replacement }), [])
  }
  (config.resolve.alias as Alias[]).push(...aliases)
}

async function buildResolve(options: RendererOptions) {
  const aliases: Alias[] = []

  for (const [name, resolveFn] of Object.entries(options.resolve ?? {})) {
    let snippets: string | undefined

    const result = await resolveFn()
    if (typeof result === 'string') {
      snippets = result
    } else if (result && typeof result === 'object' && result.platform === 'node') {
      const { exports } = libEsm({ exports: Object.getOwnPropertyNames(await import(name)) })
      // If a module is a CommonJs, use the "require" loading it can bring better performance.
      // Especially it is a C/C++ module, this can avoid a lot of trouble.
      snippets = `const _M_ = require("${name}");\n${exports}`
    }

    if (!snippets) continue

    const resolvePath = path.join(RESOLVE_PATH, name)
    aliases.push({
      find: name,
      replacement: resolvePath,
    })

    if (!/* reuse cache */fs.existsSync(resolvePath)) {
      ensureDir(path.dirname(resolvePath))
      fs.writeFileSync(resolvePath + '.mjs', snippets)
    }
  }

  return aliases
}

function esbuildPlugin(): EsbuildPlugin {
  return {
    name: 'vite-plugin-target:optimizer:esbuild',
    setup(build) {
      // https://github.com/vitejs/vite/blob/v4.2.0/packages/vite/src/node/optimizer/esbuildDepPlugin.ts#L277-L279
      const escape = (text: string) =>
        `^${text.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}$`
      const filter = new RegExp(electronBuiltins.map(escape).join('|'))

      // Avoid Vite internal esbuild plugin
      // https://github.com/vitejs/vite/blob/v4.2.0/packages/vite/src/node/optimizer/esbuildDepPlugin.ts#L288
      build.onResolve({ filter }, args => {
        return {
          path: args.path,
          external: true,
        }
      })
    },
  }
}

function ensureDir(dirname: string) {
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true })
  }
}
