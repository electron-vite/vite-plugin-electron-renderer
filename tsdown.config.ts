import { nodeLib } from '@subf/config/tsdown'
import { defineConfig } from 'tsdown'

export default defineConfig(
  nodeLib({
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
      exports: {
        customExports(exports) {
          exports['./package.json'] = './package.json'
          exports['./*'] = './*'
          return exports
        },
      },
    },
  }),
)
