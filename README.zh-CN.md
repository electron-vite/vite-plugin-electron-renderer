<p align="center">
  <img width="170" src="https://github.com/electron-vite/vite-plugin-electron/blob/main/logo.svg?raw=true">
</p>
<div align="center">
  <h1>vite-plugin-electron-renderer</h1>
</div>
<p align="center">支持在 Electron Renderer 中使用 Node.js API</p>
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
    <a href="https://github.com/electron-vite/vite-plugin-electron-renderer/blob/main/README.md">English</a>
    |
    <span>简体中文</span>
  </strong>
</p>

<br/>

## 安装

```sh
npm i vite-plugin-electron-renderer -D
```

## 用法

> [!warning]
> 在 Electron 中不推荐使用 `nodeIntegration`，而且这个插件并不能解决它可能带来的安全问题。如果你要使用这个插件，请先明确启用 `nodeIntegration` 的安全影响，并采取相应的缓解措施。

简而言之，`vite-plugin-electron-renderer` 的职责是为渲染进程填充 Electron、Node.js 内置模块以及其他 npm 包。

> [!important]
> 这个插件目前处于 v1 beta 开发阶段。请自行承担使用风险。
>
> **Breaking change (v1)**:
>
> - 已移除 Vite < 8 支持。
> - `resolve.*.type: 'esm'` 现在会使用 `createRequire()` 包装纯 ESM 包，而不再通过 esbuild 预构建成 CJS。这要求 Electron 内置的 Node 支持 `require(esm)`，推荐使用 **Electron 35+（Node 22+）**；在 Electron 30–34 上需要 `--experimental-require-module` 标志。包含顶层 `await` 的包不受支持。
>
> 旧行为请使用 v0.14.7。

1. 这只会修改 Vite 的部分默认配置，让 Renderer 进程可以正常工作。

```js
import renderer from 'vite-plugin-electron-renderer'

export default {
  plugins: [renderer()],
}
```

1. 在 Renderer 进程中使用第三方 `C/C++`、`esm` 包。

```js
import renderer from 'vite-plugin-electron-renderer'

export default {
  plugins: [
    renderer({
      resolve: {
        // C/C++ 模块应保持通过 require() 加载
        serialport: { type: 'cjs' },
        // 纯 ESM 模块可以通过动态 import() 加载
        got: { type: 'esm' },
      },
    }),
  ],
}
```

> 顺带一提，如果某个模块被标记为 `type: 'cjs'`，插件只是用 `require()` 加载它，所以它应该放在 `dependencies` 里。

## API _(定义)_

`renderer(options: RendererOptions)`

```ts
export interface RendererOptions {
  /**
   * 明确告诉 Vite 如何加载模块，这对 C/C++ 和 `esm` 模块非常有用
   *
   * - `type.cjs` 通过 `require()` 加载，并在可能时暴露静态已知的命名导出
   * - `type.esm` 通过 `createRequire()` 加载，并在可能时暴露静态已知的命名导出（如果推断失败，则回退到动态 `export *`）
   *
   * @experimental
   */
  resolve?: {
    [module: string]: {
      type: 'cjs' | 'esm'
      /** 完全自定义如何生成 shim 模块 */
      build?: (args: {
        cjs: (module: string) => Promise<string>
        esm: (module: string) => Promise<string>
      }) => Promise<string>
    }
  }
}
```

## [示例](https://github.com/electron-vite/vite-plugin-electron-renderer/tree/main/examples)

- [quick-start](https://github.com/electron-vite/vite-plugin-electron-renderer/tree/main/examples/quick-start)

## 工作原理

> 加载 Electron 和 Node.js CJS 包/内置模块（示意图）

```
 ┏————————————————————————————————————————┓                 ┏—————————————————┓
 │ import { ipcRenderer } from 'electron' │                 │ Vite dev server │
 ┗————————————————————————————————————————┛                 ┗—————————————————┛
                 │                                                   │
                 │ 1. 首次解析时生成 electron shim                  │
                 │    node_modules/.vite-electron-renderer/electron  │
                 │                                                   │
                 │ 2. HTTP（请求）：electron 模块                   │
                 │ ————————————————————————————————————————————————> │
                 │                                                   │
                 │ 3. resolveId() 重定向到                          │
                 │    node_modules/.vite-electron-renderer/electron  │
                 │    ↓                                              │
                 │    const { ipcRenderer } = require('electron')    │
                 │    export { ipcRenderer }                         │
                 │                                                   │
                 │ 4. HTTP（响应）：electron 模块                   │
                 │ <———————————————————————————————————————————————— │
                 │                                                   │
 ┏————————————————————————————————————————┓                 ┏—————————————————┓
 │ import { ipcRenderer } from 'electron' │                 │ Vite dev server │
 ┗————————————————————————————————————————┛                 ┗—————————————————┛
```

<!--
###### Electron-Renderer(vite build)

1. 将 "fs module" 插入到 `rolldownOptions.external`。
2. 如果你没有显式设置它，将 `rolldownOptions.output.format` 修改为 `cjs`。

```js
import { ipcRenderer } from 'electron'
↓
const { ipcRenderer } = require('electron')
```
-->

## 依赖预构建

**通常来说**。Vite 会以 Web 的使用格式预构建所有第三方模块，但它无法很好地适配 Electron Renderer 进程，尤其是 C/C++ 模块。所以这里需要做一些处理。

```js
const _M_ = require('serialport')

export default _M_.default || _M_
export const SerialPort = _M_.SerialPort
// 其他导出 ...
```

配置为 `esm` 的模块会通过 `createRequire()` 包装（Electron 内置的 Node 22+ 支持 `require(esm)`），并按构建时静态推断到的名称重新导出。如果推断失败，shim 会回退为动态的 `export *`。

## dependencies 与 devDependencies

<table>
  <thead>
    <th>分类</th>
    <th>🌰</th>
    <th>dependencies</th>
    <th>devDependencies</th>
  </thead>
  <tbody>
    <tr>
      <td>Node.js C/C++ 原生模块</td>
      <td>serialport, sqlite3</td>
      <td>✅</td>
      <td>❌</td>
    </tr>
    <tr>
      <td>Node.js CJS 包</td>
      <td>electron-store</td>
      <td>✅</td>
      <td>✅</td>
    </tr>
    <tr>
      <td>Node.js ESM 包</td>
      <td>execa, got, node-fetch</td>
      <td>✅</td>
      <td>✅ (推荐)</td>
    </tr>
    <tr>
      <td>Web 包</td>
      <td>Vue, React</td>
      <td>✅</td>
      <td>✅ (推荐)</td>
    </tr>
  </tbody>
</table>

#### 为啥推荐将可以正确构建的包放到 `devDependencies` 中？

这样做会减小 [electron-builder](https://github.com/electron-userland/electron-builder) 打包后的应用体积。
