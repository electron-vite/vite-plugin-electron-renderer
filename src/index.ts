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
const SCRIPT_EXT_RE = /\.[cm]?[jt]sx?(?:[?#].*)?$/

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
  let isBuild = false
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

  const externalModulesRegex = new RegExp(
    `^(?:${externalModules.map((s) => s.replace(RE_ESCAPE, '\\$&')).join('|')})$`,
  )
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
      isBuild = config.command === 'build'
    },
    resolveId: {
      order: 'pre',
      filter: {
        id: externalModulesRegex,
      },
      async handler(source) {
        return resolveShim(source)
      },
    },
    transform: {
      order: 'post',
      filter: {
        code: [/import/, externalModulesRegex],
        id: SCRIPT_EXT_RE,
      },
      async handler(code) {
        if (!isBuild) {
          return null
        }

        const transformed = rewriteStaticImports(
          code,
          this.parse(code) as Program,
          new Set(externalModules),
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
