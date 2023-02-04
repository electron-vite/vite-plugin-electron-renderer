import { builtinModules } from 'node:module'
import { resolveConfig } from 'vite'
import type { ExternalOption, OutputOptions, RollupOptions } from 'rollup'
import {
  describe,
  expect,
  it,
} from 'vitest'
import buildConfig from '../src/build-config'

describe('src/build-config', () => {
  it('buildConfig.external', async () => {
    const builtins: ExternalOption = [
      'electron',
      ...builtinModules.filter(m => !m.startsWith('_')),
      ...builtinModules.filter(m => !m.startsWith('_')).map(mod => `node:${mod}`),
    ]
    const getConfig = (external: ExternalOption) =>
      resolveConfig({
        configFile: false,
        build: {
          rollupOptions: {
            external,
          },
        },
        plugins: [buildConfig(true)],
      }, 'build')

    const external_string: ExternalOption = 'electron'
    const external_string2 = (await getConfig(external_string))!.build!.rollupOptions!.external
    expect(external_string2).deep.equal(builtins.concat(external_string))

    const external_array: ExternalOption = ['electron']
    const external_array2 = (await getConfig(external_array))!.build!.rollupOptions!.external
    expect(external_array2).deep.equal(builtins.concat(external_array))

    const external_regexp: ExternalOption = /electron/
    const external_regexp2 = (await getConfig(external_regexp))!.build!.rollupOptions!.external
    expect(external_regexp2).deep.equal(builtins.concat(external_regexp))

    const external_function: ExternalOption = (source) => ['electron'].includes(source)
    const external_function2 = (await getConfig(external_function))!.build!.rollupOptions!.external
    expect((external_function2 as (source: string) => boolean)('electron')).true
  })

  it('buildConfig.format', async () => {
    const getConfig = (output: RollupOptions['output']) => resolveConfig({
      configFile: false,
      build: {
        rollupOptions: {
          output,
        },
      },
      plugins: [buildConfig(true)],
    }, 'build')

    const output = (await getConfig({})).build.rollupOptions.output as OutputOptions
    expect(output.format).eq('cjs')

    const outputArr = (await getConfig([{}])).build.rollupOptions.output as OutputOptions[]
    expect(outputArr[0].format).eq('cjs')
  })
})
