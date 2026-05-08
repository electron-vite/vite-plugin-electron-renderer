# vite-plugin-electron-renderer

> [!warning]
> 在 Electron 中不推荐使用 `nodeIntegration`，而且这个插件并不能解决它可能带来的安全问题。如果你要使用这个插件，请先明确启用 `nodeIntegration` 的安全影响，并采取相应的缓解措施。

简而言之，`vite-plugin-electron-renderer` 职责是为渲染进程填充 Electron、Node.js 内置模块以及其他 npm 包。

> [!important]
>
> 这个包目前处于 v1 beta 开发阶段。使用需自担风险。
>
> 这个插件与 Vite Environment API 不兼容，因此和新的 `vite-plugin-electron/multi-env` 一起运行时可能会出问题。请改用 `vite-plugin-electron`。

[English](https://github.com/electron-vite/vite-plugin-electron-renderer#readme) | 简体中文

## 原理

> 加载 Electron、Node.js CJS 包/内置模块/electron (示意图)

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

1. 将 "fs module" 插入到 `rolldownOptions.external`.
2. 修改 `rolldownOptions.output.format` 为 `cjs` *(如果你没有显式的设置它)*.

```js
import { ipcRenderer } from 'electron'
↓
const { ipcRenderer } = require('electron')
```
-->

<!--
## Dependency Pre-Bundling

**通常的**，Vite 会将第三方模块以 Web 的使用格式预构建，但它不适用 Electron 渲染进程，特别是 C/C++ 模块。所以我们必须为此做一点改变。
当一个模块被标记为 `cjs` 时，插件会生成下面这种 shim。

```js
const lib = require("cjs-module");

export const member = lib.member;
export default (lib.default || lib);
```

[看看源码](https://github.com/electron-vite/vite-plugin-electron-renderer/blob/v0.13.0/src/optimizer.ts#L139-L142)


当一个模块被标记为 `esm` 时，插件会生成 `await import()` 的 shim，并直接透传 ESM 导出。

**顺带说一句**. 如果一个 npm 包是个一纯 ESM 格式包，并且它自身的依赖也是 ESM 格式包，那么直接包名放到 `optimizeDeps.exclude` 中即可正常使用。
[这里解释了它](https://github.com/electron-vite/vite-plugin-electron/blob/14684ba108beec305edf4c9d8865527f6508f987/examples/nodeIntegration/vite.config.ts#L36-L39)
-->

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
