import { nodeLib } from '@subf/config/tsdown'

export default nodeLib({
  // Include both src/index.ts and src/cjs-shim.ts
  entry: 'shallow',
  // Externalize peer/host dependencies; lib-esm and vite-plugin-utils are bundled in
  unbundled: ['esbuild', 'vite'],
})
