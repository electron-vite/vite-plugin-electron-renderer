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
    optimizer?: optimizerOptions
  } = {}
): PluginOption {
  const {
    nodeIntegration,
    optimizer: optimizerOpts,
  } = options
  return [
    buildConfig(nodeIntegration),
    optimizer(optimizerOpts, nodeIntegration),
    nodeIntegration && cjsShim(),
  ]
}
