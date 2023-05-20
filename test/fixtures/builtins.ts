import { ipcRenderer } from 'electron'
import { readFile } from 'node:fs'

console.log('ipcRenderer:', ipcRenderer)
console.log('readFile:', readFile)

import('path').then(m => m.default).then(path => {
  console.log(path)
})
