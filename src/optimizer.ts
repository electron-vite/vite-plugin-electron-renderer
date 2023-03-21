import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import type { Plugin as VitePlugin } from 'vite'
import {
  type Plugin as EsbuildPlugin,
} from 'esbuild'
import libEsm from 'lib-esm'
import { node_modules as find_node_modules } from 'vite-plugin-utils/function'
import { electronBuiltins, ensureDir } from './utils'

const cjs_require = createRequire(import.meta.url)
const electronNpmCjsNamespace = 'electron:npm-cjs'
const bareImport = /^[\w@].*/
const CACHE_DIR = '.vite-electron-renderer'
let node_modules_path: string
let cache_dir: string

export interface optimizerOptions {
  /**
   * Explicitly tell the Pre-Bundling how to work.
   * 
   * - `false` Vite's default Pre-Bundling will be used.
   */
  resolve?: (args: import('esbuild').OnResolveArgs) => { type: 'commonjs' | 'module' } | false | void | Promise<{ type: 'commonjs' | 'module' } | false | void>
}

export default function optimizer(options: optimizerOptions, nodeIntegration: boolean): VitePlugin {
  return {
    name: 'vite-plugin-electron-renderer:optimizer',
    config(config) {
      node_modules_path = find_node_modules(config.root ? path.resolve(config.root) : process.cwd())[0]
      cache_dir = path.join(node_modules_path, CACHE_DIR)

      config.optimizeDeps ??= {}
      config.optimizeDeps.esbuildOptions ??= {}
      config.optimizeDeps.esbuildOptions.platform ??= 'node'
      config.optimizeDeps.esbuildOptions.plugins ??= []
      config.optimizeDeps.esbuildOptions.plugins.push(esbuildPlugin(options))

      const metadata: {
        '// nodeIntegration': string
        nodeIntegration?: boolean
        timestamp: number
      } = {
        '// nodeIntegration': 'Record the last nodeIntegration value compared to the new value and decide whether to clear the `.vite` directory cache.',
        nodeIntegration: undefined,
        timestamp: Date.now(),
      }
      const metafile = path.join(cache_dir, '_metadata.json')

      if (fs.existsSync(metafile)) {
        try {
          Object.assign(metadata, JSON.parse(fs.readFileSync(metafile, 'utf8')))
        } catch { }
      }
      if (metadata.nodeIntegration !== nodeIntegration) {
        fs.rmSync(path.join(node_modules_path, '.vite'), { recursive: true, force: true })
        ensureDir(cache_dir)
        Object.assign(metadata, {
          nodeIntegration,
          timestamp: Date.now(),
        })
        fs.writeFileSync(metafile, JSON.stringify(metadata, null, 2))
      }
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

        // ---- Try to detect what type a module is ----
        let moduleType: 'commonjs' | 'module' | undefined
        const packageJson = path.join(node_modules_path, id, 'package.json')
        if (fs.existsSync(packageJson)) {
          const pkg = cjs_require(packageJson)
          if (pkg.type) {
            // { "type": "module" }
            moduleType = pkg.type === 'module' ? 'module' : 'commonjs'
          } else if (pkg.module) {
            // { "module": "main.mjs" }
            moduleType = 'module'
          } else if (pkg.exports) {
            if (pkg.exports.import) {
              // { "exports":  { "import": "main.mjs" } }
              moduleType = 'module'
            } else {
              for (const _export of Object.values<Record<string, string>>(pkg.exports)) {
                if (_export.import) {
                  // { "exports":  { ".": { "import": "main.mjs" } } }
                  moduleType = 'module'
                  break
                }
              }
            }
          }
        }

        const userType = await resolve?.(args)
        if (userType === false) {
          // Use Vite's default Pre-Bundling
          return
        }
        if (userType && typeof userType === 'object') {
          moduleType = userType.type
        }

        // Assign default value
        moduleType ??= 'commonjs'

        // Only `cjs` modules, especially C/C++ npm-pkg, `es` modules will be use Vite's default Pre-Bundling
        if (moduleType === 'commonjs') {
          return {
            path: id,
            namespace: electronNpmCjsNamespace,
          }
        }
      })

      build.onLoad({
        filter: /.*/,
        namespace: electronNpmCjsNamespace,
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
