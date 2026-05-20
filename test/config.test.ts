import type { BuildOptions } from 'vite'
import { resolveConfig } from 'vite'
import { describe, expect, it } from 'vitest'

import renderer from '../src/index'

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
})
