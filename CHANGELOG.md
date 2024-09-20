## 0.14.6 (2024-09-20)

- d96d581 chore: bump deps
- 40f7100 Merge branch 'bugfix/fix-electron-store' into v0.14.6
- 8cb42af chore: add .npmrc
- 2ba1a84 feat: export all Electron Apis for third-party npm pkgs
- d415315 fix issue
- d5cd80b chore: add comments for #82
- 6cf7c42 docs: update
- 47a7ea7 chore: bump vite

## 0.14.5 (2023-05-23)

- 46def0c fix: bump `lib-esm` to 0.4.1 for #73

## 0.14.4 (2023-05-21)

- fe221ec fix: move `lib-esm` to devDependencies | closes [electron-vite-react#149](https://github.com/electron-vite/electron-vite-react/issues/149)

## 0.14.3 (2023-05-20)

- 6901413 chore: bump deps
- 7a601aa test: v0.14.3
- f7c4b46 chore: cleanup
- caf1172 docs: explain where put `type: 'cjs'` module
- 30b5bd8 fix: compatible Windows path

## 0.14.2 (2023-05-05)

- 6930c08 v0.14.2
- d99bec7 feat(build): target `node14`
- af15ae0 fix: correct lookup path for `require()` #63 | closes [#63](https://github.com/electron-vite/vite-plugin-electron-renderer/issues/63)
- 69a6a0b chore: cleanup
- ef1f57e docs: update
- dd3e052 chore: cleanup

## 0.14.1 (2023-04-15)

- ffef5f2 chore: bump vite-plugin-utils to 0.4.1
- 7d8471e chore: add comments
- 4d50e2f fix: better `.cjs` file import path #60
- 274cf00 chore(v0.14.1): cleanup

## 0.14.0 (2023-04-13)

#### Break!

```diff
export interface RendererOptions {
  resolve?: {
-   [id: string]: (() => string | { platform: 'browser' | 'node' } | Promise<string | { platform: 'browser' | 'node' }>)
+   [module: string]: {
+     type: 'cjs' | 'esm',
+     build?: (args: {
+       cjs: (module: string) => Promise<string>,
+       esm: (module: string, buildOptions?: import('esbuild').BuildOptions) => Promise<string>,
+     }) => Promise<string>
+   }
  }
}
```

#### Main Changed

1. on-demand pre-bundle builtin, third-part C/C++, `esm` modules
2. support full custom pre-bundle

- 98c4d27 docs: v0.14.0
- af6bb2b chore(examples): update quick-start
- 110c854 chore: better build script
- cd1b5bb chore: remove `.npmrc`
- b8038f5 refactor(v0.14.0): better `options.resolve`
- 7c5afae refactor(v0.14.0): on-demand pre-bundle

## 0.13.14 (2023-03-31)

- c68d26a fix: move cjs config to cjs-shim.ts #107 | [electron-vite-vue/issues/107](https://github.com/electron-vite/electron-vite-vue/issues/107)

## 0.13.13 (2023-03-29)

- 8c044c9 fix: `require` instead `await import`

## 0.13.12 (2023-03-28)

- 7f6b3a4 fix: correctly path
- a7b1132 docs: update
- 6604d99 chore: `install.mjs` -> `install.js`
- 2f70a9b refactor: separate cjs-shim.ts
- 45fef6b refactor: cleanup, separate cjs-shim.ts

#### Main Changed

If you build in `cjs` format, you need to import the corresponding shim plugin

```js
import cjsShim from 'vite-plugin-electron-renderer/dist/cjs-shim.mjs'

export default {
  build: {
    rollupOptions: {
      output: {
        format: 'cjs',
      },
    },
  },
  plugins: [
    cjsShim(),
  ],
}
```

## 0.13.11 (2023-03-27)

- b0312e9 fix: use `__cjs_require` avoid esbuild parse `require`
- dde27b7 fix: remove esbuild plugin #46

## 0.13.10 (2023-03-26)

- 8d2d914 fix: use `__cjs_require` avoid esbuild parse

## 0.13.9 (2023-03-26)

- 6ff0897 fix: use bare-path instead absolute-path

## 0.13.8 (2023-03-26)

- 9490072 docs: v0.13.8
- d74bbd5 chore: `.js` -> `.mjs`
- 1b75b57 refactor!: retain only the C/C++ module API 🔥

#### Break!

`0.13.8` is very compact, keeping only the API for handling `C/C++` modules.


`renderer(options: RendererOptions)`

```ts
export interface RendererOptions {
  /**
   * Explicitly tell Vite how to load modules, which is very useful for C/C++ modules.  
   * Most of the time, you don't need to use it when a module is a C/C++ module, you can load them by return `{ platform: 'node' }`.  
   * 
   * If you know exactly how Vite works, you can customize the return snippets.  
   * `e.g.`
   * ```js
   * renderer({
   *   resolve: (id) => `const lib = require("${id}");\nexport default lib.default || lib;`
   * })
   * ```
   * 
   * @experimental
   */
  resolve?: {
    [id: string]: (() => string | { platform: 'browser' | 'node' } | Promise<string | { platform: 'browser' | 'node' }>)
  }
}
```

**Here is an example using serialport**

```js
import renderer from 'vite-plugin-electron-renderer'

export default {
  plugins: [
    renderer({
      resolve: {
        serialport: () => ({ platform: 'node' }),
        // Equivalent to
        // serialport: () => `const lib = require("serialport");\nexport default lib.default || lib;`
      },
    }),
  ],
}
```

## 0.13.7 (2023-03-25)

- bda7d87 feat: set electron `__esModule`
- 69960bd refactor: remove `cjs`, `external`. add `freeze`, `ignore`.
- 521d8e2 docs: `resolve.alias` comments

#### Main Changed

1. No longer build in `cjs` format by default with improvements to `esm`.
2. Remove the Node.js built-in module from `external` to be compatible with the `esm` build format.

## 0.13.6 (2023-03-24)

- 562aa20 refactor: explicitly specify the module platform

#### Main Changed

Since `0.13.6`, Pre-Bundling have been greatly improved and Pure-JavaScript/Node.js modules no longer require any configuration - **out of the box**.

C/C++ modules, however, still require explicit configuration.

```js
export default {
  plugins: [
    renderer({
      optimizeDeps: {
        resolve(args) {
          if (args.path === 'serialport') {
            return { platform: 'node' } // C/C++ module
          }
        },
      },
    }),
  ],
}
```

## 0.13.5 (2023-03-23)

- efaf706 refactor: `options.optimizer` -> `options.optimizeDeps`
- 82bc2f7 refactor: postinstall generation built-in module

## 0.13.4 (2023-03-22)

- e3d737c refactor: remove rebuild `.vite` cache
- 8de547b feat: better rebuild `.vite` cache

## 0.13.3 (2023-03-21)

- de584cc fix: filter `virtual-module:`

## 0.13.2 (2023-03-21)

- 7cc1abd refactor: better module type detect

## 0.13.1 (2023-03-21)

- 893e361 refactor!: improve Pre-Bundling #35

## 0.13.0 (2023-03-20)

#### Break!

Since `0.13.0`, Pre-Bundling will be handled automatically within the plugin

#### Main Changed

- 485a516 feat!: Pre-Bundling modules for Electron Renderer process

## 0.12.1 (2023-02-09)

#### Main Changed

9803675 fix(test): the right time
41bff23 fix: `optimizeDeps.exclude` builtin modules #27

## 0.12.0 (2023-02-09)

#### Main Changed

- c97bd16 refactor: better builtins build
- 61e9e05 refactor: better polyfill with `nodeIntegration:false` #24
- 4ef703c feat: lazy load `esbuild`
- 06e7f31 Merge pull request #25 from electron-vite/vitest
- 35bb551 feat(test): integrate vitest

## 0.11.4 (2023-01-04)

- 502f7f2 feat: support Pre-Bundling cache #15

## 0.11.3 (2022-11-18)

- cbab7db fix: insert built-in modules to `optimizeDeps.exclude`

## 0.11.2 (2022-11-18)

1. Pre-Bundling Node.js built-in modules by default.
2. Fixed incorrect loading of static resources *(It does not support custom assetsDir)*.

- ee51908 feat: build built-in modules 🌱
- 51d5287 fix: `assetsDir` default value
- 5d0dfc0 refactor: always Pre-Bundling built-in modules

## 0.11.1 (2022-11-16)

- a8c546b fix: add 'vite-plugin-electron-renderer/electron-renderer' to `optimizeDeps.exclude`.

## 0.11.0 (2022-11-15)

#### Break!

1. All Node.js APIs must be Pre-Bundling via `optimizeDeps` *(the 'electron' module does not need to be built)*, this brings the benefit of being able to use it in Web Worker at the same time.
2. Remove `worker()` plugin.
3. Use Vite to build all source code, and will no longer support importing a plugin separately.

- c9b42be refactor: build with Vite
- d31f314 electron-renderer.js
- 2904e03 feat: `nodeIntegration` in build-config.ts
- 4d292fb feat: `optimizeDeps` support Node.js built-in modules
- 522955c refactor!: remove `worker()`, remove Node.js API support.

## 0.10.4 (2022-11-14)

`optimizerDeps` should not process builtins, builtins will be processed in `use-node.js.ts`.

- 6436b49 fix: avoid built-in modules

## 0.10.3 (2022-11-09)

- `optimizerDeps` generate sourcemap by default vite-plugin-electron#70

---

[v0.9.0~v0.10.2 | CHANGELOG](https://github.com/electron-vite/vite-plugin-electron/blob/v0.10.2/CHANGELOG.md)

## [2022-08-11] v0.8.8

sync `vite-plugin-electron` version

## [2022-08-08] v0.8.5

- 1cc4f40 fix(🌱): support Vite3 - [Uncaught TypeError: Failed to construct 'URL': Invalid URL (vite 3) #44](https://github.com/electron-vite/vite-plugin-electron/issues/44)
- 32f7755 feat(🌱): output ESM format - [TypeError: electron is not a function #45](https://github.com/electron-vite/vite-plugin-electron/issues/45)

## [2022-07-21] v0.8.1

- 33b121a chore(deps): hoist `typescript`
- 9d5fd94 fix(🐞): filter out keywords
- d3c1d7a chore(renderer): update config
- 298e4de refactor(renderer): `electron-renderer/plugins` -> `electron-renderer/src`
- 841cbd1 docs(electron-renderer): update
- 3994b9a chore(electron-renderer): fix link
- 72efa81 docs(electron-renderer): update

## [2022-07-19] v0.6.0

- be80d0c vite-plugin-electron-renderer@0.6.0
- 7e69a7c docs: `vite-plugin-electron-renderer@0.6.0`
- da89e79 remove `electron-renderer/index.d.ts`
- 581ef71 chore(deps): bump vite to 3.0.2
- 716485b refactor vite-plugin-electron-renderer with TypeScript
- baf5e80 refactor use-node.js with TypeScript
- 7e3fd3d refactor polyfill-exports with TypeScript
- 2249834 refactor build-config with TypeScript
- 8dad5e2 refactor(🚨): exclude `dependencies` as external by default
- 0163d12 feat: `scripts.dev`
- 3ad4b41 feat: `scripts.build` `scripts.dev`
- 48a0338 monorepo: add `packages/electron-renderer`

## [2022-07-11] v0.5.7

- 71799c7 fix(🐞): `cwd is not defined`

## [2022-07-11] v0.5.6

- d31f917 refactor: `root: string` instead of `config: UserConfig`

## [2022-07-11] v0.5.5

- 7f5117b chore: types
- 17eab4d fix(🐞): build Electron-Renderer
- f5ea26c remove `plugins/use-node.js/electron-renderer.js`

## [2022-07-10] v0.5.4

- 75b60c2 docs: v0.5.4
- 1b933d2 refactor(🌱): better logic

## [2022-07-07] v0.5.3

- 69eb531 docs: v0.5.3
- cc98ed9 feat: `ResolveModules['options']`  optional
- db03a72 chore: remove `useNodeJs.default = useNodeJs`
- c30dc1b fix(🐞): add `electron` to ` builtins

## [2022-07-07] v0.5.2

- 9dd8d4c feat: export `resolveModules()`
- 609e582 feat: interface `ResolveModules`
- dc6d6f6 docs: update
- 201eb71 docs: 🚨 ESM packages
- c8fe50b docs: `import { ipcRenderer } from 'electron'`

## [2022-07-01] v0.5.1

- ec224db refactor: optimize code
- f0efdfb fix(🐞): exclude ESM package
- f3e6b2c chore: optimize code
- 66df43b docs: update
- e2afb1e docs: `Electron-Renderer(vite serve)` flow chart
- 329056f docs: `dependencies` vs `devDependencies`
- d9734c9 Update README.md

## [2022-06-28] v0.5.0

- 6f3d745 fix(🐞): `require('fs')`
- 53845da feat: `config.build.emptyOutDir=false`
- 7cf9deb electron-renderer.js -> plugins/use-node.js/electron-renderer.js
- 7d537d5 docs: v0.5.0
- 2966399 refactor: standalone plugins
- ac356f2 feat: `vite-plugin-electron-renderer:use-node.js`
- 9798acd feat: `vite-plugin-electron-renderer:polyfill-exports`
- 0948df9 feat: `vite-plugin-electron-renderer:build-config`
- 9fb0e03 docs: update
- b6ec453 Update README.md
- 32acf9a docs: update
- d277390 docs: update

## [2022-06-27] v0.4.1

- a7a41a4 docs: v0.4.1
- 62b7584 feat: try resolve `package.json` from `process.cwd()`

## [2022-06-26] v0.4.0

- 87da81f docs: v0.4.0
- f2b860b remove README.zh-CN.md
- 130dce3 refactor: `resolve()` instead of `dependencies`
- 4a2620d refactor: from v0.3.3
