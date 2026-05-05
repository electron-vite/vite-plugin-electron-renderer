import { createRequire } from 'node:module'

export const PLUGIN_NAME = 'vite-plugin-electron-renderer'

const req = createRequire(import.meta.url)
const IDENTIFIER_RE = /^[$A-Z_][0-9A-Z_$]*$/i

export function cjsSnippet(moduleId: string): string {
  try {
    const required = req(moduleId)
    return cjsShimStatic(moduleId, Object.getOwnPropertyNames(required ?? {}))
  } catch {
    return cjsShimFallback(moduleId)
  }
}

/**
 * CJS shim with statically known export names.
 * Preferred because Rolldown can tree-shake static exports.
 */
function cjsShimStatic(pkg: string, exportKeys: string[]): string {
  const named = [...new Set(exportKeys)]
    .filter((key) => key !== 'default' && key !== '__esModule' && IDENTIFIER_RE.test(key))
    .map((key) => `export const ${key} = _m_[${JSON.stringify(key)}];`)
    .join('\n')

  return `// [${PLUGIN_NAME}] CJS shim - ${JSON.stringify(pkg)}
// Loaded via require() inside Electron's Node.js runtime.
const _m_ = require(${JSON.stringify(pkg)});
export default (_m_?.default ?? _m_);
${named}
`
}

/**
 * CJS shim fallback when we can't introspect the module at build time.
 */
function cjsShimFallback(pkg: string): string {
  return `// [${PLUGIN_NAME}] CJS shim (dynamic) - ${JSON.stringify(pkg)}
const _m_ = require(${JSON.stringify(pkg)});
export default (_m_?.default ?? _m_);
`
}

/**
 * ESM shim for pure-ESM packages.
 */
export function esmSnippet(pkg: string): string {
  return `// [${PLUGIN_NAME}] ESM shim - ${JSON.stringify(pkg)}
// Dynamic import() defers to Electron's ES module loader.
const _m_ = await import(${JSON.stringify(pkg)});
export default (_m_?.default ?? _m_);
export * from ${JSON.stringify(pkg)};
`
}
