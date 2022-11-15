import fs from 'node:fs'
import path from 'node:path'
import { builtinModules, createRequire } from 'node:module'
import type { ExternalOption, RollupOptions } from 'rollup'
import {
  type Plugin,
  type ConfigEnv,
  normalizePath,
} from 'vite'
import libEsm from 'lib-esm'

export interface UseNodeJsOptions {
  /**
   * Whether node integration is enabled. Default is `false`.
   */
  nodeIntegration?: boolean
  /**
   * Whether node integration is enabled in web workers. Default is `false`. More
   * about this can be found in Multithreading.
   */
  nodeIntegrationInWorker?: boolean
}

const electron = `
/**
 * All exports module see https://www.electronjs.org -> API -> Renderer Process Modules
 */
const electron = require("electron");

// Proxy in Worker
let _ipcRenderer;
if (typeof WorkerGlobalScope !== 'undefined') {
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
`

/**
 * The `use-node.js.ts` plugin is designed to work without any problems.  
 * If you use the Node.js API in Web Worker, you need to introduce `use-node.js.ts` in the `plugins` option of Worker, which is not convenient for users,  
 * while `optimizer.ts` does not have this problem.
 * @deprecated removed in v0.11.0
 */
export default function useNodeJs(options: UseNodeJsOptions = {}): Plugin[] {
  let env: ConfigEnv
  const builtins: string[] = []
  const CJS_deps: string[] = []
  const ESM_deps: string[] = []
  const moduleCache = new Map([['electron', electron]])

  // When `electron` files or folders exist in the root directory, it will cause Vite to incorrectly splicing the `/@fs/` prefix.
  // Here, use `\0` prefix avoid this behavior
  const prefix = '\0'
  const pluginResolveId: Plugin = {
    name: 'vite-plugin-electron-renderer:use-node.js[resolveId]',
    // Bypassing Vite's builtin 'vite:resolve' plugin
    enforce: 'pre',
    resolveId(source) {
      if (env.command === 'serve' || /* 🚧-① */pluginResolveId.api?.isWorker) {
        if (ESM_deps.includes(source)) return // processed by vite-plugin-electron-renderer:optimizer
        if (builtins.includes(source)) return prefix + source
      }
    },
  }
  const plugin: Plugin = {
    name: 'vite-plugin-electron-renderer:use-node.js',
    // 🚧 Must be use config hook
    config(config, _env) {
      env = _env

      // https://github.com/vitejs/vite/blob/53799e1cced7957f9877a5b5c9b6351b48e216a7/packages/vite/src/node/config.ts#L439-L442
      const root = normalizePath(config.root ? path.resolve(config.root) : process.cwd())
      const resolved = resolveModules(root)

      builtins.push(...resolved.builtins)
      CJS_deps.push(...resolved.CJS_deps) // never used in this plugin
      ESM_deps.push(...resolved.ESM_deps)

      if (env.command === 'serve') {
        config.resolve ??= {}
        config.resolve.conditions ??= ['node']

        config.optimizeDeps ??= {}
        config.optimizeDeps.exclude ??= []
        // `electron` should not be Pre-Building
        config.optimizeDeps.exclude.push('electron')

        return config
      }

      if (env.command === 'build') {
        if (options.nodeIntegration) {
          config.build ??= {}
          config.build.rollupOptions ??= {}
          config.build.rollupOptions.external = withExternal(config.build.rollupOptions.external)
          setOutputFormat(config.build.rollupOptions)
        }

        if (plugin.api?.isWorker && options.nodeIntegrationInWorker) {
          /**
           * 🚧-①: 🤔 Not works (2022-10-08)
           * Worker build behavior is different from Web, `external` cannot be converted to `require("external-module")`.
           * So, it sitll necessary to correctly return the external-snippets in the `resolveId`, `load` hooks.
           */

          // config.worker ??= {}
          // config.worker.rollupOptions ??= {}
          // config.worker.rollupOptions.external = withExternal(config.worker.rollupOptions.external)
          // setOutputFormat(config.worker.rollupOptions)
        }

        return config
      }

      function withExternal(external?: ExternalOption) {
        if (
          Array.isArray(external) ||
          typeof external === 'string' ||
          external instanceof RegExp
        ) {
          // @ts-ignore
          external = builtins.concat(external)
        } else if (typeof external === 'function') {
          const original = external
          external = function externalFn(source, importer, isResolved) {
            if (builtins.includes(source)) {
              return true
            }
            return original(source, importer, isResolved)
          }
        } else {
          external = builtins
        }
        return external
      }

      // At present, Electron(20) can only support CommonJs
      function setOutputFormat(rollupOptions: RollupOptions) {
        rollupOptions.output ??= {}
        if (Array.isArray(rollupOptions.output)) {
          for (const o of rollupOptions.output) {
            if (o.format === undefined) o.format = 'cjs'
          }
        } else {
          if (rollupOptions.output.format === undefined) rollupOptions.output.format = 'cjs'
        }
      }

    },
    load(id) {
      if (env.command === 'serve' || /* 🚧-① */plugin.api?.isWorker) {
        /** 
         * ```
         * 🎯 Using Node.js packages(CJS) in Electron-Renderer(vite serve)
         * 
         * ┏————————————————————————————————————————┓                    ┏—————————————————┓
         * │ import { ipcRenderer } from 'electron' │                    │ Vite dev server │
         * ┗————————————————————————————————————————┛                    ┗—————————————————┛
         *                    │                                                   │
         *                    │ 1. HTTP(Request): electron module                 │
         *                    │ ————————————————————————————————————————————————> │
         *                    │                                                   │
         *                    │                                                   │
         *                    │ 2. Intercept in load-hook(Plugin)                 │
         *                    │ 3. Generate a virtual ESM module(electron)        │
         *                    │    ↓                                              │
         *                    │    const { ipcRenderer } = require('electron')    │
         *                    │    export { ipcRenderer }                         │
         *                    │                                                   │
         *                    │                                                   │
         *                    │ 4. HTTP(Response): electron module                │
         *                    │ <———————————————————————————————————————————————— │
         *                    │                                                   │
         * ┏————————————————————————————————————————┓                    ┏—————————————————┓
         * │ import { ipcRenderer } from 'electron' │                    │ Vite dev server │
         * ┗————————————————————————————————————————┛                    ┗—————————————————┛
         * 
         * ```
         */

        id = id.replace(prefix, '')
        if (builtins.includes(id)) {
          const cache = moduleCache.get(id)
          if (cache) return cache

          const workerCount = getWorkerIncrementCount()
          const _M_ID = typeof workerCount === 'number' ? `$${workerCount}` : ''

          /**
           * 🤔
           * Object.keys(require('fs-extra')).length      === 146
           * Object.keys(await import('fs-extra')).length === 32
           */
          const nodeModule = createRequire(import.meta.url)(id)
          const result = libEsm({ exports: Object.keys(nodeModule), conflict: _M_ID })
          const nodeModuleSnippet = `
const _M_${_M_ID} = require("${id}");
${result.exports}
`.trim()

          moduleCache.set(id, nodeModuleSnippet)
          return nodeModuleSnippet
        }
      }

    },
  }

  function getWorkerIncrementCount() {
    // 🚧-②: The worker file will build the role dependencies into one file, which may cause naming conflicts
    if (env.command === 'build' && plugin.api?.isWorker) {
      plugin.api.count ??= 0
      return plugin.api.count++
    }
  }

  return [
    pluginResolveId,
    plugin,
  ]
}

export function resolveModules(root: string) {
  const cjs_require = createRequire(import.meta.url)
  const cwd = process.cwd()
  const builtins = builtinModules.filter(e => !e.startsWith('_')); builtins.push('electron', ...builtins.map(m => `node:${m}`))
  // dependencies of package.json
  const CJS_deps: string[] = []
  // dependencies({ "type": "module" }) of package.json
  const ESM_deps: string[] = []

  // Resolve package.json dependencies
  const pkgId = lookupFile('package.json', [root, cwd])
  if (pkgId) {
    const pkg = cjs_require(pkgId)
    for (const npmPkg of Object.keys(pkg.dependencies || {})) {
      const pkgId2 = lookupFile(
        'package.json',
        [root, cwd].map(r => `${r}/node_modules/${npmPkg}`),
      )
      if (pkgId2) {
        const pkg2 = cjs_require(pkgId2)
        if (pkg2.type === 'module') {
          ESM_deps.push(npmPkg)
          continue
        }
      }
      CJS_deps.push(npmPkg)
    }
  }

  return {
    builtins,
    CJS_deps,
    ESM_deps,
  }
}

function lookupFile(filename: string, paths: string[]) {
  for (const p of paths) {
    const filepath = path.join(p, filename)
    if (fs.existsSync(filepath)) {
      return filepath
    }
  }
}
