
> Migrated 👉 [vite-plugin-electron/packages/electron-renderer](https://github.com/electron-vite/vite-plugin-electron/tree/main/packages/electron-renderer)

---

# vite-plugin-electron-renderer

Support use Node.js API in Electron-Renderer

[![NPM version](https://img.shields.io/npm/v/vite-plugin-electron-renderer.svg)](https://npmjs.org/package/vite-plugin-electron-renderer)
[![NPM Downloads](https://img.shields.io/npm/dm/vite-plugin-electron-renderer.svg)](https://npmjs.org/package/vite-plugin-electron-renderer)

English | [简体中文](https://github.com/electron-vite/vite-plugin-electron-renderer/blob/main/README.zh-CN.md)

## Install

```sh
npm i vite-plugin-electron-renderer -D
```

## Examples

- [quick-start](https://github.com/electron-vite/vite-plugin-electron-renderer/tree/main/examples/quick-start)
- [worker](https://github.com/electron-vite/vite-plugin-electron-renderer/tree/main/examples/worker)

## Usage

vite.config.ts

```js
import renderer from 'vite-plugin-electron-renderer'

export default {
  plugins: [
    renderer(/* options */),
  ],
}
```

renderer.js

```ts
import { readFile } from 'fs'
import { ipcRenderer } from 'electron'

readFile(/* something code... */)
ipcRenderer.on('event-name', () => {/* something code... */})
```

API *(Define)*

`renderer(options: RendererOptions)`

```ts
export interface RendererOptions {
  /**
   * Whether node integration is enabled. Default is `false`.
   */
  nodeIntegration?: boolean
  /**
   * If the npm-package you are using is a Node.js package, then you need to Pre Bundling it.
   * @see https://vitejs.dev/guide/dep-pre-bundling.html
   */
  optimizeDeps?: {
    include?: (string | {
      name: string
      /**
       * Explicitly specify the module type
       */
      type?: "commonjs" | "module"
    })[]
    buildOptions?: import('esbuild').BuildOptions
  }
}
```

## Worker

vite.config.ts

```js
import { worker } from 'vite-plugin-electron-renderer'

export default {
  worker: {
    plugins: [
      worker(/* options */),
    ],
  },
}
```

API *(Define)*

`renderer(options: WorkerOptions)`

```ts
export interface WorkerOptions {
  /**
   * Whether node integration is enabled in web workers. Default is `false`. More
   * about this can be found in Multithreading.
   */
  nodeIntegrationInWorker?: boolean
}
```

## How to work

> Load Electron and Node.js cjs-packages/builtin-modules (Schematic)

###### Electron-Renderer(vite serve)

```
┏————————————————————————————————————————┓                    ┏—————————————————┓
│ import { ipcRenderer } from 'electron' │                    │ Vite dev server │
┗————————————————————————————————————————┛                    ┗—————————————————┛
                   │                                                   │
                   │ 1. HTTP(Request): electron module                 │
                   │ ————————————————————————————————————————————————> │
                   │                                                   │
                   │                                                   │
                   │ 2. Intercept in load-hook(Plugin)                 │
                   │ 3. Generate a virtual ESM module(electron)        │
                   │    ↓                                              │
                   │    const { ipcRenderer } = require('electron')    │
                   │    export { ipcRenderer }                         │
                   │                                                   │
                   │                                                   │
                   │ 4. HTTP(Response): electron module                │
                   │ <———————————————————————————————————————————————— │
                   │                                                   │
┏————————————————————————————————————————┓                    ┏—————————————————┓
│ import { ipcRenderer } from 'electron' │                    │ Vite dev server │
┗————————————————————————————————————————┛                    ┗—————————————————┛
```

###### Electron-Renderer(vite build)

```js
import { ipcRenderer } from 'electron'
↓
const { ipcRenderer } = require('electron')
```

## Dependency Pre-Bundling

When you run vite for the first time, you may notice this message:

```log
$ vite
Pre-bundling: serialport
Pre-bundling: electron-store
Pre-bundling: execa
Pre-bundling: node-fetch
Pre-bundling: got
```

#### The Why

**In general**, Vite may not correctly build Node.js packages, especially Node.js C/C++ native modules, but Vite can load them as external packages.  
Unless you know how to properly build them with Vite.  
[See example](https://github.com/electron-vite/vite-plugin-electron/blob/14684ba108beec305edf4c9d8865527f6508f987/examples/nodeIntegration/vite.config.ts#L17-L26)

**By the way**. If an npm package is a pure ESM format package, and the packages it depends on are also in ESM format, then put it in `optimizeDeps.exclude` and it will work normally.  
[See an explanation of it](https://github.com/electron-vite/vite-plugin-electron/blob/14684ba108beec305edf4c9d8865527f6508f987/examples/nodeIntegration/vite.config.ts#L36-L39)

## `dependencies` vs `devDependencies`

<table>
  <thead>
    <th>Classify</th>
    <th>e.g.</th>
    <th>dependencies</th>
    <th>devDependencies</th>
  </thead>
  <tbody>
    <tr>
      <td>Node.js C/C++ native modules</td>
      <td>serialport, sqlite3</td>
      <td>✅</td>
      <td>❌</td>
    </tr>
    <tr>
      <td>Node.js CJS packages</td>
      <td>electron-store</td>
      <td>✅</td>
      <td>✅</td>
    </tr>
    <tr>
      <td>Node.js ESM packages</td>
      <td>execa, got, node-fetch</td>
      <td>✅</td>
      <td>✅ (Recommend)</td>
    </tr>
    <tr>
      <td>Web packages</td>
      <td>Vue, React</td>
      <td>✅</td>
      <td>✅ (Recommend)</td>
    </tr>
  </tbody>
</table>

#### Why is it recommended to put properly buildable packages in `devDependencies`?

Doing so will reduce the size of the packaged APP by [electron-builder](https://github.com/electron-userland/electron-builder).

## Config presets (Opinionated)

If you do not configure the following options, the plugin will modify their default values

- `base = './'`
- `build.emptyOutDir = false`
- `build.cssCodeSplit = false` (*TODO*)
- `build.rollupOptions.output.format = 'cjs'` (nodeIntegration: true)
- `resolve.conditions = ['node']`
- `optimizeDeps.exclude = ['electron']` - always
