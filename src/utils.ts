import { builtinModules } from 'node:module'

export const builtins = builtinModules.filter(m => !m.startsWith('_')); builtins.push(...builtins.map(m => `node:${m}`))
export const electronBuiltins = ['electron', ...builtins]
