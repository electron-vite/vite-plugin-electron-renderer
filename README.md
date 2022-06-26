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

## How to work

Using Electron API in Electron-Renderer

```js
import { ipcRenderer } from 'electron'
↓
// Actually will redirect by `resolve.alias`
import { ipcRenderer } from 'vite-plugin-electron-renderer/electron-renderer.js'
```

[Using Node.js API and package in Electron-Renderer 👉](https://github.com/electron-vite/vite-plugin-electron-renderer/blob/4a2620d9ff9b3696cf55c1c5d4f2acdcf1ff806a/index.js#L37)

#### Config presets

1. Fist, the plugin will configuration something.
  *If you do not configure the following options, the plugin will modify their default values*

  * `base = './'`
  * `build.assetsDir = ''` -> *TODO: Automatic splicing `build.assetsDir`*
  * `build.emptyOutDir = false`
  * `build.cssCodeSplit = false`
  * `build.rollupOptions.output.format = 'cjs'`
  * `resolve.conditions = ['node']`
  * Always insert the `electron` module into `optimizeDeps.exclude`

2. The plugin transform Electron and Node.js built-in modules to ESModule format in `vite serve` phase.

3. Add Electron and Node.js built-in modules to Rollup `output.external` option in the `vite build` phase.
