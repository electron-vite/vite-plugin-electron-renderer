import fs from 'node:fs'
import { createRequire, builtinModules } from 'node:module'
import path from 'node:path'

import type { Alias, BuildOptions, Plugin as VitePlugin, UserConfig } from 'vite'
import { createBuilder, normalizePath } from 'vite'

const require = createRequire(import.meta.url)
const builtins = builtinModules.filter((m) => !m.startsWith('_'))
const electronBuiltins = ['electron', ...builtins, ...builtins.map((module) => `node:${module}`)]
const CACHE_DIR = '.vite-electron-renderer'
const TAG = '[electron-renderer]'
const cwd = normalizePath(process.cwd())
const IDENTIFIER_RE = /^[$A-Z_][0-9A-Z_$]*$/i
const WINDOWS_VOLUME_RE = /^[A-Z]:/i
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
/**
 * @see https://stackoverflow.com/questions/9781218/how-to-change-node-jss-console-font-color
 * @see https://en.wikipedia.org/wiki/ANSI_escape_code#Colors
 */
const COLOURS = {
  $: (colour: number) => (str: string) => `\x1B[${colour}m${str}\x1B[0m`,
  gary: (str: string) => COLOURS.$(90)(str),
  cyan: (str: string) => COLOURS.$(36)(str),
  yellow: (str: string) => COLOURS.$(33)(str),
}
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

  return {
    name: 'vite-plugin-electron-renderer',
    config: {
      async handler(config, { command }) {
        resolveKeys.length = 0
        moduleCache.clear()
        root = normalizePath(config.root ? path.resolve(config.root) : cwd)

        cacheDir = path.posix.join(findNodeModules(root)[0] ?? cwd, CACHE_DIR)

        for (const [key, option] of Object.entries(options.resolve ?? {})) {
          if (command === 'build' && option.type === 'esm') {
            // A `esm` module can be build correctly during the `vite build`
            // Because the current C/C++ modules are imported through `cjs` format, so exclude `esm`
            continue // (🚧-① only `type:cjs`)
          }
          resolveKeys.push(key)
        }

        // builtins
        const aliases: Alias[] = [
          {
            find: new RegExp(`^(?:node:)?(${['electron', ...builtins].join('|')})$`),
            // https://github.com/rollup/plugins/blob/alias-v5.0.0/packages/alias/src/index.ts#L90
            replacement: '$1',
            async customResolver(source) {
              let id = moduleCache.get(source)
              if (!id) {
                id = `${path.posix.join(cacheDir, source)}.mjs`

                if (!fs.existsSync(id)) {
                  ensureDir(path.dirname(id))
                  fs.writeFileSync(
                    // lazy build
                    id,
                    source === 'electron'
                      ? electron
                      : getSnippets({ import: source, export: source }),
                  )
                }

                moduleCache.set(source, id)
              }
              return { id }
            },
          },
        ]

        // options.resolve (🚧-① only `type:cjs`)
        resolveKeys.length &&
          aliases.push({
            find: new RegExp(`^(${resolveKeys.join('|')})$`),
            replacement: '$1',
            async customResolver(source, importer, resolveOptions) {
              let id = moduleCache.get(source)
              if (!id) {
                const filename = `${path.posix.join(cacheDir, source)}.mjs`
                if (fs.existsSync(filename)) {
                  id = filename
                } else {
                  const resolved = options.resolve?.[source]
                  if (resolved) {
                    let snippets: string | undefined

                    if (typeof resolved.build === 'function') {
                      snippets = await resolved.build({
                        cjs: (module) =>
                          Promise.resolve(getSnippets({ import: module, export: module })),
                        esm: (module, buildOptions) =>
                          getPreBundleSnippets({
                            module,
                            outdir: cacheDir,
                            root,
                            buildOptions,
                          }),
                      })
                    } else if (resolved.type === 'cjs') {
                      snippets = getSnippets({ import: source, export: source })
                    } else if (resolved.type === 'esm') {
                      snippets = await getPreBundleSnippets({
                        module: source,
                        outdir: cacheDir,
                        root,
                      })
                    }

                    console.log(
                      COLOURS.gary(TAG),
                      COLOURS.cyan('pre-bundling'),
                      COLOURS.yellow(source),
                    )

                    ensureDir(path.dirname(filename))
                    fs.writeFileSync(filename, snippets ?? `/* ${TAG}: empty */`)
                    id = filename
                  } else {
                    id = source
                  }
                }

                moduleCache.set(source, id)
              }

              return id === source
                ? // https://github.com/rollup/plugins/blob/alias-v5.0.0/packages/alias/src/index.ts#L96-L100
                  this.resolve(
                    source,
                    importer,
                    Object.assign({ skipSelf: true }, resolveOptions),
                  ).then((resolved) => resolved || { id: source })
                : { id }
            },
          })

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
    },
  }
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

function getSnippets(module: { import: string; export: string }) {
  const exports = getExportSnippets(
    Object.getOwnPropertyNames(/* not await import */ require(module.import)),
  )

  // If a module is a CommonJs, use the `require()` load it can bring better performance,
  // especially it is a C/C++ module, this can avoid a lot of trouble

  // `avoid_parse_require` can be avoid Vite transforms parsing `require()`
  return `const avoid_parse_require = require; const _M_ = avoid_parse_require(${JSON.stringify(module.export)});\n${exports}`
}

async function getPreBundleSnippets(options: {
  module: string
  outdir: string
  root: string
  buildOptions?: NonNullable<BuildOptions['rolldownOptions']>
}) {
  const { module, outdir, root, buildOptions } = options

  const outfile = `${path.posix.join(outdir, module)}.cjs`
  const entry = `${path.posix.join(outdir, module)}.entry.mjs`

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
          fileName: () => path.posix.basename(outfile),
          formats: ['cjs'],
        },
        minify: false,
        sourcemap: 'inline',
        target: 'node14',
        write: false,
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

    const outputs = await builder.build(environment)
    writeRolldownOutput(Array.isArray(outputs) ? outputs : [outputs], outdir)
  } finally {
    fs.rmSync(entry, { force: true })
  }

  return getSnippets({
    import: outfile,
    // `require()` in script-module lookup path based on `process.cwd()` 🤔
    export: relativeify(
      path.posix.relative(path.posix.dirname(`${path.posix.join(outdir, module)}.mjs`), outfile),
    ),
  })
}

function ensureDir(dirname: string) {
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true })
  }
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
    const userExternal = external as (...args: unknown[]) => unknown
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
    exports: 'named',
  }

  return Array.isArray(output)
    ? output.map((item) => ({ ...defaults, ...item }))
    : { ...defaults, ...output }
}

function writeRolldownOutput(
  outputs: Array<{ output: Array<Record<string, unknown>> }>,
  outdir: string,
) {
  for (const output of outputs) {
    for (const chunk of output.output) {
      const filename = path.posix.join(outdir, chunk.fileName as string)
      ensureDir(path.dirname(filename))
      if (chunk.type === 'asset') {
        const source = chunk.source
        fs.writeFileSync(
          filename,
          typeof source === 'string' || source instanceof Uint8Array
            ? source
            : String(source ?? ''),
        )
      } else {
        fs.writeFileSync(filename, String(chunk.code ?? ''))
      }
    }
  }
}

function relativeify(relativePath: string) {
  if (relativePath === '') {
    return '.'
  }
  if (!/^\.{1,2}[/\\]/.test(relativePath)) {
    return `./${relativePath}`
  }
  return relativePath
}

function findNodeModules(root: string) {
  const paths: string[] = []
  let currentRoot = normalizePath(root)

  while (currentRoot && (currentRoot.startsWith('/') || WINDOWS_VOLUME_RE.test(currentRoot))) {
    const candidate = path.posix.join(currentRoot, 'node_modules')
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      paths.push(candidate)
    }

    if (currentRoot === '/' || /^[A-Z]:$/i.test(currentRoot)) {
      break
    }
    currentRoot = path.posix.dirname(currentRoot)
  }

  return paths
}
