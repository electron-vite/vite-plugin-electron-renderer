import fs from 'node:fs'
import path from 'node:path'
import { createRequire, builtinModules } from 'node:module'
import type {
  Alias,
  BuildOptions,
  Plugin as VitePlugin,
  UserConfig,
} from 'vite'
import { normalizePath } from 'vite'
import esbuild from 'esbuild'
import type { RollupOptions } from 'rollup'
import libEsm from 'lib-esm'
import {
  COLOURS,
  node_modules as find_node_modules,
  relativeify,
} from 'vite-plugin-utils/function'

const require = createRequire(import.meta.url)
const builtins = builtinModules.filter(m => !m.startsWith('_'));
const electronBuiltins = [
  'electron',
  ...builtins,
  ...builtins.map(module => `node:${module}`),
]
const CACHE_DIR = '.vite-electron-renderer'

const electron = `
const electron = typeof require !== 'undefined'
  // All exports module see https://www.electronjs.org -> API -> Renderer process Modules
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
   * Explicitly tell Vite how to load modules, which is very useful for C/C++ and `esm` modules
   * 
   * - `type.cjs` just wraps esm-interop
   * - `type.esm` pre-bundle to `cjs` and wraps esm-interop
   * 
   * @experimental
   */
  resolve?: {
    [module: string]: {
      type: 'cjs' | 'esm',
      /** Full custom how to pre-bundle */
      build?: (args: {
        cjs: (module: string) => Promise<string>,
        esm: (module: string, buildOptions?: import('esbuild').BuildOptions) => Promise<string>,
      }) => Promise<string>
    }
  }
}

export default function renderer(options: RendererOptions = {}): VitePlugin {
  let root: string
  let cacheDir: string
  const cwd = process.cwd()
  const resolveKeys: string[] = []
  const moduleCache = new Map<string, string>()

  return {
    name: 'vite-plugin-electron-renderer',
    async config(config, { command }) {
      // https://github.com/vitejs/vite/blob/v4.2.1/packages/vite/src/node/config.ts#L469-L472
      root = normalizePath(config.root ? path.resolve(config.root) : cwd)

      cacheDir = path.join(find_node_modules(root)[0] ?? cwd, CACHE_DIR)

      for (const [key, option] of Object.entries(options.resolve ?? {})) {
        if (command === 'build' && option.type === 'esm') {
          // A `esm` module can be build correctly during the `vite build`
          continue // (🚧-① only `type:cjs`)
        }
        resolveKeys.push(key)
      }

      // builtins
      const aliases: Alias[] = [{
        find: new RegExp(`^(?:node:)?(${['electron', ...builtins].join('|')})$`),
        // https://github.com/rollup/plugins/blob/alias-v5.0.0/packages/alias/src/index.ts#L90
        replacement: '$1',
        async customResolver(source) {
          let id = moduleCache.get(source)
          if (!id) {
            id = path.join(cacheDir, source) + '.mjs'

            if (!fs.existsSync(id)) {
              ensureDir(path.dirname(id))
              fs.writeFileSync( // lazy build
                id,
                source === 'electron' ? electron : getSnippets({ import: source, export: source }),
              )
            }

            moduleCache.set(source, id)
          }
          return { id }
        },
      }]

      // options.resolve (🚧-① only `type:cjs`)
      aliases.push({
        find: new RegExp(`^(${resolveKeys.join('|')})$`),
        replacement: '$1',
        async customResolver(source, importer, resolveOptions) {
          let id = moduleCache.get(source)
          if (!id) {
            const filename = path.join(cacheDir, source) + '.mjs'
            if (fs.existsSync(filename)) {
              id = filename
            } else {
              const resolved = options.resolve?.[source]
              if (resolved) {
                let snippets: string | undefined

                if (typeof resolved.build === 'function') {
                  snippets = await resolved.build({
                    cjs: module => Promise.resolve(getSnippets({ import: module, export: module })),
                    esm: (module, buildOptions) => getPreBundleSnippets({
                      root,
                      module,
                      outdir: cacheDir,
                      buildOptions,
                    }),
                  })
                } else if (resolved.type === 'cjs') {
                  snippets = getSnippets({ import: source, export: source })
                } else if (resolved.type === 'esm') {
                  snippets = await getPreBundleSnippets({
                    root,
                    module: source,
                    outdir: cacheDir,
                  })
                }

                console.log(
                  COLOURS.gary('[electron-renderer]'),
                  COLOURS.cyan('pre-bundling'),
                  COLOURS.yellow(source),
                )

                ensureDir(path.dirname(filename))
                fs.writeFileSync(filename, snippets ?? '/* empty */')
                id = filename
              } else {
                id = source
              }
            }

            moduleCache.set(source, id)
          }

          return id === source
            // https://github.com/rollup/plugins/blob/alias-v5.0.0/packages/alias/src/index.ts#L96-L100
            ? this.resolve(
              source,
              importer,
              Object.assign({ skipSelf: true }, resolveOptions),
            ).then((resolved) => resolved || { id: source })
            : { id }
        },
      })

      // Why is the builtin modules loaded by modifying `resolve.alias` instead of using the plugin `resolveId` + `load` hooks?
      // `resolve.alias` has a very high priority in Vite! it works on Pre-Bundling, build, serve, ssr etc. anywhere
      // secondly, `resolve.alias` can work in both the Renderer process and Web Worker, but not the plugin :(
      // ① Alias priority - https://github.com/vitejs/vite/blob/v4.2.0/packages/vite/src/node/plugins/index.ts#L45
      // ② Use in Pre-Bundling - https://github.com/vitejs/vite/blob/v4.2.0/packages/vite/src/node/optimizer/esbuildDepPlugin.ts#L199
      // ③ Worker does not share plugins - https://github.com/vitejs/vite/blob/v4.2.0/packages/vite/src/node/config.ts#L253-L256
      modifyAlias(config, aliases)

      modifyOptimizeDeps(config, resolveKeys)

      adaptElectron(config)
    },
  }
}

function adaptElectron(config: UserConfig) {
  // Make sure that Electron can be loaded into the local file using `loadFile()` after package
  config.base ??= './'

  config.build ??= {}
  config.build.rollupOptions ??= {}

  // Some third-party modules, such as `fs-extra`, it will extend the nativ fs module, maybe we need to stop it
  // ① Avoid freeze Object
  setOutputFreeze(config.build.rollupOptions)
  // ② Avoid not being able to set - https://github.com/rollup/plugins/blob/commonjs-v24.0.0/packages/commonjs/src/helpers.js#L55-L60
  withIgnore(config.build, electronBuiltins)
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

function withIgnore(configBuild: BuildOptions, modules: string[]) {
  configBuild.commonjsOptions ??= {}
  if (configBuild.commonjsOptions.ignore) {
    if (typeof configBuild.commonjsOptions.ignore === 'function') {
      const userIgnore = configBuild.commonjsOptions.ignore
      configBuild.commonjsOptions.ignore = id => {
        if (userIgnore?.(id) === true) {
          return true
        }
        return modules.includes(id)
      }
    } else {
      // @ts-ignore
      configBuild.commonjsOptions.ignore.push(...modules)
    }
  } else {
    configBuild.commonjsOptions.ignore = modules
  }
}

function modifyOptimizeDeps(config: UserConfig, exclude: string[]) {
  config.optimizeDeps ??= {}
  config.optimizeDeps.exclude ??= []
  for (const str of exclude) {
    if (!config.optimizeDeps.exclude.includes(str)) {
      // Avoid Vite secondary pre-bundle
      config.optimizeDeps.exclude.push(str)
    }
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

function getSnippets(module: {
  import: string,
  export: string,
}) {
  const { exports } = libEsm({ exports: Object.getOwnPropertyNames(/* not await import */require(module.import)) })

  // If a module is a CommonJs, use the `require()` load it can bring better performance, 
  // especially it is a C/C++ module, this can avoid a lot of trouble

  // `avoid_parse_require` can be avoid `esbuild.build`, `@rollup/plugin-commonjs`
  return `const avoid_parse_require = require; const _M_ = avoid_parse_require("${module.export}");\n${exports}`
}

async function getPreBundleSnippets(options: {
  root: string
  module: string
  outdir: string
  buildOptions?: esbuild.BuildOptions
}) {
  const {
    root,
    module,
    outdir,
    buildOptions = {},
  } = options

  const outfile = path.join(outdir, module) + '.cjs'
  await esbuild.build({
    entryPoints: [module],
    outfile,
    target: 'node14',
    format: 'cjs',
    bundle: true,
    sourcemap: 'inline',
    platform: 'node',
    external: electronBuiltins,
    ...buildOptions,
  })

  return getSnippets({
    import: outfile,
    // Since any module will be imported as an `import` in the Renderer process,
    // the __dirname(import.meta.url) of the module should be `http://localhost:5173/` which is the `root` directory
    export: relativeify(path.posix.relative(root, outfile)),
  })
}

function ensureDir(dirname: string) {
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true })
  }
}
