# Standalone Electron Store Example

This example shows how to use `electron-store` directly in the renderer process with `vite-plugin-electron-renderer`.

- `electron-store` is configured as `resolve['electron-store'] = { type: 'esm' }`.
- The store file is written into `node_modules/.electron-store-example/studio-state.json`.
- The renderer UI edits the store live, adds and removes notes, and can open the JSON file in your editor.

Run it with:

```sh
pnpm --dir examples/electron-store dev
```