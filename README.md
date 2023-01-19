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
import { readFile } from 'node:fs'
import { ipcRenderer } from 'electron'

readFile(/* something code... */)
ipcRenderer.on('event-name', () => {/* something code... */})
```

API *(Define)*

`renderer(options: RendererOptions)`

```ts
export interface RendererOptions {
  /**
   * @default false
   */
  nodeIntegration?: boolean
  /**
   * If the npm-package you are using is a Node.js package, then you need to Pre-Bundling it.
   * @see https://vitejs.dev/guide/dep-pre-bundling.html
   */
  optimizeDeps?: {
    include?: (string | {
      name: string
      /**
       * Explicitly specify the module type
       * - `commonjs` - Only the ESM code snippet is wrapped
       * - `module` - First build the code as cjs via esbuild, then wrap the ESM code snippet
       */
      type?: "commonjs" | "module"
    })[]
    buildOptions?: import('esbuild').BuildOptions
  }
}
```

## How to work

###### Electron-Renderer(vite serve)

> Load Electron and Node.js cjs-packages/builtin-modules (Schematic)

```
┏————————————————————————————————————┓                             ┏—————————————————┓
│ import { readFile } from 'node:fs' │                             │ Vite dev server │
┗————————————————————————————————————┛                             ┗—————————————————┛
                     │ 1. Pre-Bundling fs module into                       │
                     │    node_modules/.vite-electron-renderer/fs           │
                     │                                                      │
                     │ 2. HTTP(Request): fs module                          │
                     │ ———————————————————————————————————————————————————> │
                     │                                                      │
                     │ 3. Alias redirects to                                │
                     │    node_modules/.vite-electron-renderer/fs           │
                     │    ↓                                                 │
                     │    const { readFile } = require('node:fs')           │
                     │    export { readFile }                               │
                     │                                                      │
                     │ 4. HTTP(Response): fs module                         │
                     │ <——————————————————————————————————————————————————— │
                     │                                                      │
┏————————————————————————————————————┓                             ┏—————————————————┓
│ import { readFile } from 'node:fs' │                             │ Vite dev server │
┗————————————————————————————————————┛                             ┗—————————————————┛
```

###### Electron-Renderer(vite build)

1. Add "fs module" to `rollupOptions.external`.
2. Modify `rollupOptions.output.format` to `cjs` *(If it you didn't explicitly set it)*.

```js
import { readFile } from 'node:fs'
↓
const { readFile } = require('node:fs')
```

## Dependency Pre-Bundling

> &gt;=v0.10.2

When you run vite for the first time, you may notice this message:

```log
$ vite
Pre-bundling: sqlite3
Pre-bundling: serialport
Pre-bundling: electron-store
Pre-bundling: execa
Pre-bundling: node-fetch
Pre-bundling: got
```

#### The Why

**In general**, Vite may not correctly build Node.js packages, especially Node.js C/C++ native modules, but Vite can load them as external packages.  
Unless you know how to properly build them with Vite.  
[See example](https://github.com/electron-vite/vite-plugin-electron-renderer/blob/v0.10.3/examples/quick-start/vite.config.ts#L14-L23)

**By the way**. If an npm package is a pure ESM format package, and the packages it depends on are also in ESM format, then put it in `optimizeDeps.exclude` and it will work normally.  
[See an explanation of it](https://github.com/electron-vite/vite-plugin-electron-renderer/blob/v0.10.3/examples/quick-start/vite.config.ts#L33-L36)

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

- `build.cssCodeSplit = false` (*TODO*)
- `build.rollupOptions.output.format = 'cjs'` (nodeIntegration: true)
- `resolve.conditions = ['node']`
- `optimizeDeps.exclude = ['electron']` - always
