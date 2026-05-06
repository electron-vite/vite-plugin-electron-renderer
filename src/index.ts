import fs from 'node:fs'
import { builtinModules } from 'node:module'
import path from 'node:path'

import type { Logger, Plugin as VitePlugin } from 'vite'
import { createLogger, normalizePath } from 'vite'

import { esmSnippet, cjsSnippet, PLUGIN_NAME } from './snippets'

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

const electronMainApis: {
  name: string
  envs: ('Main' | 'Renderer' | 'Utility')[]
  deprecated?: boolean
}[] = [
  { name: 'app', envs: ['Main'] },
  { name: 'autoUpdater', envs: ['Main'] },
  { name: 'BaseWindow', envs: ['Main'] },
  { name: 'BrowserView', envs: ['Main'], deprecated: true },
  { name: 'BrowserWindow', envs: ['Main'] },
  { name: 'clipboard', envs: ['Main', 'Renderer'] },
  { name: 'contentTracing', envs: ['Main'] },
  { name: 'crashReporter', envs: ['Main', 'Renderer'] },
  { name: 'desktopCapturer', envs: ['Main'] },
  { name: 'dialog', envs: ['Main'] },
  { name: 'globalShortcut', envs: ['Main'] },
  { name: 'inAppPurchase', envs: ['Main'] },
  { name: 'ipcMain', envs: ['Main'] },
  { name: 'Menu', envs: ['Main'] },
  { name: 'MessageChannelMain', envs: ['Main'] },
  { name: 'MessagePortMain', envs: ['Main'] },
  { name: 'nativeImage', envs: ['Main', 'Renderer'] },
  { name: 'nativeTheme', envs: ['Main'] },
  { name: 'net', envs: ['Main', 'Utility'] },
  { name: 'netLog', envs: ['Main'] },
  { name: 'Notification', envs: ['Main'] },
  { name: 'parentPort', envs: ['Utility'] },
  { name: 'powerMonitor', envs: ['Main'] },
  { name: 'powerSaveBlocker', envs: ['Main'] },
  { name: 'process', envs: ['Main', 'Renderer'] },
  { name: 'protocol', envs: ['Main'] },
  { name: 'pushNotifications', envs: ['Main'] },
  { name: 'safeStorage', envs: ['Main'] },
  { name: 'screen', envs: ['Main'] },
  { name: 'session', envs: ['Main'] },
  { name: 'ShareMenu', envs: ['Main'] },
  { name: 'shell', envs: ['Main', 'Renderer'] },
  { name: 'systemPreferences', envs: ['Main', 'Utility'] },
  { name: 'TouchBar', envs: ['Main'] },
  { name: 'Tray', envs: ['Main'] },
  { name: 'utilityProcess', envs: ['Main'] },
  { name: 'webContents', envs: ['Main'] },
  { name: 'WebContentsView', envs: ['Main'] },
  { name: 'webFrameMain', envs: ['Main'] },
  { name: 'View', envs: ['Main'] },
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
    // prototype
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
  .filter(({ envs }) => envs.length === 1 && envs[0] === 'Main')
  .map(({ name }) => `export const ${name} = electron.${name};`)
  .join('\n')}
`.trim()

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
        if (option.type === 'cjs' || option.build) {
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
        snippets = electron
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
