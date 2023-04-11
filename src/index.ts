import fs from 'node:fs'
import path from 'node:path'
import { createRequire, builtinModules } from 'node:module'
import type {
  Alias,
  BuildOptions,
  Plugin as VitePlugin,
  UserConfig,
} from 'vite'
import type { RollupOptions } from 'rollup'
import libEsm from 'lib-esm'
import { COLOURS, node_modules as find_node_modules } from 'vite-plugin-utils/function'

const require = createRequire(import.meta.url)
const builtins = builtinModules.filter(m => !m.startsWith('_'));
const electronBuiltins = [
  'electron',
  ...builtins,
  ...builtins.map(module => `node:${module}`),
]

const electron = `
const electron = typeof require !== 'undefined'
  // All exports module see https://www.electronjs.org -> API -> Renderer Process Modules
  ? (function requireElectron() {
    const avoid_parse_require = require;
    return avoid_parse_require("electron");
  }())
  : (function nodeIntegrationWarn() {
    console.error(\`If you need to use "electron" in the Renderer process, make sure that "nodeIntegration" is enabled in the Main process.\`);
    return {
      // TODO: polyfill
    };
  }());

// Proxy in Worker
let _ipcRenderer;
if (typeof document === 'undefined') {
  _ipcRenderer = {};
  const keys = [
    'invoke',
    'postMessage',
    'send',
    'sendSync',
    'sendTo',
    'sendToHost',
    // propertype
    'addListener',
    'emit',
    'eventNames',
    'getMaxListeners',
    'listenerCount',
    'listeners',
    'off',
    'on',
    'once',
    'prependListener',
    'prependOnceListener',
    'rawListeners',
    'removeAllListeners',
    'removeListener',
    'setMaxListeners',
  ];
  for (const key of keys) {
    _ipcRenderer[key] = () => {
      throw new Error(
        'ipcRenderer doesn\\'t work in a Web Worker.\\n' +
        'You can see https://github.com/electron-vite/vite-plugin-electron/issues/69'
      );
    };
  }
} else {
  _ipcRenderer = electron.ipcRenderer;
}

export { electron as default };
export const clipboard = electron.clipboard;
export const contextBridge = electron.contextBridge;
export const crashReporter = electron.crashReporter;
export const ipcRenderer = _ipcRenderer;
export const nativeImage = electron.nativeImage;
export const shell = electron.shell;
export const webFrame = electron.webFrame;
export const deprecate = electron.deprecate;
`.trim()

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
    [id: string]: (() => string | { platform: 'node' } | Promise<string | { platform: 'node' }>)
  }
}

export default function renderer(options: RendererOptions = {}): VitePlugin {
  let cacheDir: string
  const moduleCache = new Map<string, string>()
  const resolveKeys = Object.keys(options.resolve ?? {})

  return {
    name: 'vite-plugin-electron-renderer',
    async config(config) {
      cacheDir = path.join(
        find_node_modules(config.root ?? process.cwd())?.[0] ?? process.cwd(),
        '.vite-electron-renderer',
      )

      // Make sure that Electron can be loaded into the local file using `loadFile()` after package
      config.base ??= './'

      config.build ??= {}
      config.build.rollupOptions ??= {}

      // Some third-party modules, such as `fs-extra`, it will extend the nativ fs module, maybe we need to stop it
      // ① Avoid freeze Object
      setOutputFreeze(config.build.rollupOptions)
      // ② Avoid not being able to set - https://github.com/rollup/plugins/blob/commonjs-v24.0.0/packages/commonjs/src/helpers.js#L55-L60
      withIgnore(config.build)

      const aliases: Alias[] = [{
        find: new RegExp(`^(?:node:)?(${['electron', ...builtins, ...resolveKeys].join('|')})$`),
        // https://github.com/rollup/plugins/blob/alias-v5.0.0/packages/alias/src/index.ts#L90
        replacement: '$1',
        async customResolver(source) {
          let id = moduleCache.get(source)
          if (!id) {
            id = path.join(cacheDir, source) + '.mjs'

            if (!fs.existsSync(id)) {
              let snippets: string

              if (source === 'electron') {
                snippets = electron
              } else if (builtins.includes(source)) {
                snippets = getSnippets(source)
              } else {
                const result = await options.resolve?.[source]()
                if (result && typeof result === 'object' && result.platform === 'node') {
                  snippets = getSnippets(source)
                } else {
                  snippets = result as string // any type
                }
              }

              ensureDir(path.dirname(id))
              fs.writeFileSync(id, snippets)

              console.log(
                COLOURS.gary('[electron-renderer]'),
                COLOURS.cyan('pre-bundling'),
                COLOURS.yellow(source),
              )
            }

            moduleCache.set(source, id)
          }
          return { id }
        },
      }]

      // Why is the builtin modules loaded by modifying `resolve.alias` instead of using the plugin `resolveId` + `load` hooks?
      // `resolve.alias` has a very high priority in Vite! it works on Pre-Bundling, build, serve, ssr etc. anywhere
      // secondly, `resolve.alias` can work in both the Renderer process and Web Worker, but not the plugin :(
      // ① Alias priority - https://github.com/vitejs/vite/blob/v4.2.0/packages/vite/src/node/plugins/index.ts#L45
      // ② Use in Pre-Bundling - https://github.com/vitejs/vite/blob/v4.2.0/packages/vite/src/node/optimizer/esbuildDepPlugin.ts#L199
      // ③ Worker does not share plugins - https://github.com/vitejs/vite/blob/v4.2.0/packages/vite/src/node/config.ts#L253-L256
      modifyAlias(config, aliases)
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

function getSnippets(module: string) {
  const { exports } = libEsm({ exports: Object.getOwnPropertyNames(/* not await import */require(module)) })
  // If a module is a CommonJs, use the \`require()\` load it can bring better performance, 
  // especially it is a C/C++ module, this can avoid a lot of trouble.
  return `const avoid_parse_require = require; const _M_ = avoid_parse_require("${module}");\n${exports}`
}

function ensureDir(dirname: string) {
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true })
  }
}
