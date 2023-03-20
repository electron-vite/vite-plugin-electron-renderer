import fs from 'node:fs'
import path from 'node:path'
import {
  type ViteDevServer,
  createServer,
} from 'vite'
import {
  afterAll,
  beforeAll,
  expect,
  test,
} from 'vitest'
import fetch from 'node-fetch'
import optimizer from '../src/optimizer'

// const root = path.join(__dirname, 'fixtures/optimizer')
let server: ViteDevServer | null = null
const PORT = 4004

beforeAll(async () => {
  // fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true })
  server = await createServer({
    configFile: false,
    plugins: [
      {
        name: 'virtual-module',
        enforce: 'pre',
        resolveId(source) {
          if (source === '/main.ts') {
            return '\0/main.ts'
          }
        },
        load(id) {
          if (id === '\0/main.ts') {
            return `
import got from 'got'
import { SerialPort } from 'serialport'
import * as utils from 'vite-plugin-utils/constant'

console.log('Node.js ESM package got:\n', got)
console.log('Node.js Native package serialport:\n', SerialPort)
console.log("Use Vite's default Pre-Bundling:\n", utils)
`
          }
        },
      },
      optimizer({
        modules: {
          'vite-plugin-utils/constant': false,
        },
      }, true),
    ],
  })
  await server.listen(PORT)
})

test('src/optimizer.ts', async () => {
  await Promise.all([
    fetch(`http://localhost:${PORT}/got`),
    fetch(`http://localhost:${PORT}/serialport`),
    fetch(`http://localhost:${PORT}/vite-plugin-utils/constant`),
  ])

  // TODO

  expect(true).true
})

afterAll(async () => {
  await server?.close()
  server = null
})
