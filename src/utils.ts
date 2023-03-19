import fs from 'node:fs'
import { builtinModules } from 'node:module'

export const builtins = builtinModules.filter(m => !m.startsWith('_')); builtins.push(...builtins.map(m => `node:${m}`))
export const electronBuiltins = ['electron', ...builtins]

export function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}
