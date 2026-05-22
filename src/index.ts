import fs from 'node:fs'
import { builtinModules } from 'node:module'
import path from 'node:path'

import type { Plugin as VitePlugin, UserConfig, Logger } from 'vite'
import { createLogger, normalizePath } from 'vite'

import { esmSnippet, cjsSnippet, PLUGIN_NAME, electronSnippet } from './snippets'

const ELECTRON_SUBPATHS = [
  'electron/main',
  'electron/renderer',
  'electron/common',
  'electron/utility',
]
const NODE_BUILTINS = builtinModules.filter((m) => !m.startsWith('_'))
const NODE_BUILTIN_SET = new Set(NODE_BUILTINS.map((m) => (m.startsWith('node:') ? m.slice(5) : m)))
const ALL_BUILTINS = [
  'electron',
  ...ELECTRON_SUBPATHS,
  ...NODE_BUILTINS,
  ...NODE_BUILTINS.filter((m) => !m.startsWith('node:')).map((m) => `node:${m}`),
]
const SHIMMED = new Set(ALL_BUILTINS)

const CACHE_DIR = '/.vite-electron-renderer'
const TAG = '[electron-renderer]'

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

  const resolveOptions = new Map<string, NonNullable<RendererOptions['resolve']>[string]>()
  for (const [key, option] of Object.entries(options.resolve ?? {})) {
    const normalizedKey =
      key.startsWith('node:') && NODE_BUILTIN_SET.has(key.slice(5)) ? key.slice(5) : key
    resolveOptions.set(normalizedKey, option)
  }
  const externalModules = [...new Set([...resolveOptions.keys(), ...ALL_BUILTINS])]
  const buildModules = [
    ...new Set(
      externalModules.map((source) =>
        source.startsWith('node:') && NODE_BUILTIN_SET.has(source.slice(5))
          ? source.slice(5)
          : source,
      ),
    ),
  ]

  async function buildSnippet(source: string): Promise<string> {
    const resolved = resolveOptions.get(source)

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
    const cacheKey =
      source.startsWith('node:') && NODE_BUILTIN_SET.has(source.slice(5)) ? source.slice(5) : source
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
    async buildStart() {
      // Rolldown externalizes these ids before `resolveId` runs, so build-time
      // cache modules must be materialized eagerly.
      await Promise.all(buildModules.map((source) => resolveShim(source)))
    },
    async resolveId(source) {
      if (!SHIMMED.has(source) && !resolveOptions.has(source)) {
        return null
      }
      return resolveShim(source)
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
