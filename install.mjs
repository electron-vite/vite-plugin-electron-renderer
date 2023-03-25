import fs from 'node:fs'
import path from 'node:path'
import { builtinModules } from 'node:module'
import { fileURLToPath } from 'node:url'
import libEsm from 'lib-esm'

var __dirname = path.dirname(fileURLToPath(import.meta.url))

export const builtins = builtinModules.filter(m => !m.startsWith('_'))
export const builtins_dir = path.join(__dirname, 'builtins')
export const electron = `
const electron = typeof require !== 'undefined'
  // All exports module see https://www.electronjs.org -> API -> Renderer Process Modules
  ? require("electron")
  : (function nodeIntegrationWarn() {
    console.error(\`If you need to use "electron" in the Renderer process, make sure that "nodeIntegration" is enabled in the Main process.\`);
    return {
      // TODO: polyfill
    };
  }()); Object.defineProperty(electron, '__esModule', { value: true });

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
`.trim()

export async function generateBuiltins() {
  fs.rmSync(builtins_dir, { recursive: true, force: true })

  // Node.js
  for (const module of builtins) {
    const filename = path.join(builtins_dir, module) + '.js'
    const dirname = path.dirname(filename)
    !fs.existsSync(dirname) && fs.mkdirSync(dirname, { recursive: true })

    // [2023-03-09] `import('trace_events')` in vitest@0.28.3 causes an error
    // Error: Trace events are unavailable
    //  ❯ node:trace_events:25:9

    const { exports } = libEsm({ exports: Object.keys(await import(module)) })
    fs.writeFileSync(filename, `const _M_ = require("${module}");\n${exports}`)
  }

  // Electron
  fs.writeFileSync(path.join(builtins_dir, 'electron.js'), electron)

  console.log('[vite-plugin-electron-renderer] built-in module generation successful.\n')
}

generateBuiltins()
