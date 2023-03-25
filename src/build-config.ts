import type {
  Alias,
  BuildOptions,
  Plugin,
  UserConfig,
} from 'vite'
import type { RollupOptions } from 'rollup'
import { electronBuiltins } from './utils'

export default function buildConfig(nodeIntegration?: boolean): Plugin[] {
  return [
    {
      name: 'vite-plugin-electron-renderer:builtins',
      config(config) {
        const aliases: Alias[] = [
          // Always polyfill electron.
          {
            find: 'electron',
            replacement: 'vite-plugin-electron-renderer/builtins/electron',
          },
          ...(nodeIntegration ? electronBuiltins
            .filter(m => m !== 'electron')
            .filter(m => !m.startsWith('node:'))
            .map<Alias>(m => ({
              find: new RegExp(`^(node:)?${m}$`),
              replacement: `vite-plugin-electron-renderer/builtins/${m}`,
            })) : []),
        ]

        // Why is the builtin modules loaded by modifying `resolve.alias` instead of using the plugin `resolveId` + `load` hooks?
        // `resolve.alias` can work in both the Renderer process and Web Worker, but not the plugin :(
        // see - https://github.com/vitejs/vite/blob/v4.2.0/packages/vite/src/node/config.ts#L253-L256
        modifyAlias(config, aliases)
      },
    },
    {
      name: 'vite-plugin-electron-renderer:build-config',
      apply: 'build',
      config(config) {
        // Make sure that Electron can be loaded into the local file using `loadFile` after packaging
        config.base ??= './'

        config.build ??= {}

        // TODO: init `config.build.target`
        // https://github.com/vitejs/vite/pull/8843

        // https://github.com/electron-vite/electron-vite-vue/issues/107
        config.build.cssCodeSplit ??= false

        // TODO: compatible with custom assetsDir
        // This will guarantee the proper loading of static resources, such as images, `worker.js`
        // The `.js` file can be loaded correctly with cjs-shim.ts
        config.build.assetsDir ??= ''

        if (nodeIntegration) {
          config.build.rollupOptions ??= {}
          config.build.rollupOptions.output ??= {}

          // `fs-extra` will extend the `fs` module
          setOutputFreeze(config.build.rollupOptions)

          // Some third-party modules, such as `fs-extra`, extend the native module
          // `__esModule` to bypass Rollup's `getAugmentedNamespace`
          // see - https://github.com/rollup/plugins/blob/commonjs-v24.0.0/packages/commonjs/src/helpers.js#L38
          withIgnore(config.build)
        }
      },
    },
  ]
}

function setOutputFreeze(rollupOptions: RollupOptions) {
  rollupOptions.output ??= {}
  if (Array.isArray(rollupOptions.output)) {
    for (const o of rollupOptions.output) {
      o.freeze ??= false
    }
  } else {
    rollupOptions.output.freeze ??= false
  }
}

function withIgnore(configBuild: BuildOptions) {
  configBuild.commonjsOptions ??= {}
  if (configBuild.commonjsOptions.ignore) {
    if (typeof configBuild.commonjsOptions.ignore === 'function') {
      const userIgnore = configBuild.commonjsOptions.ignore
      configBuild.commonjsOptions.ignore = id => {
        if (userIgnore?.(id) === true) {
          return true
        }
        return electronBuiltins.includes(id)
      }
    } else {
      // @ts-ignore
      configBuild.commonjsOptions.ignore.push(...electronBuiltins)
    }
  } else {
    configBuild.commonjsOptions.ignore = electronBuiltins
  }
}

function modifyAlias(config: UserConfig, aliases: Alias[]) {
  config.resolve ??= {}
  config.resolve.alias ??= []
  if (Object.prototype.toString.call(config.resolve.alias) === '[object Object]') {
    config.resolve.alias = Object
      .entries(config.resolve.alias)
      .reduce<Alias[]>((memo, [find, replacement]) => memo.concat({ find, replacement }), [])
  }
  (config.resolve.alias as Alias[]).push(...aliases)
}
