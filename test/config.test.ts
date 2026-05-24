import type { BuildOptions } from 'vite'
import { resolveConfig } from 'vite'
import { describe, expect, it } from 'vitest'

import type { RendererOptions } from '../src/index'
import renderer from '../src/index'

function getConfigHandler(plugin: ReturnType<typeof renderer>) {
  const pluginConfig = plugin.config
  if (!pluginConfig) {
    throw new TypeError('renderer plugin is missing a config hook')
  }
  return typeof pluginConfig === 'function' ? pluginConfig : pluginConfig.handler
}

describe('config', () => {
  it('base', async () => {
    const config = await resolveConfig(
      {
        configFile: false,
        plugins: [renderer()],
      },
      'build',
    )

    expect(config.base).toBe('./')
  })

  it('rolldown.output', async () => {
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

    const output = (await getConfig({ exports: 'named' })).build.rolldownOptions.output as any
    expect(output.exports).toBe('named')

    const outputArr = (await getConfig([{ exports: 'named' }])).build.rolldownOptions
      .output as any[]
    for (const out of outputArr) {
      expect(out.exports).toBe('named')
    }
  })

  it('externalizes worker shim modules without mutating input config', async () => {
    const options: RendererOptions = {
      resolve: {
        serialport: { type: 'cjs' },
        'node-fetch': { type: 'esm' },
      },
    }
    const plugin = renderer(options)
    const rootPartial = await getConfigHandler(plugin).call(
      plugin as any,
      { base: './' },
      {} as any,
    )

    expect(rootPartial?.worker?.plugins).toBeTypeOf('function')

    const [workerPlugin] = rootPartial!.worker!.plugins!() as ReturnType<typeof renderer>[]
    const workerInput = {
      base: './',
      build: {
        rolldownOptions: {
          external: ['existing'],
        },
      },
    }
    const workerPartial = await getConfigHandler(workerPlugin).call(
      workerPlugin as any,
      workerInput as any,
      {} as any,
    )

    const external = workerPartial?.build?.rolldownOptions?.external
    expect(Array.isArray(external)).toBe(true)
    expect(external).not.toContain('existing')
    expect(external).toContain('electron')
    expect(external).toContain('node:fs')
    expect(external).toContain('serialport')
    expect(external).not.toContain('node-fetch')

    expect(workerInput.build.rolldownOptions.external).toEqual(['existing'])
  })

  it('honors explicit bundle flags in worker external config', async () => {
    const plugin = renderer({
      resolve: {
        bundledCjs: { type: 'cjs', bundle: true },
        runtimeEsm: { type: 'esm', bundle: false },
      },
    })
    const rootPartial = await getConfigHandler(plugin).call(plugin as any, {}, {} as any)
    const [workerPlugin] = rootPartial!.worker!.plugins!() as ReturnType<typeof renderer>[]
    const workerPartial = await getConfigHandler(workerPlugin).call(
      workerPlugin as any,
      {} as any,
      {} as any,
    )

    const external = workerPartial?.build?.rolldownOptions?.external
    expect(external).not.toContain('bundledCjs')
    expect(external).toContain('runtimeEsm')
  })
})
