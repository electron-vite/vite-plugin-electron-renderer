import fs from 'node:fs'
import { createRequire, builtinModules } from 'node:module'
import path from 'node:path'

import type { Alias, BuildOptions, Logger, Plugin as VitePlugin, UserConfig } from 'vite'
import { createBuilder, createLogger, normalizePath } from 'vite'

const require = createRequire(import.meta.url)
const builtins = builtinModules.filter((m) => !m.startsWith('_') && !m.startsWith('node:'))
const nodeOnlyBuiltins = builtinModules.filter((m) => !m.startsWith('_') && m.startsWith('node:'))
const electronBuiltins = [
  'electron',
  ...builtins,
  ...builtins.map((module) => `node:${module}`),
  ...nodeOnlyBuiltins,
]
const CACHE_DIR = '.vite-electron-renderer'
const TAG = '[electron-renderer]'
const logger: Logger = createLogger('info', { prefix: TAG })
const IDENTIFIER_RE = /^[$A-Z_][0-9A-Z_$]*$/i
const KEYWORDS = new Set([
  'abstract',
  'arguments',
  'as',
  'async',
  'await',
  'boolean',
  'break',
  'byte',
  'case',
  'catch',
  'char',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'double',
  'else',
  'enum',
  'eval',
  'export',
  'extends',
  'false',
  'final',
  'finally',
  'float',
  'for',
  'from',
  'function',
  'get',
  'goto',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'int',
  'interface',
  'let',
  'long',
  'native',
  'new',
  'null',
  'of',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'set',
  'short',
  'static',
  'super',
  'switch',
  'synchronized',
  'this',
  'throw',
  'throws',
  'transient',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'volatile',
  'while',
  'with',
  'yield',
])
const electronMainApis: {
  name: string
  evns: ('Main' | 'Renderer' | 'Utility')[]
  deprecated?: boolean
}[] = [
  { name: 'app', evns: ['Main'] },
  { name: 'autoUpdater', evns: ['Main'] },
  { name: 'BaseWindow', evns: ['Main'] },
  { name: 'BrowserView', evns: ['Main'], deprecated: true },
  { name: 'BrowserWindow', evns: ['Main'] },
  { name: 'clipboard', evns: ['Main', 'Renderer'] },
  { name: 'contentTracing', evns: ['Main'] },
  { name: 'crashReporter', evns: ['Main', 'Renderer'] },
  { name: 'desktopCapturer', evns: ['Main'] },
  { name: 'dialog', evns: ['Main'] },
  { name: 'globalShortcut', evns: ['Main'] },
  { name: 'inAppPurchase', evns: ['Main'] },
  { name: 'ipcMain', evns: ['Main'] },
  { name: 'Menu', evns: ['Main'] },
  { name: 'MessageChannelMain', evns: ['Main'] },
  { name: 'MessagePortMain', evns: ['Main'] },
  { name: 'nativeImage', evns: ['Main', 'Renderer'] },
  { name: 'nativeTheme', evns: ['Main'] },
  { name: 'net', evns: ['Main', 'Utility'] },
  { name: 'netLog', evns: ['Main'] },
  { name: 'Notification', evns: ['Main'] },
  { name: 'parentPort', evns: ['Utility'] },
  { name: 'powerMonitor', evns: ['Main'] },
  { name: 'powerSaveBlocker', evns: ['Main'] },
  { name: 'process', evns: ['Main', 'Renderer'] },
  { name: 'protocol', evns: ['Main'] },
  { name: 'pushNotifications', evns: ['Main'] },
  { name: 'safeStorage', evns: ['Main'] },
  { name: 'screen', evns: ['Main'] },
  { name: 'session', evns: ['Main'] },
  { name: 'ShareMenu', evns: ['Main'] },
  { name: 'shell', evns: ['Main', 'Renderer'] },
  { name: 'systemPreferences', evns: ['Main', 'Utility'] },
  { name: 'TouchBar', evns: ['Main'] },
  { name: 'Tray', evns: ['Main'] },
  { name: 'utilityProcess', evns: ['Main'] },
  { name: 'webContents', evns: ['Main'] },
  { name: 'WebContentsView', evns: ['Main'] },
  { name: 'webFrameMain', evns: ['Main'] },
  { name: 'View', evns: ['Main'] },
]

/** Electron Renderer process code snippets */
export const electron: string = `
const electron = typeof require !== 'undefined'
  // All exports module see https://www.electronjs.org -> API -> Renderer process Modules
  ? (function requireElectron() {
    const avoid_parse_require = require;
    return avoid_parse_require("electron");
  }())
  : (function nodeIntegrationWarn() {
    console.error(\`If you need to use "electron" in the Renderer process, make sure that "nodeIntegration" is enabled in the Main process.\`);
    return {
      // TODO: polyfill
    };
  }());

// Proxy in Worker
let _ipcRenderer;
if (typeof document === 'undefined') {
  _ipcRenderer = {};
  const keys = [
    'invoke',
    'postMessage',
    'send',
    'sendSync',
    'sendTo',
    'sendToHost',
    // propertype
    'addListener',
    'emit',
    'eventNames',
    'getMaxListeners',
    'listenerCount',
    'listeners',
    'off',
    'on',
    'once',
    'prependListener',
    'prependOnceListener',
    'rawListeners',
    'removeAllListeners',
    'removeListener',
    'setMaxListeners',
  ];
  for (const key of keys) {
    _ipcRenderer[key] = () => {
      throw new Error(
        'ipcRenderer doesn\\'t work in a Web Worker.\\n' +
        'You can see https://github.com/electron-vite/vite-plugin-electron/issues/69'
      );
    };
  }
} else {
  _ipcRenderer = electron.ipcRenderer;
}

export { electron as default };
export const clipboard = electron.clipboard;
export const contextBridge = electron.contextBridge;
export const crashReporter = electron.crashReporter;
export const ipcRenderer = _ipcRenderer;
export const nativeImage = electron.nativeImage;
export const shell = electron.shell;
export const webFrame = electron.webFrame;
export const deprecate = electron.deprecate;
export const webUtils = electron.webUtils;

// Electron Main process apis
// Using them in the Renderer process will got undefined, which is required by some third-party npm pkgs
${electronMainApis
  .filter(({ evns }) => evns.length === 1 && evns[0] === 'Main')
  .map(({ name }) => `export const ${name} = electron.${name};`)
  .join('\n')}
`.trim()

export interface RendererOptions {
  /**
   * Explicitly tell Vite how to load modules, which is very useful for C/C++ and `esm` modules
   *
   * - `type.cjs` just wraps esm-interop
   * - `type.esm` pre-bundle to `cjs` and wraps esm-interop
   *
   * Experimental.
   */
  resolve?: {
    [module: string]: {
      type: 'cjs' | 'esm'
      /** Full custom how to pre-bundle */
      build?: (args: {
        cjs: (module: string) => Promise<string>
        esm: (
          module: string,
          buildOptions?: NonNullable<BuildOptions['rolldownOptions']>,
        ) => Promise<string>
      }) => Promise<string>
    }
  }
}

export default function renderer(options: RendererOptions = {}): VitePlugin {
  let root: string
  let cacheDir: string
  const resolveKeys: string[] = []
  const moduleCache = new Map<string, string>()
  let builtinsReg: RegExp | null = null
  let resolveReg: RegExp | null = null
  const pendingResolve = new Map<string, NonNullable<RendererOptions['resolve']>[string]>()

  return {
    name: 'vite-plugin-electron-renderer',
    enforce: 'pre',
    async config(config, { command }) {
      resolveKeys.length = 0
      moduleCache.clear()
      pendingResolve.clear()
      builtinsReg = null
      resolveReg = null

      root = normalizePath(path.resolve(config.root ?? process.cwd()))
      cacheDir = getCacheDir(config)

      for (const [key, option] of Object.entries(options.resolve ?? {})) {
        if (command === 'build' && option.type === 'esm') {
          // A `esm` module can be build correctly during the `vite build`
          // Because the current C/C++ modules are imported through `cjs` format, so exclude `esm`
          continue // (🚧-① only `type:cjs`)
        }
        resolveKeys.push(key)
      }

      const aliases: Alias[] = []

      // Pre-populate moduleCache for all electronBuiltins
      for (const source of electronBuiltins) {
        const content = source === 'electron' ? electron : getSnippets(source)
        writeCacheModule(moduleCache, cacheDir, source, content)
      }

      // Single regex alias for all electron builtins
      builtinsReg = new RegExp(`^(${electronBuiltins.map(escapeRegExp).join('|')})$`)
      aliases.push({ find: builtinsReg, replacement: '$1' })

      // options.resolve (🚧-① only `type:cjs`)
      for (const source of resolveKeys) {
        if (moduleCache.has(source)) {
          continue
        }

        const resolved = options.resolve?.[source]
        if (!resolved) {
          continue
        }

        if (resolved.type === 'cjs') {
          // CJS is synchronous - eagerly generate snippets
          const snippets = getSnippets(source)
          logger.info(`pre-bundling ${source}`, { timestamp: true })
          writeCacheModule(moduleCache, cacheDir, source, snippets)
        } else {
          // ESM and custom build - defer until actually resolved
          pendingResolve.set(source, resolved)
        }
      }

      // Single regex alias for all resolve keys
      if (resolveKeys.length > 0) {
        resolveReg = new RegExp(`^(${resolveKeys.map(escapeRegExp).join('|')})$`)
        aliases.push({ find: resolveReg, replacement: '$1' })
      }

      // Why is the builtin modules loaded by modifying `resolve.alias` instead of using the plugin `resolveId` + `load` hooks?
      // `resolve.alias` has a very high priority in Vite! it works on Pre-Bundling, build, serve, ssr etc. anywhere
      // secondly, `resolve.alias` can work in both the Renderer process and Web Worker, but not the plugin :(
      // ① Alias priority - https://github.com/vitejs/vite/blob/v4.2.0/packages/vite/src/node/plugins/index.ts#L45
      // ② Use in dep pre-bundling
      // ③ Worker does not share plugins - https://github.com/vitejs/vite/blob/v4.2.0/packages/vite/src/node/config.ts#L253-L256
      modifyAlias(config, aliases)

      modifyOptimizeDeps(config, resolveKeys)

      adaptElectron(config)
    },
    configResolved(config) {
      root = normalizePath(path.resolve(config.root))
      cacheDir = getCacheDir(config)
    },
    async resolveId(source) {
      // Handle builtins - already in moduleCache
      if (builtinsReg?.test(source)) {
        return moduleCache.get(source) ?? null
      }
      // Handle resolve keys - may need lazy pre-bundling for esm
      if (resolveReg?.test(source)) {
        if (pendingResolve.has(source)) {
          const resolved = pendingResolve.get(source)!
          pendingResolve.delete(source)
          let snippets: string | undefined
          if (typeof resolved.build === 'function') {
            snippets = await resolved.build({
              cjs: (module) => Promise.resolve(getSnippets(module)),
              esm: (module, buildOptions) =>
                getPreBundleSnippets({
                  module,
                  outDir: cacheDir,
                  root,
                  buildOptions,
                }),
            })
          } else if (resolved.type === 'esm') {
            snippets = await getPreBundleSnippets({
              module: source,
              outDir: cacheDir,
              root,
            })
          }
          logger.info(`pre-bundling ${source}`, { timestamp: true })
          writeCacheModule(moduleCache, cacheDir, source, snippets ?? `/* ${TAG}: empty */`)
        }
        return moduleCache.get(source) ?? null
      }
      return null
    },
  }
}

function getCacheDir(config: Pick<UserConfig, 'cacheDir' | 'root'>) {
  const cacheBase = config.cacheDir ?? path.join(config.root ?? process.cwd(), 'node_modules/.vite')
  return normalizePath(path.resolve(path.dirname(cacheBase), CACHE_DIR))
}

function writeCacheModule(
  moduleCache: Map<string, string>,
  outDir: string,
  source: string,
  content: string,
): string {
  let id = moduleCache.get(source)
  if (!id) {
    id = getCacheFile(outDir, source, '.mjs').filename
    if (!fs.existsSync(id)) {
      ensureDir(path.dirname(id))
      fs.writeFileSync(id, content)
    }
    moduleCache.set(source, id)
  }
  return id
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function adaptElectron(config: UserConfig) {
  // Make sure that Electron can be loaded into the local file using `loadFile()` after package
  config.base ??= './'

  config.build ??= {}
  config.build.rolldownOptions ??= {}

  // Some third-party modules, such as `fs-extra`, it will extend the nativ fs module, maybe we need to stop it
  // Avoid not being able to set - https://github.com/rollup/plugins/blob/commonjs-v24.0.0/packages/commonjs/src/helpers.js#L55-L60
  withIgnore(config.build, electronBuiltins)
}

function withIgnore(configBuild: BuildOptions, modules: string[]) {
  configBuild.commonjsOptions ??= {}
  if (configBuild.commonjsOptions.ignore) {
    if (typeof configBuild.commonjsOptions.ignore === 'function') {
      const userIgnore = configBuild.commonjsOptions.ignore
      configBuild.commonjsOptions.ignore = (id) => {
        if (userIgnore?.(id) === true) {
          return true
        }
        return modules.includes(id)
      }
    } else {
      const ignore = configBuild.commonjsOptions.ignore as string[]
      ignore.push(...modules)
    }
  } else {
    configBuild.commonjsOptions.ignore = modules
  }
}

function modifyOptimizeDeps(config: UserConfig, exclude: string[]) {
  config.optimizeDeps ??= {}
  config.optimizeDeps.exclude ??= []
  for (const str of exclude) {
    if (!config.optimizeDeps.exclude.includes(str)) {
      // Avoid Vite secondary pre-bundle
      config.optimizeDeps.exclude.push(str)
    }
  }
}

function modifyAlias(config: UserConfig, aliases: Alias[]) {
  config.resolve ??= {}
  config.resolve.alias ??= []
  if (Object.prototype.toString.call(config.resolve.alias) === '[object Object]') {
    config.resolve.alias = Object.entries(config.resolve.alias).reduce<Alias[]>(
      (memo, [find, replacement]) => memo.concat({ find, replacement }),
      [],
    )
  }
  // Push the `aliases` to the end of `config.resolve.alias`, which means that `config.resolve.alias` has a higher priority. #82
  ;(config.resolve.alias as Alias[]).push(...aliases)
}

function getSnippets(moduleId: string, requireArg = moduleId) {
  // If a module is a CommonJs, use the `require()` load it can bring better performance,
  // especially it is a C/C++ module, this can avoid a lot of trouble

  // `avoid_parse_require` can be avoid Vite transforms parsing `require()`
  return `const avoid_parse_require = require; const _M_ = avoid_parse_require(${JSON.stringify(requireArg)});\n${getExportSnippets(
    Object.getOwnPropertyNames(/* not await import */ require(moduleId)),
  )}`
}

async function getPreBundleSnippets(options: {
  module: string
  outDir: string
  root: string
  buildOptions?: NonNullable<BuildOptions['rolldownOptions']>
}) {
  const { module, outDir, root, buildOptions } = options

  const output = getCacheFile(outDir, module, '.cjs')
  const entry = getCacheFile(outDir, module, '.entry.mjs').filename
  const wrapper = getCacheFile(outDir, module, '.mjs')

  ensureDir(path.dirname(entry))
  fs.writeFileSync(
    entry,
    [
      `import * as moduleExports from ${JSON.stringify(module)};`,
      `export default moduleExports.default ?? moduleExports;`,
      `export * from ${JSON.stringify(module)};`,
    ].join('\n'),
  )

  const builder = await createBuilder(
    {
      configFile: false,
      logLevel: 'silent',
      root,
      build: {
        copyPublicDir: false,
        emptyOutDir: false,
        lib: {
          entry,
          fileName: () => output.relativePath,
          formats: ['cjs'],
        },
        minify: false,
        outDir,
        sourcemap: 'inline',
        target: 'node14',
        rolldownOptions: mergePreBundleBuildOptions(buildOptions),
      },
    },
    true,
  )

  try {
    const environment = Object.values(builder.environments)[0]
    if (!environment) {
      throw new TypeError(`Unable to create a Vite build environment for ${JSON.stringify(module)}`)
    }

    await builder.build(environment)
  } finally {
    fs.rmSync(entry, { force: true })
  }

  const requirePath = path.posix.relative(path.posix.dirname(wrapper.filename), output.filename)

  // `require()` in script-module lookup path based on `process.cwd()` 🤔
  return getSnippets(
    output.filename,
    requirePath.startsWith('.') ? requirePath : `./${requirePath}`,
  )
}

function ensureDir(dirname: string) {
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true })
  }
}

function getCacheFile(outDir: string, moduleId: string, extension: string) {
  const root = path.resolve(outDir)
  const filename = path.resolve(root, `${moduleId}${extension}`)
  const relativePath = normalizePath(path.relative(root, filename))

  if (relativePath === '' || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new TypeError(`Invalid cache file path for ${JSON.stringify(moduleId)}`)
  }

  return { filename: normalizePath(filename), relativePath }
}

function getExportSnippets(members: string[]) {
  const seen = new Set<string>()
  const aliasedExports: string[] = []
  const exportSnippets: string[] = []
  let aliasIndex = 0

  for (const member of [...members, 'default']) {
    if (seen.has(member)) {
      continue
    }
    seen.add(member)

    const expression =
      member === 'default' ? '_M_.default || _M_' : `_M_[${JSON.stringify(member)}]`
    if (isSafeIdentifier(member)) {
      exportSnippets.push(`export const ${member} = ${expression};`)
      continue
    }

    const alias = getAliasName(member, aliasIndex++)
    exportSnippets.push(`const ${alias} = ${expression};`)
    aliasedExports.push(`${alias} as ${member}`)
  }

  if (aliasedExports.length) {
    exportSnippets.push(`export {\n  ${aliasedExports.join(',\n  ')},\n};`)
  }

  return exportSnippets.join('\n')
}

function isSafeIdentifier(name: string) {
  return name !== 'default' && IDENTIFIER_RE.test(name) && !KEYWORDS.has(name)
}

function getAliasName(name: string, index: number) {
  const normalized = name.replace(/[^$\w]/g, '_').replace(/^\d/, '_$&')
  return `__vite_plugin_electron_renderer_${normalized || 'export'}_${index}`
}

function mergePreBundleBuildOptions(
  buildOptions?: NonNullable<BuildOptions['rolldownOptions']>,
): NonNullable<BuildOptions['rolldownOptions']> {
  return {
    ...buildOptions,
    external: mergeExternalOptions(buildOptions?.external),
    output: mergeOutputOptions(buildOptions?.output),
    platform: buildOptions?.platform ?? 'node',
  }
}

function mergeExternalOptions(external: NonNullable<BuildOptions['rolldownOptions']>['external']) {
  if (!external) {
    return electronBuiltins
  }
  if (typeof external === 'function') {
    const userExternal = external as (...args: unknown[]) => boolean | null
    return (...args: unknown[]) => {
      const source = args[0]
      return (
        (typeof source === 'string' && electronBuiltins.includes(source)) || userExternal(...args)
      )
    }
  }
  return Array.isArray(external)
    ? [...electronBuiltins, ...external]
    : [...electronBuiltins, external]
}

function mergeOutputOptions(output: NonNullable<BuildOptions['rolldownOptions']>['output']) {
  const defaults = {
    codeSplitting: false,
    exports: 'named' as const,
  }

  return (
    Array.isArray(output)
      ? output.map((item) => ({ ...defaults, ...item }))
      : { ...defaults, ...output }
  ) as NonNullable<BuildOptions['rolldownOptions']>['output']
}
