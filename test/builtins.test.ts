import fs from 'node:fs'
import path from 'node:path'
import { builtinModules } from 'node:module'
import { expect, test } from 'vitest'

const builtins = builtinModules.filter(m => !m.startsWith('_'))
const builtins_dir = path.join(__dirname, '../builtins')

test('builtins', async () => {
  for (const module of builtins) {
    expect(fs.existsSync(path.join(builtins_dir, `${module}.js`))).true
  }
  expect(true).true
})
