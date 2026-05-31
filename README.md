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

> [!warning]
> `nodeIntegration` is not recommended in Electron, and this plugin is not a solution to the security issues it may cause. If you want to use this plugin, please make sure you understand the security implications of enabling `nodeIntegration` and take appropriate measures to mitigate potential risks.

In short, `vite-plugin-electron-renderer` is responsible for polyfilling Electron, Node.js built-in modules and other npm packages for the Renderer process.

## Install

```sh
npm i vite-plugin-electron-renderer -D
```

## Usage

> [!important]
> **Breaking change (v1)**:
>
> - Drop Vite < 8 support.
> - `resolve.*.type: 'esm'` now uses `createRequire()` for pure-ESM packages by default, which requires **Electron 35+ (Node 22+)**; `prebuildEsm: true` is the compatibility option for Electron < 35.
>
> See [Migrate to v1](./migrate-to-v1.md) for the full migration guide.
>
> For old behavior, use v0.14.7 instead.

1. This just modifies some of Vite's default config to make the Renderer process works.

```js
import renderer from 'vite-plugin-electron-renderer'

export default {
  plugins: [renderer()],
}
```

2. Using the third-part `C/C++`, `esm` package in the Renderer process.

```js
import renderer from 'vite-plugin-electron-renderer'

export default {
  plugins: [
    renderer({
      // Compatibility option for Electron < 35
      prebuildEsm: true,
      resolve: {
        // C/C++ modules should stay on require()
        serialport: { type: 'cjs' },
        // Pure ESM modules can be loaded through dynamic import()
        got: { type: 'esm' },
        // Pure CJS modules can opt into production bundling
        somePureCjsPackage: { type: 'cjs', bundle: true },
      },
    }),
  ],
}
```

> By default, `type: 'cjs'` modules stay on runtime `require()` and should be put into `dependencies`. `type: 'esm'` modules are bundled in production builds unless `bundle: false` is set.

## API

`renderer(options: RendererOptions)`

```ts
export interface RendererOptions {
  /**
   * Compatibility option for Electron < 35.
   * Pre-build `resolve.*.type = 'esm'` deps to CJS during dev so the shim can
   * stay on plain `require()`.
   */
  prebuildEsm?: boolean
  /**
   * Explicitly tell Vite how to load modules, which is very useful for C/C++ and `esm` modules
   *
   * - `type.cjs` loads through `require()` and exposes statically known names when possible
   * - `type.esm` loads through `createRequire()` and exposes statically known names when possible (falls back to dynamic `export *` when introspection fails)
   */
  resolve?: {
    [module: string]: {
      type: 'cjs' | 'esm'
      /**
       * Whether this dependency should be bundled in production builds.
       *
       * Defaults to `true` for `type: 'esm'`, and `false` for `type: 'cjs'`.
       */
      bundle?: boolean
      /** Full custom how to generate the shim module */
      build?: (args: {
        cjs: (module: string) => Promise<string>
        esm: (module: string) => Promise<string>
      }) => Promise<string>
    }
  }
}
```

## [Examples](https://github.com/electron-vite/vite-plugin-electron-renderer/tree/main/examples)

- [quick-start](https://github.com/electron-vite/vite-plugin-electron-renderer/tree/main/examples/quick-start)
- [electron-store](https://github.com/electron-vite/vite-plugin-electron-renderer/tree/main/examples/electron-store)

## How to work

<!-- ###### Electron-Renderer(vite serve) -->

> Load Electron and Node.js cjs-packages/built-in-modules (Schematic)

```
 ┏————————————————————————————————————————┓                 ┏—————————————————┓
 │ import { ipcRenderer } from 'electron' │                 │ Vite dev server │
 ┗————————————————————————————————————————┛                 ┗—————————————————┛
                 │                                                   │
                 │ 1. Generate electron shim on first resolve        │
                 │    node_modules/.vite-electron-renderer/electron  │
                 │                                                   │
                 │ 2. HTTP(Request): electron module                 │
                 │ ————————————————————————————————————————————————> │
                 │                                                   │
                 │ 3. resolveId() redirects to                       │
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

## Dependency Pre-Bundling

**In general**. Vite will pre-bundle all third-party modules in a Web-based usage format, but it can not adapt to Electron Renderer process especially C/C++ modules. So we must be make a little changes for this.

<!-- When a module is configured as `cjs`, it will be shimmed like the following. -->

```js
const _M_ = require('serialport')

export default _M_.default || _M_
export const SerialPort = _M_.SerialPort
// export other members ...
```

Modules configured as `esm` are bundled in production builds by default. Set `bundle: false` to keep them on the runtime shim path, where they are wrapped with `createRequire()` (Electron's embedded Node 22+ supports `require(esm)`) and re-exported with their statically introspected names. If introspection fails at build time, the shim falls back to a dynamic `export *`.

`prebuildEsm: true` is a compatibility option for Electron < 35. In that mode, the plugin reuses its internal dependency build path to pre-build configured `type: 'esm'` dependencies to CJS during dev, then serves the usual renderer shim on top of that CJS output.

## dependencies vs devDependencies

[electron-builder](https://github.com/electron-userland/electron-builder) packages `dependencies` into the final app, and vite/rolldown may also bundle `dependencies` into the renderer output. To avoid shipping the same code twice, native modules must stay in `dependencies` by default because electron-builder needs to collect their binary files. Other buildable modules should stay in `devDependencies`, otherwise they can be bundled by Vite and packaged again by electron-builder.

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
      <td>❌</td>
      <td>✅</td>
    </tr>
    <tr>
      <td>Node.js ESM packages</td>
      <td>execa, got, node-fetch</td>
      <td>❌</td>
      <td>✅</td>
    </tr>
    <tr>
      <td>Web packages</td>
      <td>Vue, React</td>
      <td>❌</td>
      <td>✅</td>
    </tr>
  </tbody>
</table>

If you manually handle the binary files and runtime dependency layout for native modules, you can also move those native modules to `devDependencies` to further reduce the packaged app size.
