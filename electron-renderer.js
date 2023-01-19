/**
 * All exports module see https://www.electronjs.org -> API -> Renderer Process Modules
 */
const electron = require("electron");

/**
 * Proxy in Worker
 * @type { import("electron").IpcRenderer | ProxyConstructor<import("electron").IpcRenderer> }
 */
let _ipcRenderer;

if (typeof WorkerGlobalScope !== "undefined" && self instanceof WorkerGlobalScope) {
  _ipcRenderer = new Proxy({}, {
    get: () => {
      throw new Error(
        'ipcRenderer doesn\'t work in a Web Worker.\n' +
        'You can see https://github.com/electron-vite/vite-plugin-electron/issues/69'
      );
    }
  })
} else {
  _ipcRenderer = electron.ipcRenderer;
}

export const clipboard = electron.clipboard;
export const contextBridge = electron.contextBridge;
export const crashReporter = electron.crashReporter;
export const ipcRenderer = _ipcRenderer;
export const nativeImage = electron.nativeImage;
export const webFrame = electron.webFrame;

// NON-SANDBOX
export const shell = electron.shell;

export default {
  clipboard,
  contextBridge,
  crashReporter,
  ipcRenderer,
  nativeImage,
  webFrame,
  shell
}