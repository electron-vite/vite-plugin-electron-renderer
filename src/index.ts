import type { PluginOption } from 'vite'
import buildConfig from './build-config'
import cjsShim from './cjs-shim'
import {
  type optimizerOptions,
  default as optimizer,
} from './optimizer'

export default function renderer(
  options: {
    /**
     * @default false
     */
    nodeIntegration?: boolean
    /**
     * Pre-Bundling modules for Electron Renderer process.
     */
    optimizeDeps?: optimizerOptions
  } = {}
): PluginOption {
  const {
    nodeIntegration,
    optimizeDeps,
  } = options
  return [
    buildConfig(nodeIntegration),
    optimizer(optimizeDeps, nodeIntegration),
    nodeIntegration && cjsShim(),
  ]
}
