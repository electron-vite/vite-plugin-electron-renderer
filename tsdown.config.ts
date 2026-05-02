import { nodeLib } from '@subf/config/tsdown'

export default nodeLib({
  entry: 'shallow',
  unbundled: [
    'esbuild',
    'lib-esm',
    'vite',
    'vite-plugin-utils',
    // tsdown does not automatically externalize this imported subpath when only the package root is listed.
    'vite-plugin-utils/function',
  ],
  overrides: {
    cjsDefault: false,
    target: 'node14',
    format: ['cjs', 'esm'],
  },
})
