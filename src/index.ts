import type { PluginOption } from 'vite'
import buildConfig from './build-config'
import cjsShim from './cjs-shim'
import optimizer, { type DepOptimizationConfig } from './optimizer'

export default function renderer(
  options: {
    /**
     * Whether node integration is enabled. Default is `false`.
     */
    nodeIntegration?: boolean
    /**
     * If the npm-package you are using is a Node.js package, then you need to Pre-Bundling it.
     * @see https://vitejs.dev/guide/dep-pre-bundling.html
     */
    optimizeDeps?: DepOptimizationConfig
  } = {}
): PluginOption {
  return [
    buildConfig(),
    options.nodeIntegration && cjsShim(),
    options.optimizeDeps && optimizer(options.optimizeDeps),
  ]
}
