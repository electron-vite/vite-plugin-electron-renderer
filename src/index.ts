import fs from 'node:fs'
import { builtinModules } from 'node:module'
import path from 'node:path'

import type { Alias, BuildOptions, Plugin as VitePlugin, UserConfig, Logger } from 'vite'
import { createLogger, normalizePath, version as viteVersion } from 'vite'

import { esmSnippet, cjsSnippet, PLUGIN_NAME, electronSnippet } from './snippets'

const ELECTRON_SUBPATHS = [
  'electron/main',
  'electron/renderer',
  'electron/common',
  'electron/utility',
]
const NODE_BUILTINS = builtinModules.filter((m) => !m.startsWith('_'))
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

function createRenderer(options: RendererOptions, isWorker: boolean): VitePlugin {
  let cacheDir: string
  let root: string
  let logger: Logger
  const moduleCache = new Map<string, string>()

  const resolveOptions = new Map<string, NonNullable<RendererOptions['resolve']>[string]>()
  for (const [key, option] of Object.entries(options.resolve ?? {})) {
    resolveOptions.set(key, option)
  }

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
    const cached = moduleCache.get(source)
    if (cached) {
      return cached
    }
    const snippets = await buildSnippet(source)
    return writeCacheModule(moduleCache, cacheDir, source, snippets)
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
          exclude: [...resolveOptions.keys(), ...ALL_BUILTINS],
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
        config.build ??= {}
        applyLegacyBuildAdjustments(config.build)
      } else if (!isWorker) {
        // Vite 8 worker sub-configs don't inherit plugins from the parent
        // (the `resolveId` hook below won't fire for Web Worker imports),
        // so re-register the plugin under `worker.plugins`. Guarded by
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

function applyLegacyBuildAdjustments(build: BuildOptions) {
  // Prevent Rollup from freezing namespace objects, so packages like
  // `fs-extra` can extend the native `fs` module without throwing
  // "Cannot add property X, object is not extensible" at runtime.
  // (Rolldown in Vite 8 doesn't accept `freeze`, so we only set this for the
  // legacy Rollup-based path.)
  const rollup = (build.rollupOptions ??= {})
  rollup.output = withFreezeFalse(rollup.output)

  // Tell `@rollup/plugin-commonjs` to leave Electron/Node builtins alone —
  // it can't reassign externals, so without this it errors on `require('fs')`.
  // See https://github.com/rollup/plugins/blob/commonjs-v24.0.0/packages/commonjs/src/helpers.js#L55-L60
  build.commonjsOptions ??= {}
  addCommonjsIgnore(build.commonjsOptions, ALL_BUILTINS)
}

function withFreezeFalse<T>(output: T): T {
  if (!output) {
    return { freeze: false } as T
  }
  if (Array.isArray(output)) {
    for (const o of output) {
      ;(o as { freeze?: boolean }).freeze ??= false
    }
  } else {
    ;(output as { freeze?: boolean }).freeze ??= false
  }
  return output
}

function addCommonjsIgnore(
  opts: NonNullable<BuildOptions['commonjsOptions']>,
  modules: string[],
): void {
  if (opts.ignore) {
    if (typeof opts.ignore === 'function') {
      const userIgnore = opts.ignore
      opts.ignore = (id) => userIgnore(id) === true || modules.includes(id)
    } else if (Array.isArray(opts.ignore)) {
      for (const m of modules) {
        if (!opts.ignore.includes(m)) {
          opts.ignore.push(m)
        }
      }
    }
  } else {
    opts.ignore = [...modules]
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
