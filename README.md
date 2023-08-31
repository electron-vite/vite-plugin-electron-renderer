<p align="center">
  <img width="170" src="https://github.com/electron-vite/vite-plugin-electron/blob/main/logo.svg?raw=true">
</p>
<div align="center">
  <h1>vite-plugin-electron-renderer</h1>
</div>
<p align="center">Support use Node.js API in Electron-Renderer</p>
<p align="center">
  <a href="https://npmjs.com/package/vite-plugin-electron-renderer">
    <img src="https://img.shields.io/npm/v/vite-plugin-electron-renderer.svg">
  </a>
  <a href="https://npmjs.com/package/vite-plugin-electron-renderer">
    <img src="https://img.shields.io/npm/dm/vite-plugin-electron-renderer.svg">
  </a>
  <a href="https://discord.gg/YfjFuEgVUR">
    <img src="https://img.shields.io/badge/chat-discord-blue?logo=discord">
  </a>
</p>
<p align="center">
  <strong>
    <span>English</span>
    |
    <a href="https://github.com/electron-vite/vite-plugin-electron-renderer/blob/main/README.zh-CN.md">简体中文</a>
  </strong>
</p>

<br/>

In short, `vite-plugin-electron-renderer` is responsible for polyfilling Electron, Node.js built-in modules.

## Install

```sh
npm i vite-plugin-electron-renderer -D
```

## Usage

1. This just modifies some of Vite's default config to make the Renderer process works.

```js
import renderer from 'vite-plugin-electron-renderer'

export default {
  plugins: [
    renderer(),
  ],
}
```

2. Using the third-part `C/C++`, `esm` package in the Renderer process.

```js
import renderer from 'vite-plugin-electron-renderer'

export default {
  plugins: [
    renderer({
      resolve: {
        // C/C++ modules must be pre-bundle
        serialport: { type: 'cjs' },
        // `esm` modules only if Vite does not pre-bundle them correctly
        got: { type: 'esm' },
      },
    }),
  ],
}
```

> By the way, if a module is marked as `type: 'cjs'`, the plugin just loads it in using `require()`. So it should be put into `dependencies`.

## API *(Define)*

`renderer(options: RendererOptions)`

```ts
export interface RendererOptions {
  /**
   * Explicitly tell Vite how to load modules, which is very useful for C/C++ and `esm` modules
   * 
   * - `type.cjs` just wraps esm-interop
   * - `type.esm` pre-bundle to `cjs` and wraps esm-interop
   * 
   * @experimental
   */
  resolve?: {
    [module: string]: {
      type: 'cjs' | 'esm',
      /** Full custom how to pre-bundle */
      build?: (args: {
        cjs: (module: string) => Promise<string>,
        esm: (module: string, buildOptions?: import('esbuild').BuildOptions) => Promise<string>,
      }) => Promise<string>
    }
  }
}
```

## [Examples](https://github.com/electron-vite/vite-plugin-electron-renderer/tree/main/examples)

- [quick-start](https://github.com/electron-vite/vite-plugin-electron-renderer/tree/main/examples/quick-start)

## How to work

<!-- ###### Electron-Renderer(vite serve) -->

> Load Electron and Node.js cjs-packages/built-in-modules (Schematic)

```
 ┏————————————————————————————————————————┓                 ┏—————————————————┓
 │ import { ipcRenderer } from 'electron' │                 │ Vite dev server │
 ┗————————————————————————————————————————┛                 ┗—————————————————┛
                 │                                                   │
                 │ 1. Pre-Bundling electron module into              │
                 │    node_modules/.vite-electron-renderer/electron  │
                 │                                                   │
                 │ 2. HTTP(Request): electron module                 │
                 │ ————————————————————————————————————————————————> │
                 │                                                   │
                 │ 3. Alias redirects to                             │
                 │    node_modules/.vite-electron-renderer/electron  │
                 │    ↓                                              │
                 │    const { ipcRenderer } = require('electron')    │
                 │    export { ipcRenderer }                         │
                 │                                                   │
                 │ 4. HTTP(Response): electron module                │
                 │ <———————————————————————————————————————————————— │
                 │                                                   │
 ┏————————————————————————————————————————┓                 ┏—————————————————┓
 │ import { ipcRenderer } from 'electron' │                 │ Vite dev server │
 ┗————————————————————————————————————————┛                 ┗—————————————————┛
```

<!--
###### Electron-Renderer(vite build)

1. Add "fs module" to `rollupOptions.external`.
2. Modify `rollupOptions.output.format` to `cjs` *(If it you didn't explicitly set it)*.

```js
import { ipcRenderer } from 'electron'
↓
const { ipcRenderer } = require('electron')
```
-->

## Dependency Pre-Bundling

**In general**. Vite will pre-bundle all third-party modules in a Web-based usage format, but it can not adapt to Electron Renderer process especially C/C++ modules. So we must be make a little changes for this.

<!-- When a module detected as a `cjs` module. it will be pre-bundle like the following. -->

```js
// 👉 https://github.com/electron-vite/vite-plugin-electron-renderer/blob/v0.13.0/src/optimizer.ts#L139-L142
const _M_ = require("serialport");

export default (_M_.default || _M_);
export const SerialPort = _M_.SerialPort;
// export other members ...
```

<!--
**By the way**. If an npm package is a pure ESM format package, and the packages it depends on are also in ESM format, then put it in `optimizeDeps.exclude` and it will work normally.  
[See the explanation](https://github.com/electron-vite/vite-plugin-electron-renderer/blob/v0.10.3/examples/quick-start/vite.config.ts#L33-L36)
-->

## dependencies vs devDependencies

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

<!--
## Config presets (Opinionated)

If you do not configure the following options, the plugin will modify their default values

- `build.cssCodeSplit = false` (*TODO*)
- `build.rollupOptions.output.format = 'cjs'` (nodeIntegration: true)
- `resolve.conditions = ['node']`
- `optimizeDeps.exclude = ['electron']` - always
-->
