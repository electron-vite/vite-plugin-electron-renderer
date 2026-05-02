import { builtinModules } from 'node:module'

import type { BuildOptions, UserConfig } from 'vite'
import { resolveConfig } from 'vite'
import { describe, expect, it } from 'vitest'

import renderer from '..'

export const builtins = [
  'electron',
  ...builtinModules.filter((m) => !m.startsWith('_')),
  ...builtinModules.filter((m) => !m.startsWith('_')).map((mod) => `node:${mod}`),
]

describe('config', () => {
  /* it('rollup.external', async () => {
    const getConfig = (external: ExternalOption) => resolveConfig({
      configFile: false,
      build: {
        rolldownOptions: {
          external,
        },
      },
      plugins: [renderer()],
    }, 'build')
    const external = builtins as ExternalOption[]

    const external_string: ExternalOption = 'electron'
    const external_string2 = (await getConfig(external_string))!.build!.rolldownOptions!.external
    expect(external_string2).deep.equal(external.concat(external_string))

    const external_array: ExternalOption = ['electron']
    const external_array2 = (await getConfig(external_array))!.build!.rolldownOptions!.external
    expect(external_array2).deep.equal(external.concat(external_array))

    const external_regexp: ExternalOption = /electron/
    const external_regexp2 = (await getConfig(external_regexp))!.build!.rolldownOptions!.external
    expect(external_regexp2).deep.equal(external.concat(external_regexp))

    const external_function: ExternalOption = (source) => ['electron'].includes(source)
    const external_function2 = (await getConfig(external_function))!.build!.rolldownOptions!.external
    expect((external_function2 as (source: string) => boolean)('electron')).true
  }) */

  it('base', async () => {
    const config = await resolveConfig(
      {
        configFile: false,
        plugins: [renderer()],
      },
      'build',
    )

    expect(config.base).equal('./')
  })

  it('rollup.output', async () => {
    const getConfig = (output: NonNullable<BuildOptions['rolldownOptions']>['output']) =>
      resolveConfig(
        {
          configFile: false,
          build: {
            rolldownOptions: {
              output,
            },
          },
          plugins: [renderer()],
        },
        'build',
      )

    const output = (await getConfig({})).build.rolldownOptions.output
    expect(output.freeze).toBe(false)

    const outputArr = (await getConfig([{}])).build.rolldownOptions.output
    for (const out of outputArr) {
      expect(out.freeze).toBe(false)
    }
  })

  it('commonjs', async () => {
    const getConfig = (commonjsOptions: NonNullable<UserConfig['build']>['commonjsOptions']) =>
      resolveConfig(
        {
          configFile: false,
          build: {
            commonjsOptions,
          },
          plugins: [renderer()],
        },
        'build',
      )

    const ignore_array = (await getConfig({ ignore: builtins })).build.commonjsOptions.ignore
    expect(ignore_array).equal(builtins)

    const ignore_function = (await getConfig({ ignore: (id) => builtins.includes(id) })).build
      .commonjsOptions.ignore as (id: string) => boolean
    for (const builtin of builtins) {
      expect(ignore_function(builtin)).toBe(true)
    }
  })
})
