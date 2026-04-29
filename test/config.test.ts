import { builtinModules } from 'node:module'
import {
  type UserConfig,
  resolveConfig,
} from 'vite'
import {
  describe,
  expect,
  it,
} from 'vitest'
import renderer from '..'

export const builtins = [
  'electron',
  ...builtinModules.filter(m => !m.startsWith('_')),
  ...builtinModules.filter(m => !m.startsWith('_')).map(mod => `node:${mod}`),
]

describe('config', () => {
  it('base', async () => {
    const config = await resolveConfig({
      configFile: false,
      plugins: [renderer()],
    }, 'build')

    expect(config.base).equal('./')
  })

  it('rolldown.output', async () => {
    // Vite 8: the plugin configures `rolldownOptions.output.freeze = false` so that
    // Rolldown does not freeze namespace objects (needed for modules like fs-extra that
    // extend native Node.js modules at runtime).
    const getConfig = (output: Record<string, unknown> | Array<Record<string, unknown>>) => resolveConfig({
      configFile: false,
      build: {
        // @ts-expect-error rolldownOptions is Vite 8+
        rolldownOptions: { output },
      },
      plugins: [renderer()],
    }, 'build')

    const build = ((await getConfig({})).build as UserConfig['build'] & {
      rolldownOptions?: { output?: { freeze?: boolean } }
    })
    expect(build.rolldownOptions?.output?.freeze).toBe(false)

    const buildArr = ((await getConfig([{}])).build as UserConfig['build'] & {
      rolldownOptions?: { output?: Array<{ freeze?: boolean }> }
    })
    for (const out of buildArr.rolldownOptions?.output ?? []) {
      expect(out.freeze).toBe(false)
    }
  })
})
