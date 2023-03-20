import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import type { Plugin as VitePlugin } from 'vite'
import {
  type Plugin as EsbuildPlugin,
} from 'esbuild'
import libEsm from 'lib-esm'
import { COLOURS, node_modules as find_node_modules } from 'vite-plugin-utils/function'
import { electronBuiltins, ensureDir } from './utils'

const cjs_require = createRequire(import.meta.url)
const preBundleCjs = 'pre-bundle-cjs'
const preBundleEsm = 'pre-bundle-esm'
const CACHE_DIR = '.vite-electron-renderer'
let node_modules_path: string
let cache_dir: string

export interface optimizerOptions {
  buildOptions?: import('esbuild').BuildOptions
  /**
   * Explicitly tell the Pre-Bundling how to work, when value is `false` Vite's default Pre-Bundling will be used.
   */
  modules?: { [module: string]: 'commonjs' | 'module' | false }
}

export default function optimizer(options: optimizerOptions, nodeIntegration: boolean): VitePlugin {
  return {
    name: 'vite-plugin-electron-renderer:pre-bundle',
    config(config) {
      node_modules_path = find_node_modules(config.root ? path.resolve(config.root) : process.cwd())[0]
      cache_dir = path.join(node_modules_path, CACHE_DIR)

      config.optimizeDeps ??= {}
      config.optimizeDeps.esbuildOptions ??= {}
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
  const { buildOptions, modules = {} } = options

  return {
    name: 'vite-plugin-target:optimizer:esbuild',
    setup(build) {
      build.onResolve({
        filter: /^[\w@]/, // bare import
      }, async ({ path: id }) => {
        if (electronBuiltins.includes(id)) {
          // Builtin modules handled in 'build-config'
          return
        }

        const userType = modules[id]
        if (userType === false) {
          // Use Vite's default Pre-Bundling
          return
        } else if (userType === 'commonjs') {
          return {
            path: id,
            namespace: preBundleCjs,
          }
        } else if (userType === 'module') {
          return {
            path: id,
            namespace: preBundleEsm,
          }
        }

        // ---- Try to detect what type a module is ----

        let isCjsModule!: boolean
        // Assume a bare module
        const packageJson = path.join(node_modules_path, id, 'package.json')
        // Assume a dirname or filename -> e.g. `foo/bar` or `foo/bar/index.js` 🤔
        const modulePath = path.join(node_modules_path, id)

        if (fs.existsSync(packageJson)) {
          const pkg = cjs_require(packageJson)
          if (pkg.type !== 'module') {
            isCjsModule = true
          }
        } else {
          try {
            const filename = cjs_require.resolve(modulePath)
            if (path.extname(filename) !== '.mjs') {
              isCjsModule = true
            }
          } catch (error) {
            console.log(COLOURS.red('Can not resolve path:'), modulePath)
          }
        }

        return {
          path: id,
          namespace: isCjsModule ? preBundleCjs : preBundleEsm,
        }
      })

      build.onLoad({
        filter: /.*/,
        namespace: preBundleCjs,
      }, async ({ path: id }) => {
        const { exports } = libEsm({ exports: Object.getOwnPropertyNames(cjs_require(id)) })

        return {
          contents: `
// Use "__cjs_require" avoid esbuild parse "require"
const __cjs_require = require;

// If a module is a CommonJs, use the "require" loading it can bring better performance.
// Especially it is a C/C++ module, this can avoid a lot of trouble.
const _M_ = __cjs_require("${id}");
${exports}
  `.trim(),
        }
      })

      build.onLoad({
        filter: /.*/,
        namespace: preBundleEsm,
      }, async ({ path: id }) => {
        const outfile = path.join(cache_dir, id, 'index.js')
        ensureDir(path.dirname(outfile))

        await build.esbuild.build({
          entryPoints: [id],
          outfile,
          format: 'esm',
          target: 'node14',
          bundle: true,
          metafile: true,
          external: electronBuiltins,
          ...buildOptions,
        })

        return { contents: fs.readFileSync(outfile, 'utf8') }
      })
    },
  }
}
