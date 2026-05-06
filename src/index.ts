import fs from 'node:fs'
import { builtinModules } from 'node:module'
import path from 'node:path'

import type { Logger, Plugin as VitePlugin } from 'vite'
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

const CACHE_DIR = '.vite-electron-renderer'
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
  const moduleCache = new Map<string, string>()
  const resolveOptions = new Map<string, NonNullable<RendererOptions['resolve']>[string]>()

  return {
    name: PLUGIN_NAME,
    enforce: 'pre',
    async config(config) {
      moduleCache.clear()
      resolveOptions.clear()

      for (const [key, option] of Object.entries(options.resolve ?? {})) {
        if (option.type === 'cjs' || option.type === 'esm' || option.build) {
          resolveOptions.set(key, option)
        }
      }

      const resolveKeys = [...resolveOptions.keys()]

      return {
        base: config.base ?? './',
        resolve: {
          conditions: ['node'],
        },
        optimizeDeps: {
          exclude: [...resolveKeys, ...DEFAULT_EXCLUDE],
        },
      }
    },
    configResolved(config) {
      cacheDir = normalizePath(path.resolve(path.dirname(config.cacheDir), CACHE_DIR))
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
        logger.info(`pre-bundling ${source}`, { timestamp: true })
        snippets =
          (await resolved.build({
            cjs: async (module) => cjsSnippet(module),
            esm: async (module) => esmSnippet(module),
          })) ?? `/* ${TAG}: empty */`
      } else if (resolved?.type === 'esm') {
        logger.info(`pre-bundling ${source}`, { timestamp: true })
        snippets = esmSnippet(source)
      } else {
        if (resolved) {
          logger.info(`pre-bundling ${source}`, { timestamp: true })
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
  const filename = path.resolve(root, `${moduleId.replaceAll('/', '_')}${extension}`)
  const relativePath = normalizePath(path.relative(root, filename))

  if (relativePath === '' || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new TypeError(`Invalid cache file path for ${JSON.stringify(moduleId)}`)
  }

  return { filename: normalizePath(filename), relativePath }
}
