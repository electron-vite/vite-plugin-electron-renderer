import fs from 'node:fs'
import { builtinModules } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import type { Logger, Plugin as VitePlugin, ResolvedConfig } from 'vite'
import { createBuilder, createLogger, normalizePath, perEnvironmentState } from 'vite'

import { cjsEntry, esmEntry, esmSnippet, cjsSnippet, PLUGIN_NAME, electronSnippet } from './snippets'

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
const RESOLVE_ENV_NAME = 'ssr'
const RESOLVE_ENTRY_PREFIX = 'vite_plugin_electron_renderer_resolve_entry_'
const logger: Logger = createLogger('info', { prefix: TAG })
type ResolveOption = NonNullable<RendererOptions['resolve']>[string]

export interface RendererOptions {
  /**
   * Explicitly tell Vite which modules should be lazily built for the renderer's Node.js runtime
   *
   * - `type.cjs` builds a Node-targeted entry and re-exports statically known names when possible
   * - `type.esm` builds a Node-targeted entry and re-exports the module namespace
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
  let defaultResolveState: ReturnType<typeof createResolveState> | undefined
  const resolveOptions = new Map<string, NonNullable<RendererOptions['resolve']>[string]>()
  const virtualResolveIds = new Map<string, string>()
  const getResolveState = perEnvironmentState((environment) => createResolveState(environment.config))

  return {
    name: PLUGIN_NAME,
    enforce: 'pre',
    async config(config) {
      defaultResolveState = undefined
      resolveOptions.clear()
      virtualResolveIds.clear()

      for (const [key, option] of Object.entries(options.resolve ?? {})) {
        if (option.type === 'cjs' || option.type === 'esm' || option.build) {
          resolveOptions.set(key, option)
          virtualResolveIds.set(getResolveVirtualId(key), key)
        }
      }

      const resolveKeys = [...resolveOptions.keys()]
      const clientEnvironment = {
        resolve: {
          alias: resolveKeys.map((source) => ({
            find: source,
            replacement: getResolveVirtualId(source),
          })),
          conditions: ['node'],
        },
        optimizeDeps: {
          exclude: [...resolveKeys, ...DEFAULT_EXCLUDE],
        },
      }

      return {
        base: config.base ?? './',
        environments: {
          client: clientEnvironment,
        },
        ...clientEnvironment,
      }
    },
    configResolved(config) {
      defaultResolveState = createResolveState(config)
    },
    async resolveId(source) {
      if (virtualResolveIds.has(source)) {
        return source
      }

      const state = 'environment' in this ? getResolveState(this) : defaultResolveState
      if (!state) {
        throw new TypeError('renderer resolve state is not initialized')
      }

      if (!DEFAULT_EXCLUDE.has(source) && !resolveOptions.has(source)) {
        return null
      }

      const cached = state.moduleCache.get(source)
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
      } else if (resolved) {
        logger.info(`pre-bundling ${source}`, { timestamp: true })
        return buildResolveModule(state, source, resolved)
      } else {
        snippets = cjsSnippet(source)
      }

      return writeCacheModule(state.moduleCache, state.cacheDir, source, snippets)
    },
    async load(id) {
      const source = virtualResolveIds.get(id)
      if (!source) {
        return null
      }

      const state = 'environment' in this ? getResolveState(this) : defaultResolveState
      if (!state) {
        throw new TypeError('renderer resolve state is not initialized')
      }

      const resolved = resolveOptions.get(source)
      if (!resolved) {
        return null
      }

      logger.info(`pre-bundling ${source}`, { timestamp: true })
      const filename = await buildResolveModule(state, source, resolved)
      const fileUrl = pathToFileURL(filename).href

      return `import * as _m_ from ${JSON.stringify(fileUrl)};
const _default = Reflect.get(_m_, 'default') ?? _m_;
export default _default;
export * from ${JSON.stringify(fileUrl)};
`
    },
  }

  function buildResolveModule(
    state: ReturnType<typeof getResolveState>,
    source: string,
    resolved: ResolveOption,
  ): Promise<string> {
    const pending = state.pendingBuilds.get(source)
    if (pending) {
      return pending
    }

    const buildPromise = buildCacheModule(state.moduleCache, state.cacheDir, source, async () => {
      await buildResolveEntry(state.config, state.cacheDir, source, resolved)
    })

    state.pendingBuilds.set(source, buildPromise)
    return buildPromise.finally(() => {
      state.pendingBuilds.delete(source)
    })
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

async function buildCacheModule(
  moduleCache: Map<string, string>,
  outDir: string,
  source: string,
  build: () => Promise<void>,
): Promise<string> {
  let id = moduleCache.get(source)
  if (!id) {
    id = getCacheFile(outDir, source, '.mjs').filename
    fs.mkdirSync(path.dirname(id), { recursive: true })
    await build()
    if (!fs.existsSync(id)) {
      throw new TypeError(`Failed to build cache module for ${JSON.stringify(source)}`)
    }
    moduleCache.set(source, id)
  }
  return id
}

async function buildResolveEntry(
  config: Pick<ResolvedConfig, 'clearScreen' | 'logLevel' | 'root'>,
  cacheDir: string,
  source: string,
  resolved: ResolveOption,
): Promise<void> {
  const { input, resolvedId } = getResolveEntryIds(source)
  const builder = await createBuilder({
    configFile: false,
    root: config.root,
    mode: 'production',
    logLevel: config.logLevel,
    clearScreen: config.clearScreen,
    resolve: {
      conditions: ['node'],
    },
    ssr: {
      noExternal: true,
      target: 'node',
    },
    environments: {
      [RESOLVE_ENV_NAME]: {
        consumer: 'server',
        resolve: {
          conditions: ['node'],
        },
        build: {
          ssr: true,
          write: true,
          emptyOutDir: false,
          copyPublicDir: false,
          minify: false,
          outDir: cacheDir,
          rolldownOptions: {
            input,
            platform: 'node',
            output: {
              format: 'es',
              entryFileNames: getCacheFile(cacheDir, source, '.mjs').relativePath,
            },
          },
        },
      },
    },
    plugins: [
      {
        name: `${PLUGIN_NAME}:resolve-builder`,
        resolveId(id) {
          if (id === input) {
            return resolvedId
          }
        },
        load(id) {
          if (id === resolvedId) {
            return resolved.type === 'esm' ? esmEntry(source) : cjsEntry(source)
          }
        },
      },
    ],
  })

  const environment = builder.environments[RESOLVE_ENV_NAME]
  if (!environment) {
    throw new TypeError('renderer resolve builder is missing the ssr environment')
  }

  await builder.build(environment)
}

function createResolveState(config: Pick<ResolvedConfig, 'cacheDir' | 'clearScreen' | 'logLevel' | 'root'>) {
  return {
    cacheDir: normalizePath(path.resolve(path.dirname(config.cacheDir), CACHE_DIR)),
    config: {
      clearScreen: config.clearScreen,
      logLevel: config.logLevel,
      root: config.root,
    },
    moduleCache: new Map<string, string>(),
    pendingBuilds: new Map<string, Promise<string>>(),
  }
}

function getResolveVirtualId(source: string) {
  return `${PLUGIN_NAME}:resolve:${source}`
}

function getResolveEntryIds(source: string) {
  const input = `${RESOLVE_ENTRY_PREFIX}${source.replaceAll(/[^\w$]/g, '_')}`
  return {
    input,
    resolvedId: `\0${input}`,
  }
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
