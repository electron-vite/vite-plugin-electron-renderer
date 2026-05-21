import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { cjsSnippet, esmSnippet } from '../src/snippets'

const keywordFixture = path.join(__dirname, 'fixtures', 'keyword-exports.cjs')

describe('snippets', () => {
  it('aliases reserved-word exports in cjs shims', () => {
    const snippet = cjsSnippet(keywordFixture)

    expect(snippet).toMatch(/const __export_\d+__ = _m_\["delete"\];/)
    expect(snippet).toMatch(/export \{\n(?:  __export_\d+__ as \w+,\n)+\};/)
    expect(snippet).toMatch(/__export_\d+__ as delete,/)
    expect(snippet).toMatch(/__export_\d+__ as get,/)
    expect(snippet).not.toContain('export const delete =')
  })

  it('aliases reserved-word exports in esm shims', () => {
    const snippet = esmSnippet(keywordFixture, __dirname)

    expect(snippet).toMatch(/const __export_\d+__ = _m_\["delete"\];/)
    expect(snippet).toMatch(/export \{\n(?:  __export_\d+__ as \w+,\n)+\};/)
    expect(snippet).toMatch(/__export_\d+__ as delete,/)
    expect(snippet).toMatch(/__export_\d+__ as get,/)
    expect(snippet).not.toContain('export const delete =')
  })
})
