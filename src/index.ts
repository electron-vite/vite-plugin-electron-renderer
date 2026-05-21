import fs from 'node:fs'
import { builtinModules } from 'node:module'
import path from 'node:path'

import type { Alias, Plugin as VitePlugin, UserConfig, Logger } from 'vite'
import { createLogger, normalizePath, version as viteVersion } from 'vite'

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
// Used only on Vite < 8: top-level builtins with optional `node:` prefix
const ALIAS_TOPLEVEL_RE = new RegExp(`^(?:node:)?(${['electron', ...NODE_BUILTINS].join('|')})$`)
// Used only on Vite < 8: Electron subpaths
const ALIAS_SUBPATH_RE = new RegExp(
  `^(${ELECTRON_SUBPATHS.map((s) => s.replaceAll('/', '\\/')).join('|')})$`,
)
const REG_ESCAPE = /[.*+?^${}()|[\]\\]/g

// Vite 8 shares plugins with Web Worker sub-configs, so the `resolveId` hook
// is enough. Vite < 8 workers inherit `resolve.alias` but NOT plugins, so we
// fall back to alias + `customResolver` for those versions.
const IS_LEGACY_VITE = Number.parseInt(viteVersion) < 8

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

type RolldownExternal = NonNullable<
  NonNullable<NonNullable<UserConfig['build']>['rolldownOptions']>['external']
>

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
      }

      if (IS_LEGACY_VITE) {
        // Worker sub-configs inherit `resolve.alias` but not plugins, so
        // register builtins via `customResolver` for Vite < 8 only.
        const aliasResolver = (async (source: string) => ({
          id: await resolveShim(source),
        })) as unknown as Alias['customResolver']
        const aliases: Alias[] = [
          {
            find: ALIAS_TOPLEVEL_RE,
            replacement: '$1',
            customResolver: aliasResolver,
          },
          {
            find: ALIAS_SUBPATH_RE,
            replacement: '$1',
            customResolver: aliasResolver,
          },
        ]
        if (resolveOptions.size > 0) {
          const keys = [...resolveOptions.keys()].map((s) => s.replace(REG_ESCAPE, '\\$&'))
          aliases.push({
            find: new RegExp(`^(${keys.join('|')})$`),
            replacement: '$1',
            customResolver: aliasResolver,
          })
        }
        partial.resolve!.alias = aliases

        // Rollup-only options: freeze namespace objects (so fs-extra etc.
        // can extend `fs`) and tell `@rollup/plugin-commonjs` to skip our
        // builtins. Rolldown handles both natively in Vite 8.
        partial.build = {
          commonjsOptions: {
            ignore: ALL_BUILTINS,
          },
          rollupOptions: {
            output: toArray(config.build?.rollupOptions?.output).map((opt) =>
              Object.assign({}, opt, { freeze: false }),
            ),
          },
        }
      } else {
        // App builds should externalize renderer shims in Rolldown. Library
        // builds are used by Vite's pre-bundling path and still need shim
        // modules to be generated on resolve.
        partial.build = {
          rolldownOptions: {
            external: mergeExternalOptions(
              config.build?.rolldownOptions?.external,
              externalModules,
            ),
          },
        }
        if (!isWorker) {
          // Vite 8 worker sub-configs don't inherit plugins from the parent
          // (the `resolveId` hook below won't fire for Web Worker imports),
          // so re-register the plugin under `worker.plugins`. Guarded by
          // `!isWorker` to avoid recursion.
          partial.worker = {
            plugins: () => [createRenderer(options, true)],
          }
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
      if (IS_LEGACY_VITE) {
        return
      }

      // Rolldown externalizes these ids before `resolveId` runs, so build-time
      // cache modules must be materialized eagerly.
      await Promise.all(buildModules.map((source) => resolveShim(source)))
    },
    async resolveId(source) {
      if (IS_LEGACY_VITE) {
        // Handled by `resolve.alias` customResolver above
        return null
      }
      if (!SHIMMED.has(source) && !resolveOptions.has(source)) {
        return null
      }
      return resolveShim(source)
    },
  }
}

function toArray<T>(item: T | T[] | undefined): T[] {
  return Array.isArray(item) ? item : item ? [item] : []
}

function mergeExternalOptions(
  existing: RolldownExternal | undefined,
  additions: string[],
): RolldownExternal {
  if (!existing) {
    return [...additions]
  }

  if (typeof existing === 'function') {
    const additionSet = new Set(additions)
    return ((source: string, importer: string | undefined, isResolved: boolean) => {
      return existing(source, importer, isResolved) || additionSet.has(source)
    }) as RolldownExternal
  }

  return [...new Set([...toArray(existing), ...additions])]
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
