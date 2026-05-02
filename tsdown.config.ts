import { nodeLib } from '@subf/config/tsdown'

export default nodeLib({
  entry: 'shallow',
  unbundled: ['vite'],
  overrides: {
    cjsDefault: false,
    target: 'node14',
    format: ['cjs', 'esm'],
  },
})
