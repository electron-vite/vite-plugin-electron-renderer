import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire, builtinModules } from 'node:module'
import type {
  Alias,
  BuildOptions,
  Plugin as VitePlugin,
  UserConfig,
} from 'vite'
import type { RollupOptions } from 'rollup'
import libEsm from 'lib-esm'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const builtins = builtinModules.filter(m => !m.startsWith('_')); builtins.push(...builtins.map(m => `node:${m}`))
const electronBuiltins = ['electron', ...builtins]
const PACKAGE_PATH = path.join(__dirname, '..')
const BUILTIN_PATH = 'vite-plugin-electron-renderer/builtins'
const RESOLVE_PATH = 'vite-plugin-electron-renderer/.resolve'

export interface RendererOptions {
  /**
   * Explicitly tell Vite how to load modules, which is very useful for C/C++ modules.  
   * Most of the time, you don't need to use it when a module is a C/C++ module, you can load them by return `{ platform: 'node' }`.  
   * 
   * If you know exactly how Vite works, you can customize the return snippets.  
   * 
   * ```js
   * renderer({
   *   resolve: {
   *     // Use the serialport(C/C++) module as an example
   *     serialport: () => ({ platform: 'node' }),
   *     // Equivalent to
   *     serialport: () => `const lib = require("serialport"); export default lib.default || lib;`,
   *   },
   * })
   * ```
   * 
   * @experimental
   */
  resolve?: {
    [id: string]: (() => string | { platform: 'browser' | 'node' } | Promise<string | { platform: 'browser' | 'node' }>)
  }
}

export default function renderer(options: RendererOptions = {}): VitePlugin {
  return {
    name: 'vite-plugin-electron-renderer',
    async config(config) {
      // Make sure that Electron can be loaded into the local file using `loadFile()` after package
      config.base ??= './'

      config.build ??= {}

      // https://github.com/electron-vite/electron-vite-vue/issues/107
      config.build.cssCodeSplit ??= false

      // This ensures that static resources are loaded correctly, such as images, `worker.js`
      // BWT, the `.js` file can be loaded correctly with './cjs-shim.ts'
      config.build.assetsDir ??= ''
      // TODO: compatible with custom assetsDir for static resources

      config.build.rollupOptions ??= {}

      // Some third-party modules, such as `fs-extra`, it will extend the nativ fs module, maybe we need to stop it
      // ① Avoid freeze Object
      setOutputFreeze(config.build.rollupOptions)
      // ② Avoid not being able to set - https://github.com/rollup/plugins/blob/commonjs-v24.0.0/packages/commonjs/src/helpers.js#L55-L60
      withIgnore(config.build)

      const resolveAliases = await buildResolve(options)
      const builtinAliases: Alias[] = electronBuiltins
        .filter(m => !m.startsWith('node:'))
        .map<Alias>(m => ({
          find: new RegExp(`^(node:)?${m}$`),
          // Vite's pre-bundle only recognizes bare-import
          replacement: `${BUILTIN_PATH}/${m}`,
          // TODO: must be use absolute path for `pnnpm` monorepo - `shamefully-hoist=true` 🤔
        }))

      // Why is the builtin modules loaded by modifying `resolve.alias` instead of using the plugin `resolveId` + `load` hooks?
      // `resolve.alias` has a very high priority in Vite! it works on Pre-Bundling, build, serve, ssr etc. anywhere
      // secondly, `resolve.alias` can work in both the Renderer process and Web Worker, but not the plugin :(
      // ① Alias priority - https://github.com/vitejs/vite/blob/v4.2.0/packages/vite/src/node/plugins/index.ts#L45
      // ② Use in Pre-Bundling - https://github.com/vitejs/vite/blob/v4.2.0/packages/vite/src/node/optimizer/esbuildDepPlugin.ts#L199
      // ③ Worker does not share plugins - https://github.com/vitejs/vite/blob/v4.2.0/packages/vite/src/node/config.ts#L253-L256
      modifyAlias(config, [...resolveAliases, ...builtinAliases])
    },
  }
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
      const { exports } = libEsm({ exports: Object.getOwnPropertyNames(/* await import */require(name)) })
      snippets = `
// If a module is a CommonJs, use the \`require()\` load it can bring better performance, 
// especially it is a C/C++ module, this can avoid a lot of trouble.
const avoid_parse_require = require; const _M_ = avoid_parse_require("${name}");
${exports}
`.trim()
    }

    if (!snippets) continue

    const resolvePath = path.join(PACKAGE_PATH, '.resolve', name)
    if (!fs.existsSync(/* reuse cache */resolvePath)) {
      ensureDir(path.dirname(resolvePath))
      fs.writeFileSync(resolvePath + '.mjs', snippets)
    }

    aliases.push({
      find: name,
      replacement: `${RESOLVE_PATH}/${name}`,
    })
  }

  return aliases
}

function ensureDir(dirname: string) {
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true })
  }
}
