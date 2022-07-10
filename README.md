# vite-plugin-electron-renderer

Support use Node.js API in Electron-Renderer

[![NPM version](https://img.shields.io/npm/v/vite-plugin-electron-renderer.svg?style=flat)](https://npmjs.org/package/vite-plugin-electron-renderer)
[![NPM Downloads](https://img.shields.io/npm/dm/vite-plugin-electron-renderer.svg?style=flat)](https://npmjs.org/package/vite-plugin-electron-renderer)

## Install

```sh
npm i vite-plugin-electron-renderer -D
```

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

## API

`renderer(options: Options)`

```ts
export interface Options {
  /**
   * Explicitly include/exclude some CJS modules  
   * `modules` includes `dependencies` of package.json, Node.js's `builtinModules` and `electron`  
   */
  resolve?: (modules: string[]) => typeof modules | undefined
}
```

## 🚨 `dependencies` vs `devDependencies`

**The easiest way**

- Put Node.js packages in `dependencies`
- Put Web packages in `devDependencies`

In general, Vite may not correctly build Node.js packages, especially C/C++ native modules, but Vite can load them as external packages. So, put your Node.js package in `dependencies`. Unless you know how to properly build them with Vite.

By default, `vite-plugin-electron-renderer` treats packages in `dependencies`(CJS modules) as `external` modules. During development, a virtual module in ESM format is generated by `load-hook` to ensure that it can work properly. It is inserted into `rollupOptions.external` during build time. If you don't want this, you can control the behavior with `options.resolve()`. 

*通常的，Vite 可能不能正确的构建 Node.js 的包，尤其是 C/C++ 原生模块，但是 Vite 可以将它们以外部包的形式加载。所以，请将 Node.js 包放到 `dependencies` 中。除非你知道如何用 Vite 正确的构建它们。*

*默认情况下，`vite-plugin-electron-renderer` 会将 `dependencies`(CJS 模块) 中的包视为 `external` 模块。在开发期间会通过 `load-hook` 生成一个 ESM 格式的虚拟模块，以保障其能够正常工作。在构建期间会将其插入到 `rollupOptions.external` 中。如果你不希望这样，你可以通过 `options.resolve()` 来控制该行为。*

**e.g.**

<!--
###### Electron-Main

```js
import { readFile } from 'fs'
↓
const { readFile } = require('fs')
```
-->

###### Electron-Renderer(vite build)

```js
import { readFile } from 'fs'
↓
const { readFile } = require('fs')
```

###### Electron-Renderer(vite serve)

```
┏———————————————————————————————┓                                ┏—————————————————┓
│ import { readFile } from 'fs' │                                │ Vite dev server │
┗———————————————————————————————┛                                ┗—————————————————┛
               │                                                          │
               │ 1. HTTP(Request): fs module                              │
               │ ———————————————————————————————————————————————————————> │
               │                                                          │
               │                                                          │
               │ 2. Intercept in load-hook(vite-plugin-electron-renderer) │
               │ 3. Generate a virtual module(fs)                         │
               │    ↓                                                     │
               │    const _M_ = require('fs')                             │
               │    export const readFile = _M_.readFile                  │
               │                                                          │
               │                                                          │
               │ 4. HTTP(Response): fs module                             │
               │ <——————————————————————————————————————————————————————— │
               │                                                          │
┏———————————————————————————————┓                                ┏—————————————————┓
│ import { readFile } from 'fs' │                                │ Vite dev server │
┗———————————————————————————————┛                                ┗—————————————————┛
```

## 🚨 Node.js ESM packages

**e.g.** `node-fetch` `execa` `got` ...

In general, Node.js ESM packages only need to be converted if they are used in Electron-Renderer, but not in Electron-Main.

*通常的，只有在 Electron-Renderer 中使用的情况下才需要转换 Node.js ESM 模块，而在 Electron-Main 中使用则不必转换。*

1. Use [vite-plugin-esmodule](https://github.com/vite-plugin/vite-plugin-esmodule) to load ESM packages
2. It is recommended to put the ESM packages in the `devDependencies`

## How to work

The plugin is just the encapsulation of the built-in plugins of [electron-vite-boilerplate/packages/renderer/plugins](https://github.com/electron-vite/electron-vite-boilerplate/tree/main/packages/renderer/plugins)

## Config presets

If you do not configure the following options, the plugin will modify their default values

- `base = './'`
- `build.assetsDir = ''` -> *TODO: Support nested dir*
- `build.emptyOutDir = false`
- `build.cssCodeSplit = false`
- `build.rollupOptions.output.format = 'cjs'`
- `resolve.conditions = ['node']`
- `optimizeDeps.exclude = ['electron']` - always
