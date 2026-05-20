import fs from 'node:fs'
import { builtinModules } from 'node:module'
import path from 'node:path'

import type { Logger, Plugin as VitePlugin, UserConfig } from 'vite'
import { createLogger, normalizePath } from 'vite'

import { esmSnippet, cjsSnippet, PLUGIN_NAME, electronSnippet } from './snippets'

const DEFAULT_EXCLUDE = new Set([
  'electron',
  'electron/main',
  'electron/renderer',
  'electron/common',
  'electron/utility',
  ...builtinModules,
  ...builtinModules
    .filter((m) => !m.startsWith('_') && !m.startsWith('node:'))
    .map((module) => `node:${module}`),
])

const CACHE_DIR = '/.vite-electron-renderer'
const TAG = '[electron-renderer]'
const logger: Logger = createLogger('info', { prefix: TAG })

export interface RendererOptions {
  /**
   * Explicitly tell Vite how to load modules, which is very useful for C/C++ and `esm` modules
   *
   * - `type.cjs` loads through `require()` and exposes statically known names when possible
   * - `type.esm` loads through top-level `await import()`
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
  let cacheDir: string
  let root: string
  const moduleCache = new Map<string, string>()

  const resolveOptions = new Map<string, NonNullable<RendererOptions['resolve']>[string]>()
  for (const [key, option] of Object.entries(options.resolve ?? {})) {
    resolveOptions.set(key, option)
  }
  const optimizeDeps: UserConfig['optimizeDeps'] = {
    exclude: [...resolveOptions.keys(), ...DEFAULT_EXCLUDE],
  }

  return {
    name: PLUGIN_NAME,
    enforce: 'pre',
    async config(config) {
      moduleCache.clear()

      return {
        base: config.base ?? './',
        resolve: {
          conditions: ['node'],
        },
        optimizeDeps,
      }
    },
    configResolved(config) {
      cacheDir = path.dirname(config.cacheDir) + CACHE_DIR
      root = config.root
    },
    async resolveId(source) {
      if (!DEFAULT_EXCLUDE.has(source) && !resolveOptions.has(source)) {
        return null
      }

      const cached = moduleCache.get(source)
      if (cached) {
        return cached
      }

      const resolved = resolveOptions.get(source)
      let snippets: string

      if (source === 'electron') {
        snippets = electronSnippet
      } else if (typeof resolved?.build === 'function') {
        logger.info(`Custom build for ${source}`, { timestamp: true })
        snippets =
          (await resolved.build({
            cjs: async (module) => cjsSnippet(module),
            esm: async (module) => esmSnippet(module, root),
          })) ?? `/* ${TAG}: empty */`
      } else if (resolved?.type === 'esm') {
        logger.info(`Wrap for ESM dep: ${source}`, { timestamp: true })
        snippets = esmSnippet(source, root)
      } else {
        if (resolved) {
          logger.info(`Wrap for CJS dep: ${source}`, { timestamp: true })
        }
        snippets = cjsSnippet(source)
      }

      return writeCacheModule(moduleCache, cacheDir, source, snippets)
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
  // Also drop `:` (invalid on Windows) so `node:fs` becomes `node+fs`.
  const safe = moduleId.replaceAll('/', '+').replaceAll(':', '+')
  const filename = path.resolve(root, `${safe}${extension}`)
  const relativePath = normalizePath(path.relative(root, filename))

  if (relativePath === '' || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new TypeError(`Invalid cache file path for ${JSON.stringify(moduleId)}`)
  }

  return { filename: normalizePath(filename), relativePath }
}
