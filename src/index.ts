import fs from 'node:fs'
import { builtinModules } from 'node:module'
import path from 'node:path'

import type { Plugin as VitePlugin, UserConfig, Logger, ResolvedConfig } from 'vite'
import { build as viteBuild, createLogger, normalizePath } from 'vite'

import { esmSnippet, cjsSnippet, PLUGIN_NAME, electronSnippet } from './snippets'

export { electronSnippet as electron } from './snippets'

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
const BUNDLE_ENTRY_DIR = `${CACHE_DIR}/entries`
const BUNDLE_OUT_DIR = `${CACHE_DIR}/bundled`
const BUNDLE_CJS_OUT_DIR = `${CACHE_DIR}/bundled-cjs`
const TAG = '[electron-renderer]'
const RE_ESCAPE = /[\\^$.*+?()[\]{}|]/g
const SCRIPT_EXT_RE = /\.[cm]?[jt]sx?(?:[?#].*)?$/

type BundleFormat = 'es' | 'cjs'

export interface RendererOptions {
  /**
   * Electron 35+ is required for runtime `require(esm)`.
   * Use this compatibility option for Electron < 35 to pre-build
   * `resolve.*.type = 'esm'` deps to CJS during dev.
   */
  prebuildEsm?: boolean
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
      /**
       * Whether this dependency should be bundled in production builds.
       *
       * Defaults to `true` for `type: 'esm'`, and `false` for `type: 'cjs'`.
       */
      bundle?: boolean
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
  let resolvedConfig: ResolvedConfig
  let isBuild = false
  const moduleCache = new Map<string, string>()
  const bundledModuleCache = new Map<string, string>()
  const bundledBuildPromises = new Map<string, Promise<string>>()
  let bundledEntryDir: string
  let bundledOutDir: string
  let bundledCjsOutDir: string

  const resolveOptions = options.resolve ?? {}
  const resolveEntries = Object.entries(resolveOptions)
  const normalizedResolveOptions = new Map(
    resolveEntries.flatMap(([module, option]) => {
      const normalizedModule = module.startsWith('node:') ? module.slice(5) : module
      return normalizedModule === module
        ? [[module, option]]
        : [
            [module, option],
            [normalizedModule, option],
          ]
    }),
  )
  const bundledModuleSet = new Set(
    resolveEntries.filter(([, option]) => shouldBundleDependency(option)).map(([module]) => module),
  )
  const shimmedModules = [
    ...new Set([
      ...resolveEntries
        .filter(([, option]) => !shouldBundleDependency(option))
        .map(([module]) => module),
      ...ALL_BUILTINS,
    ]),
  ]
  const resolvedModules = [...new Set([...Object.keys(resolveOptions), ...ALL_BUILTINS])]

  function bundleDependency(source: string, format: BundleFormat = 'es'): Promise<string> {
    const cacheKey = `${format}:${source}`
    const outDir = format === 'cjs' ? bundledCjsOutDir : bundledOutDir
    const extension = format === 'cjs' ? '.cjs' : '.mjs'

    const cached = bundledModuleCache.get(cacheKey)
    if (cached) {
      return Promise.resolve(cached)
    }

    const pending = bundledBuildPromises.get(cacheKey)
    if (pending) {
      return pending
    }

    const entryFile = writeGeneratedModule(
      bundledEntryDir,
      source,
      `import * as _m_ from ${JSON.stringify(source)};
export default (_m_?.default ?? _m_);
export * from ${JSON.stringify(source)};
`,
    )

    logger.info(`Bundle resolve dep: ${source} -> ${format}`, { timestamp: true })

    const promise = viteBuild({
      configFile: false,
      root,
      publicDir: false,
      logLevel: 'error',
      cacheDir: path.join(outDir, '.vite'),
      resolve: {
        alias: resolvedConfig.resolve.alias,
        conditions: ['node', ...(resolvedConfig.resolve.conditions ?? [])],
      },
      build: {
        copyPublicDir: false,
        emptyOutDir: false,
        lib: {
          entry: {
            [path.basename(entryFile, '.mjs')]: entryFile,
          },
          formats: [format],
        },
        minify: isBuild,
        modulePreload: false,
        outDir,
        target: 'esnext',
        rolldownOptions: {
          external: shimmedModules,
          output: {
            entryFileNames: `[name]${extension}`,
            chunkFileNames: `chunks/[name]-[hash]${extension}`,
            exports: 'named',
          },
        },
      },
    })
      .then(() => {
        const bundledFile = getCacheFile(outDir, source, extension).filename
        if (!fs.existsSync(bundledFile)) {
          throw new TypeError(`Missing bundled output for ${JSON.stringify(source)}`)
        }

        bundledModuleCache.set(cacheKey, bundledFile)
        return bundledFile
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        logger.error(`Failed to bundle ${source}: ${message}`, { timestamp: true })
        throw error
      })
      .finally(() => {
        bundledBuildPromises.delete(cacheKey)
      })

    bundledBuildPromises.set(cacheKey, promise)
    return promise
  }

  async function buildSnippet(source: string): Promise<string> {
    const resolved = normalizedResolveOptions.get(source)

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
    if (!isBuild && options.prebuildEsm && resolved?.type === 'esm') {
      return cjsSnippet(await bundleDependency(source, 'cjs'))
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

  const resolvedModulesRegex = new RegExp(
    `^(?:${resolvedModules.map((s) => s.replace(RE_ESCAPE, '\\$&')).join('|')})$`,
  )
  const shimmedModulesRegex = new RegExp(
    `^(?:${shimmedModules.map((s) => s.replace(RE_ESCAPE, '\\$&')).join('|')})$`,
  )
  return {
    name: PLUGIN_NAME,
    enforce: 'pre',
    async config(config, env) {
      moduleCache.clear()
      bundledModuleCache.clear()
      bundledBuildPromises.clear()
      isBuild = env.command === 'build'

      const partial: UserConfig = {
        base: config.base ?? './',
        optimizeDeps: {
          exclude: resolvedModules,
        },
        // App builds should externalize renderer shims in Rolldown. Library
        // builds are used by Vite's pre-bundling path and still need shim
        // modules to be generated on resolve.
        build: {
          rolldownOptions: {
            external: shimmedModules,
          },
        },
      }

      if (!isWorker) {
        // Vite worker sub-configs use a separate plugin container, so
        // re-register the plugin under `worker.plugins`. Guarded by
        // `!isWorker` to avoid recursion.
        partial.worker = {
          rolldownOptions: {
            external: shimmedModules,
          },
          plugins: () => [createRenderer(options, true)],
        }
      }

      return partial
    },
    configResolved(config) {
      cacheDir = path.dirname(config.cacheDir) + CACHE_DIR
      bundledEntryDir = path.dirname(config.cacheDir) + BUNDLE_ENTRY_DIR
      bundledOutDir = path.dirname(config.cacheDir) + BUNDLE_OUT_DIR
      bundledCjsOutDir = path.dirname(config.cacheDir) + BUNDLE_CJS_OUT_DIR
      root = config.root
      resolvedConfig = config
      logger = createLogger(config.logLevel ?? 'info', { prefix: TAG })
      isBuild = config.command === 'build'
    },
    resolveId: {
      order: 'pre',
      filter: {
        id: resolvedModulesRegex,
      },
      async handler(source) {
        if (isBuild && bundledModuleSet.has(source)) {
          return bundleDependency(source)
        }
        const cacheKey = source.startsWith('node:') ? source.slice(5) : source
        const cached = moduleCache.get(cacheKey)
        if (cached) {
          return cached
        }
        const resolved = writeGeneratedModule(cacheDir, cacheKey, await buildSnippet(cacheKey))
        moduleCache.set(cacheKey, resolved)
        return resolved
      },
    },
    transform: {
      order: 'post',
      filter: {
        code: [/import/, shimmedModulesRegex],
        id: SCRIPT_EXT_RE,
      },
      async handler(code) {
        if (!isBuild) {
          return null
        }

        const transformed = rewriteStaticImports(
          code,
          this.parse(code) as Program,
          new Set(shimmedModules),
        )
        return transformed ? { code: transformed, map: null } : null
      },
    },
  }
}

type ExtractObjectHook<T> = T extends { handler: infer H } ? H : never
type Program = ReturnType<
  ThisParameterType<ExtractObjectHook<NonNullable<VitePlugin['transform']>>>['parse']
>
type ExtractImportDeclartion<T> = T extends { type: 'ImportDeclaration' } ? T : never
type ImportDeclartion = ExtractImportDeclartion<Program['body'][number]>
type ExtractImportExpression<T> = T extends { type: 'ImportExpression' } ? T : never
type ImportExpression = ExtractImportExpression<
  | Program['body'][number]
  | { type: 'ImportExpression'; start: number; end: number; source: unknown }
>
type ExtractStringLiteral<T> = T extends { type: 'Literal'; value: string } ? T : never
type StringLiteral = ExtractStringLiteral<
  ImportDeclartion['source'] | { type: 'Literal'; value: string }
>

function rewriteStaticImports(
  code: string,
  program: Program,
  externalModules: ReadonlySet<string>,
): string | null {
  const rewrites: { start: number; end: number; replacement: string }[] = []

  for (const node of program.body) {
    if (node.type === 'ExpressionStatement' && node.directive && rewrites.length === 0) {
      continue
    }
    if (node.type !== 'ImportDeclaration') {
      break
    }
    if (externalModules.has(node.source.value)) {
      rewrites.push({
        start: node.start,
        end: node.end,
        replacement: buildRequireImport(node, rewrites.length),
      })
    }
  }

  const dynamicImports = collectDynamicImportExpressions(program)
  for (const dynamicImport of dynamicImports) {
    if (!isStringLiteral(dynamicImport.source)) {
      continue
    }
    if (!externalModules.has(dynamicImport.source.value)) {
      continue
    }

    rewrites.push({
      start: dynamicImport.start,
      end: dynamicImport.end,
      replacement: `Promise.resolve().then(() => require(${JSON.stringify(dynamicImport.source.value)}))`,
    })
  }

  if (rewrites.length === 0) {
    return null
  }

  rewrites.sort((a, b) => a.start - b.start)

  let lastIndex = 0
  let output = ''

  for (const { start, end, replacement } of rewrites) {
    output += code.slice(lastIndex, start)
    output += replacement
    lastIndex = end
  }

  output += code.slice(lastIndex)
  return output
}

function shouldBundleDependency(option: NonNullable<RendererOptions['resolve']>[string]): boolean {
  return option.bundle ?? (option.type === 'esm' && typeof option.build !== 'function')
}

function collectDynamicImportExpressions(program: Program): ImportExpression[] {
  const dynamicImports: ImportExpression[] = []
  const stack: unknown[] = [program]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current || typeof current !== 'object') {
      continue
    }

    if ((current as { type?: string }).type === 'ImportExpression') {
      dynamicImports.push(current as ImportExpression)
    }

    for (const value of Object.values(current)) {
      if (!value) {
        continue
      }
      if (Array.isArray(value)) {
        for (let i = value.length - 1; i >= 0; i -= 1) {
          stack.push(value[i])
        }
        continue
      }

      if (typeof value === 'object') {
        stack.push(value)
      }
    }
  }

  return dynamicImports
}

function isStringLiteral(node: unknown): node is StringLiteral {
  return (
    !!node &&
    typeof node === 'object' &&
    (node as { type?: string }).type === 'Literal' &&
    typeof (node as { value?: unknown }).value === 'string'
  )
}

function buildRequireImport(node: ImportDeclartion, index: number): string {
  const source = JSON.stringify(node.source.value)
  if (node.specifiers.length === 0) {
    return `require(${source});`
  }

  const binding = `__electron_import_${index}__`
  const lines = [`const ${binding} = require(${source});`]

  for (const specifier of node.specifiers) {
    switch (specifier.type) {
      case 'ImportDefaultSpecifier':
        lines.push(`const ${specifier.local.name} = ${binding}?.default ?? ${binding};`)
        break
      case 'ImportNamespaceSpecifier':
        lines.push(`const ${specifier.local.name} = ${binding};`)
        break
      case 'ImportSpecifier':
        lines.push(
          // @ts-expect-error specifier.imported 's access is correct here
          `const ${specifier.local.name} = ${binding}[${JSON.stringify(specifier.imported.name ?? String(specifier.imported.value))}];`,
        )
        break
    }
  }

  return lines.join('\n')
}

function writeGeneratedModule(outDir: string, moduleId: string, content: string): string {
  const filename = getCacheFile(outDir, moduleId, '.mjs').filename
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, content)
  return filename
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
