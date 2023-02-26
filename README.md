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

## Install

```sh
npm i vite-plugin-electron-renderer -D
```

## Examples

- [electron-forge](https://github.com/electron-vite/vite-plugin-electron-renderer/tree/main/examples/electron-forge) - use in [Electron Forge](https://www.electronforge.io/)
- [quick-start](https://github.com/electron-vite/vite-plugin-electron-renderer/tree/main/examples/quick-start)
- [worker](https://github.com/electron-vite/vite-plugin-electron-renderer/tree/main/examples/worker)

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

2. Using the Electron and Node.js API in the Renderer process.

```js
import renderer from 'vite-plugin-electron-renderer'

export default {
  plugins: [
    renderer({
      nodeIntegration: true,
    }),
  ],
}
```

```ts
// e.g. - renderer.js
import { readFile } from 'fs'
import { ipcRenderer } from 'electron'

readFile('foo.txt')
ipcRenderer.on('event-name', () => {/* something */})
```

3. When using third-party Node.js modules, keep the following points in mind.

  - Most third-party modules should be Pre-Bundling, unless it is a pure ESM module
  - Pre-Bundling replaces Vite's built-in [Pre-Bundling](https://vitejs.dev/guide/dep-pre-bundling.html#dependency-pre-bundling), which is intended for the Renderer process
  - Pre-Bundling is always a no-brainer, but it sacrifices some performance, so use it correctly
  - The C/C++ modules must be in dependencies, it cannot be built correctly by Vite

```js
import renderer from 'vite-plugin-electron-renderer'

export default {
  plugins: [
    renderer({
      // Enables use of Node.js API in the Renderer-process
      nodeIntegration: true,
      // Like Vite's pre bundling
      optimizeDeps: {
        // Only vite serve
        include: [
          'serialport',     // cjs(C++)
          'electron-store', // cjs
          'node-fetch',     // esm
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      // Only vite build
      external: [
        'serialport',
      ],
    },
  },
}
```

## API *(Define)*

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
    /**
     * Explicitly specify which modules need to be Pre-Bundling, as they need to be inserted in advance into Vite's built-in Pre-Bundling(optimizeDeps.exclude).
     */
    include?: (string | {
      name: string
      /**
       * Explicitly specify the module type
       * - `commonjs` - Only the ESM code snippet is wrapped
       * - `module` - First build the code as cjs via esbuild, then wrap the ESM code snippet
       */
      type?: 'commonjs' | 'module'
    })[]
    buildOptions?: import('esbuild').BuildOptions
  }
}
```

## How to work

###### Electron-Renderer(vite serve)

> Load Electron and Node.js cjs-packages/builtin-modules (Schematic)

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

###### Electron-Renderer(vite build)

1. Add "fs module" to `rollupOptions.external`.
2. Modify `rollupOptions.output.format` to `cjs` *(If it you didn't explicitly set it)*.

```js
import { ipcRenderer } from 'electron'
↓
const { ipcRenderer } = require('electron')
```

## Dependency Pre-Bundling

> &gt;=v0.10.2

When you run vite for the first time, you may notice this message:

```log
$ vite
Pre-bundling: serialport
Pre-bundling: electron-store
Pre-bundling: node-fetch
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
