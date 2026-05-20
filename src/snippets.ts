import { createRequire } from 'node:module'

export const PLUGIN_NAME = 'vite-plugin-electron-renderer'

const req = createRequire(import.meta.url)
const IDENTIFIER_RE = /^[$A-Z_][0-9A-Z_$]*$/i

export function cjsSnippet(moduleId: string): string {
  try {
    const required = req(moduleId)
    return cjsShimStatic(moduleId, Object.getOwnPropertyNames(required ?? {}))
  } catch {
    return cjsShimFallback(moduleId)
  }
}

/**
 * CJS shim with statically known export names.
 * Preferred because Rolldown can tree-shake static exports.
 */
function cjsShimStatic(pkg: string, exportKeys: string[]): string {
  const named = [...new Set(exportKeys)]
    .filter((key) => key !== 'default' && key !== '__esModule' && IDENTIFIER_RE.test(key))
    .map((key) => `export const ${key} = _m_[${JSON.stringify(key)}];`)
    .join('\n')

  return `// [${PLUGIN_NAME}] CJS shim - ${JSON.stringify(pkg)}
// Loaded via require() inside Electron's Node.js runtime.
const _m_ = require(${JSON.stringify(pkg)});
export default (_m_?.default ?? _m_);
${named}
`
}

/**
 * CJS shim fallback when we can't introspect the module at build time.
 */
function cjsShimFallback(pkg: string): string {
  return `// [${PLUGIN_NAME}] CJS shim (dynamic) - ${JSON.stringify(pkg)}
const _m_ = require(${JSON.stringify(pkg)});
export default (_m_?.default ?? _m_);
export * from ${JSON.stringify(pkg)};
`
}

/**
 * ESM shim for pure-ESM packages.
 *
 * Emits a `require()`-based wrapper (via `createRequire`) rather than a
 * top-level `await import()`. Electron's embedded Node (22+) supports
 * `require(esm)`, so this works for ESM packages too and keeps the loader
 * synchronous. If we can't introspect the package at build time we fall back
 * to a dynamic `export *`.
 */
export function esmSnippet(moduleId: string, root: string): string {
  let named = ''
  try {
    const required = req(moduleId)
    named = Object.getOwnPropertyNames(required ?? {})
      .filter((key) => key !== 'default' && key !== '__esModule' && IDENTIFIER_RE.test(key))
      .map((key) => `export const ${key} = _m_[${JSON.stringify(key)}];`)
      .join('\n')
  } catch {
    return `// [${PLUGIN_NAME}] ESM shim (dynamic) - ${JSON.stringify(moduleId)}
import { createRequire } from 'node:module';
const req = createRequire(${JSON.stringify(root)});
const _m_ = req(${JSON.stringify(moduleId)});
export default (_m_?.default ?? _m_);
export * from ${JSON.stringify(moduleId)};
`
  }
  return `// [${PLUGIN_NAME}] ESM shim - ${JSON.stringify(moduleId)}
import { createRequire } from 'node:module';
const req = createRequire(${JSON.stringify(root)});
const _m_ = req(${JSON.stringify(moduleId)});
export default (_m_?.default ?? _m_);
${named}
`
}

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
export const electronSnippet: string = `
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
