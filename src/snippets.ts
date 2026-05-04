import { createRequire } from 'node:module'

const req = createRequire(import.meta.url)

const IDENTIFIER_RE = /^[$A-Z_][0-9A-Z_$]*$/i
const KEYWORDS = new Set([
  'abstract',
  'arguments',
  'as',
  'async',
  'await',
  'boolean',
  'break',
  'byte',
  'case',
  'catch',
  'char',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'double',
  'else',
  'enum',
  'eval',
  'export',
  'extends',
  'false',
  'final',
  'finally',
  'float',
  'for',
  'from',
  'function',
  'get',
  'goto',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'int',
  'interface',
  'let',
  'long',
  'native',
  'new',
  'null',
  'of',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'set',
  'short',
  'static',
  'super',
  'switch',
  'synchronized',
  'this',
  'throw',
  'throws',
  'transient',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'volatile',
  'while',
  'with',
  'yield',
])

export function getSnippets(moduleId: string, requireArg: string = moduleId): string {
  // If a module is a CommonJs, use the `require()` load it can bring better performance,
  // especially it is a C/C++ module, this can avoid a lot of trouble

  // `avoid_parse_require` can be avoid Vite transforms parsing `require()`
  return `const avoid_parse_require = require; const _M_ = avoid_parse_require(${JSON.stringify(requireArg)});\n${getExportSnippets(
    Object.getOwnPropertyNames(/* not await import */ req(moduleId)),
  )}`
}

function getExportSnippets(members: string[]) {
  const seen = new Set<string>()
  const aliasedExports: string[] = []
  const snippets: string[] = []
  let aliasIndex = 0

  const appendMember = (member: string) => {
    if (seen.has(member)) {
      return
    }
    seen.add(member)

    const expression =
      member === 'default' ? '_M_.default || _M_' : `_M_[${JSON.stringify(member)}]`
    if (isSafeIdentifier(member)) {
      snippets.push(`export const ${member} = ${expression};`)
      return
    }

    const alias = getAliasName(member, aliasIndex++)
    snippets.push(`const ${alias} = ${expression};`)
    aliasedExports.push(`${alias} as ${member}`)
  }

  for (const member of members) {
    appendMember(member)
  }
  appendMember('default')

  if (aliasedExports.length) {
    snippets.push(`export {\n  ${aliasedExports.join(',\n  ')},\n};`)
  }

  return snippets.join('\n')
}

function isSafeIdentifier(name: string) {
  return name !== 'default' && IDENTIFIER_RE.test(name) && !KEYWORDS.has(name)
}

function getAliasName(name: string, index: number) {
  const normalized = name.replace(/[^$\w]/g, '_').replace(/^\d/, '_$&')
  return `__vite_plugin_electron_renderer_${normalized || 'export'}_${index}`
}
