import { readFile } from 'node:fs'

import { ipcRenderer } from 'electron'

console.log('ipcRenderer:', ipcRenderer)
console.log('readFile:', readFile)

import('node:path')
  .then((m) => m.default)
  .then((path) => {
    console.log(path)
  })
