# Migrate to v1

This guide covers the migration from `vite-plugin-electron-renderer` v0.14.x to
v1.

## Agent summary

Use this section when applying the migration automatically.

- Replace `vite-plugin-electron-renderer@0.14.x` with v1.
- Upgrade Vite to v8.
- Prefer Electron 35+ for `resolve.*.type: 'esm'`.
- If Electron is still < 35, add `prebuildEsm: true` temporarily.
- Keep native addons as `type: 'cjs'`.
- Keep pure ESM packages as `type: 'esm'`.
- Add `bundle: true` to control if a dependency should be bundled in production builds.
- Replace `vite-plugin-electron-renderer/dist/cjs-shim.*` imports with
  `vite-plugin-electron-renderer/cjs-shim`.
- Put native modules in `dependencies` unless their native binaries are handled
  manually.
- Put buildable non-native modules in `devDependencies`.

## What changed

The notes below are verified against the real `v0.14.7` source code.

- Vite < 8 is no longer supported.
- v0.14.7 pre-bundled `type: 'esm'` dependencies to CJS with esbuild in dev.
- v0.14.7 skipped `type: 'esm'` custom resolves during `vite build` and let Vite
  build them normally.
- v1 serves `type: 'esm'` shims through `createRequire()` in dev.
- v1 bundles `type: 'esm'` dependencies in production builds by default.
- v1 keeps `type: 'cjs'` dependencies on runtime `require()` by default.
- v1 adds `prebuildEsm` for Electron < 35 compatibility.
- v1 adds `bundle` to control production dependency bundling.
- v1 no longer exposes the package wildcard export `./*`; use documented
  subpath exports.
- v1 custom `build().esm()` no longer accepts esbuild build options.

If you need the old behavior, stay on v0.14.7.

## API mapping

| v0.14.7                                           | v1                                                                                  |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `resolve[name].type: 'cjs'`                       | Keep as `resolve[name].type: 'cjs'`                                                 |
| `resolve[name].type: 'esm'`                       | Keep as `resolve[name].type: 'esm'`; add `prebuildEsm: true` only for Electron < 35 |
| `build({ esm(module, esbuildOptions) })`          | `build({ esm(module) })`; move custom bundling to your own build step if needed     |
| `vite-plugin-electron-renderer/dist/cjs-shim.mjs` | `vite-plugin-electron-renderer/cjs-shim`                                            |
| private `dist/*` imports                          | unsupported; use package exports only                                               |
| no `bundle` option                                | `bundle` controls production bundling per configured dependency                     |

## 1. Upgrade Vite

Upgrade your app to Vite 8 first.

```sh
npm i vite@^8 vite-plugin-electron-renderer@^1 -D
```

With pnpm:

```sh
pnpm add vite@^8 vite-plugin-electron-renderer@^1 -D
```

## 2. Check your Electron version

If your app uses Electron 35 or newer, no compatibility option is required for
pure ESM packages.

```ts
import renderer from 'vite-plugin-electron-renderer'

export default {
  plugins: [
    renderer({
      resolve: {
        got: { type: 'esm' },
        execa: { type: 'esm' },
      },
    }),
  ],
}
```

If your app uses Electron < 35, enable `prebuildEsm: true` while you finish the
runtime upgrade. This matches the v0.14.7 dev behavior more closely by
pre-building configured ESM dependencies to CJS before serving the shim.

```ts
import renderer from 'vite-plugin-electron-renderer'

export default {
  plugins: [
    renderer({
      prebuildEsm: true,
      resolve: {
        got: { type: 'esm' },
        execa: { type: 'esm' },
      },
    }),
  ],
}
```

`prebuildEsm: true` only exists for compatibility. Prefer upgrading Electron
when possible.

## 3. Review configured dependencies

Start from your existing v0.14.7 `renderer({ resolve })` config. Keep each key
unless the dependency is no longer imported by renderer code.

Use `type: 'cjs'` for native addons and packages that must be loaded by
Electron's Node.js runtime.

```ts
renderer({
  resolve: {
    serialport: { type: 'cjs' },
    sqlite3: { type: 'cjs' },
  },
})
```

Use `type: 'esm'` for pure ESM packages.

```ts
renderer({
  resolve: {
    got: { type: 'esm' },
    'node-fetch': { type: 'esm' },
  },
})
```

By default, v1 bundles `type: 'esm'` dependencies in production builds. Set
`bundle: false` only when the package must stay on the runtime shim path.

```ts
renderer({
  resolve: {
    'node-fetch': { type: 'esm', bundle: false },
  },
})
```

Pure CJS packages stay on runtime `require()` by default. If a pure CJS package
is safe to bundle into the renderer output, opt in explicitly.

```ts
renderer({
  resolve: {
    somePureCjsPackage: { type: 'cjs', bundle: true },
  },
})
```

## 4. Update custom build hooks

If you use `resolve[name].build`, check whether the old hook called
`esm(module, esbuildOptions)`.

v0.14.7 allowed this:

```ts
renderer({
  resolve: {
    somePackage: {
      type: 'esm',
      build: ({ esm }) =>
        esm('somePackage', {
          external: ['some-runtime-dep'],
        }),
    },
  },
})
```

v1 no longer passes esbuild options through `esm()`. Use the simpler shim helper:

```ts
renderer({
  resolve: {
    somePackage: {
      type: 'esm',
      build: ({ esm }) => esm('somePackage'),
    },
  },
})
```

If you need custom bundling, run that bundling in your own build step and return
a custom shim string from `build()`.

## 5. Move dependencies to the right section

`electron-builder` packages `dependencies` into the final app, while Vite may
also bundle the same modules into the renderer output. Keep dependency placement
strict to avoid duplicate app size.

Native modules should stay in `dependencies` by default:

```json
{
  "dependencies": {
    "serialport": "^13.0.0",
    "sqlite3": "^6.0.1"
  }
}
```

Buildable packages should stay in `devDependencies`:

```json
{
  "devDependencies": {
    "electron-store": "^11.0.0",
    "execa": "^9.0.0",
    "got": "^15.0.0",
    "node-fetch": "^3.0.0"
  }
}
```

If you manually handle native binary files and runtime dependency layout, you
can move native modules to `devDependencies` to further reduce packaged app
size. Only do this when your packaging flow explicitly copies and resolves the
native binaries.

## 6. Update CJS shim imports

If your app uses the CJS build shim, prefer the package subpath export.

```ts
import cjsShim from 'vite-plugin-electron-renderer/cjs-shim'
```

Avoid importing from `vite-plugin-electron-renderer/dist/*` in application
config.

## 7. Verify the migration

Run the normal app checks after updating the config.

```sh
pnpm build
pnpm test
```

For Electron apps, also run a packaged build and inspect the output size. If the
same package appears both in the renderer assets and `app.asar` dependencies,
move it to `devDependencies` unless it is a native module that electron-builder
must collect.

## Quick checklist

- [ ] Vite is upgraded to v8.
- [ ] Electron is upgraded to 35+, or `prebuildEsm: true` is enabled temporarily.
- [ ] Native addons use `type: 'cjs'`.
- [ ] Pure ESM packages use `type: 'esm'`.
- [ ] Runtime-only ESM packages set `bundle: false`.
- [ ] Custom `build().esm()` calls no longer pass esbuild options.
- [ ] Buildable non-native packages are in `devDependencies`.
- [ ] Native modules are in `dependencies` unless their binaries are handled
      manually.
- [ ] `cjs-shim` is imported from `vite-plugin-electron-renderer/cjs-shim`.
