import type {
  Alias,
  Plugin,
  UserConfig,
} from 'vite'
import type { ExternalOption, RollupOptions } from 'rollup'
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
          config.build.rollupOptions.external = withExternal(config.build.rollupOptions.external)
          setOutputFormat(config.build.rollupOptions)
        }
      },
    },
  ]
}

function withExternal(external?: ExternalOption) {
  if (
    Array.isArray(external) ||
    typeof external === 'string' ||
    external instanceof RegExp
  ) {
    // @ts-ignore
    external = electronBuiltins.concat(external)
  } else if (typeof external === 'function') {
    const original = external
    external = function externalFn(source, importer, isResolved) {
      if (electronBuiltins.includes(source)) {
        return true
      }
      return original(source, importer, isResolved)
    }
  } else {
    external = electronBuiltins
  }
  return external
}

// At present, Electron can only support CommonJs
function setOutputFormat(rollupOptions: RollupOptions) {
  rollupOptions.output ??= {}
  if (Array.isArray(rollupOptions.output)) {
    for (const o of rollupOptions.output) {
      o.format ??= 'cjs'
    }
  } else {
    rollupOptions.output.format ??= 'cjs'
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
