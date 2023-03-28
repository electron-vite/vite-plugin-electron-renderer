const fs = require('fs');
const path = require('path');
const { builtinModules } = require('module');
const libEsm = require('lib-esm');

const builtins = builtinModules.filter(m => !m.startsWith('_'));
const builtins_dir = path.join(__dirname, 'builtins');
const electron = `
const electron = typeof require !== 'undefined'
  // All exports module see https://www.electronjs.org -> API -> Renderer Process Modules
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
`.trim();

function generateBuiltins() {
  // Node.js
  for (const module of builtins) {
    const filename = path.join(builtins_dir, module) + '.mjs';
    const dirname = path.dirname(filename);
    !fs.existsSync(dirname) && fs.mkdirSync(dirname, { recursive: true });

    const { exports } = libEsm({ exports: Object.keys(require(module)) });
    // TODO: better implements
    fs.writeFileSync(filename, `const avoid_parse_require = require; const _M_ = avoid_parse_require("${module}");\n${exports}`);
  }

  // Electron
  fs.writeFileSync(path.join(builtins_dir, 'electron.mjs'), electron);

  console.log('[vite-plugin-electron-renderer] built-in module generation successful.\n');
}

// bootstrap
fs.rmSync(builtins_dir, { recursive: true, force: true });
generateBuiltins();
