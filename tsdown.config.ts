import { nodeLib } from '@subf/config/tsdown'

export default nodeLib({
  entry: {
    index: 'src/index.ts',
    'cjs-shim': 'src/cjs-shim.ts',
  },
  unbundled: ['vite'],
  overrides: {
    cjsDefault: false,
    target: 'node14',
    format: ['cjs', 'esm'],
  },
})
