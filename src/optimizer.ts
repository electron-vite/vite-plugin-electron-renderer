import { createRequire } from 'node:module'
import type { Plugin as VitePlugin } from 'vite'
import type { Plugin as EsbuildPlugin } from 'esbuild'
import libEsm from 'lib-esm'
import { electronBuiltins } from './utils'

const cjs_require = createRequire(import.meta.url)
const electronPlatformNodeNamespace = 'electron:platform-node'
const bareImport = /^[\w@].*/

export interface optimizerOptions {
  /**
   * Explicitly tell the Pre-Bundling how to work.
   */
  resolve?: (args: import('esbuild').OnResolveArgs) =>
    | void
    | { platform: 'browser' | 'node' }
    | Promise<void | { platform: 'browser' | 'node' }>
}

export default function optimizer(options: optimizerOptions = {}, nodeIntegration?: boolean): VitePlugin {
  return {
    name: 'vite-plugin-electron-renderer:optimizer',
    config(config) {
      config.optimizeDeps ??= {}
      config.optimizeDeps.esbuildOptions ??= {}
      config.optimizeDeps.esbuildOptions.plugins ??= []
      config.optimizeDeps.esbuildOptions.plugins.push(esbuildPlugin(options))
    },
  }
}

export function esbuildPlugin(options: optimizerOptions): EsbuildPlugin {
  const { resolve } = options

  return {
    name: 'vite-plugin-target:optimizer:esbuild',
    setup(build) {
      // https://github.com/vitejs/vite/blob/v4.2.0/packages/vite/src/node/optimizer/esbuildDepPlugin.ts#L277-L279
      const escape = (text: string) =>
        `^${text.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}$`
      const filter = new RegExp(electronBuiltins.map(escape).join('|'))

      // Electron builtin modules
      build.onResolve({ filter }, args => {
        return {
          path: args.path,
          external: true,
        }
      })

      // Third party npm-pkg
      build.onResolve({ filter: bareImport }, async args => {
        const {
          path: id,
          namespace,
          importer,
        } = args
        if (electronBuiltins.includes(id)) {
          // Builtin modules handled in './build-config.ts'
          return
        }
        if (importer.includes('node_modules')) {
          return
        }
        if (id.startsWith('vite-') || namespace.startsWith('vite:')) {
          // https://github.com/vitejs/vite/blob/v4.2.0/packages/vite/src/node/optimizer/esbuildDepPlugin.ts#L15-L20
          return
        }
        if (id.startsWith('virtual-module:')) {
          // https://github.com/vitejs/vite/blob/v4.2.0/packages/vite/src/node/optimizer/scan.ts#L436-L438
          return
        }

        // TODO: Auto-detect `node` platform

        const resolved = await resolve?.(args)
        if (resolved?.platform === 'node') {
          return {
            path: id,
            namespace: electronPlatformNodeNamespace,
          }
        }
      })

      build.onLoad({
        filter: /.*/,
        namespace: electronPlatformNodeNamespace,
      }, async ({ path: id }) => {
        const { exports } = libEsm({ exports: Object.getOwnPropertyNames(cjs_require(id)) })

        return {
          contents: `
// Use "__cjs_require" avoid esbuild parse "require"
// TODO: better implements
const __cjs_require = require;

// If a module is a CommonJs, use the "require" loading it can bring better performance.
// Especially it is a C/C++ module, this can avoid a lot of trouble.
const _M_ = __cjs_require("${id}");
${exports}
`.trim(),
        }
      })
    },
  }
}
