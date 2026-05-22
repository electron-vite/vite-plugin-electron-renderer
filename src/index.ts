import fs from 'node:fs'
import { builtinModules } from 'node:module'
import path from 'node:path'

import type { Plugin as VitePlugin, UserConfig, Logger } from 'vite'
import { createLogger, normalizePath } from 'vite'

import { esmSnippet, cjsSnippet, PLUGIN_NAME, electronSnippet } from './snippets'

const ELECTRON_PATHS = [
  'electron',
  'electron/main',
  'electron/renderer',
  'electron/common',
  'electron/utility',
]
const NODE_BUILTINS = builtinModules.filter((m) => !m.startsWith('_'))

const ALL_BUILTINS = [
  ...ELECTRON_PATHS,
  ...NODE_BUILTINS,
  ...NODE_BUILTINS.filter((m) => !m.startsWith('node:')).map((m) => `node:${m}`),
]

const CACHE_DIR = '/.vite-electron-renderer'
const TAG = '[electron-renderer]'
const RE_ESCAPE = /[\\^$.*+?()[\]{}|]/g

export interface RendererOptions {
  /**
   * Explicitly tell Vite how to load modules, which is very useful for C/C++ and `esm` modules
   *
   * - `type.cjs` loads through `require()` and exposes statically known names when possible
   * - `type.esm` loads through `createRequire()` and exposes statically known names when possible (falls back to dynamic `export *` when introspection fails)
   *
   * Experimental.
   */
  resolve?: {
    [module: string]: {
      type: 'cjs' | 'esm'
      /** Full custom how to generate the shim module */
      build?: (args: {
        cjs: (module: string) => Promise<string>
        esm: (module: string) => Promise<string>
      }) => Promise<string>
    }
  }
}

export default function renderer(options: RendererOptions = {}): VitePlugin {
  return createRenderer(options, false)
}

function createRenderer(options: RendererOptions, isWorker: boolean): VitePlugin {
  let cacheDir: string
  let root: string
  let logger: Logger
  const moduleCache = new Map<string, string>()

  const resolveOptions = options.resolve ?? {}
  const externalModules = [...new Set([...Object.keys(resolveOptions), ...ALL_BUILTINS])]

  async function buildSnippet(source: string): Promise<string> {
    const resolved = resolveOptions[source]

    if (source === 'electron') {
      return electronSnippet
    }
    if (typeof resolved?.build === 'function') {
      logger.info(`Custom build for ${source}`, { timestamp: true })
      return (
        (await resolved.build({
          cjs: async (module) => cjsSnippet(module),
          esm: async (module) => esmSnippet(module, root),
        })) ?? `/* ${TAG}: empty */`
      )
    }
    if (resolved?.type === 'esm') {
      logger.info(`Wrap for ESM dep: ${source}`, { timestamp: true })
      return esmSnippet(source, root)
    }
    if (resolved) {
      logger.info(`Wrap for CJS dep: ${source}`, { timestamp: true })
    }
    return cjsSnippet(source)
  }

  async function resolveShim(source: string): Promise<string> {
    const cacheKey = source.startsWith('node:') ? source.slice(5) : source
    const cached = moduleCache.get(cacheKey)
    if (cached) {
      return cached
    }
    const snippets = await buildSnippet(cacheKey)
    return writeCacheModule(moduleCache, cacheDir, cacheKey, snippets)
  }

  return {
    name: PLUGIN_NAME,
    enforce: 'pre',
    async config(config) {
      moduleCache.clear()

      const partial: UserConfig = {
        base: config.base ?? './',
        resolve: {
          conditions: ['node'],
        },
        optimizeDeps: {
          exclude: externalModules,
        },
        // App builds should externalize renderer shims in Rolldown. Library
        // builds are used by Vite's pre-bundling path and still need shim
        // modules to be generated on resolve.
        build: {
          rolldownOptions: {
            external: externalModules,
          },
        },
      }

      if (!isWorker) {
        // Vite worker sub-configs use a separate plugin container, so
        // re-register the plugin under `worker.plugins`. Guarded by
        // `!isWorker` to avoid recursion.
        partial.worker = {
          plugins: () => [createRenderer(options, true)],
        }
      }

      return partial
    },
    configResolved(config) {
      cacheDir = path.dirname(config.cacheDir) + CACHE_DIR
      root = config.root
      logger = createLogger(config.logLevel ?? 'info', { prefix: TAG })
    },
    resolveId: {
      order: 'pre',
      filter: {
        id: new RegExp(
          `^(?:${externalModules.map((s) => s.replace(RE_ESCAPE, '\\$&')).join('|')})$`,
        ),
      },
      async handler(source) {
        return resolveShim(source)
      },
    },
  }
}

function writeCacheModule(
  moduleCache: Map<string, string>,
  outDir: string,
  source: string,
  content: string, // Lazy initialization
): string {
  let id = moduleCache.get(source)
  if (!id) {
    id = getCacheFile(outDir, source, '.mjs').filename
    fs.mkdirSync(path.dirname(id), { recursive: true })
    fs.writeFileSync(id, content)
    moduleCache.set(source, id)
  }
  return id
}

function getCacheFile(outDir: string, moduleId: string, extension: string) {
  const root = path.resolve(outDir)
  // Use `+` as the path separator: it's invalid in npm package names and
  // built-in module IDs, so it can't collide with a literal `_`/`-` in a name.
  const safe = moduleId.replaceAll('/', '+').replaceAll(':', '+')
  const filename = path.resolve(root, `${safe}${extension}`)
  const relativePath = normalizePath(path.relative(root, filename))

  if (relativePath === '' || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new TypeError(`Invalid cache file path for ${JSON.stringify(moduleId)}`)
  }

  return { filename: normalizePath(filename), relativePath }
}
