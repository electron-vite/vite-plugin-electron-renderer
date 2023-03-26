import { ipcRenderer } from 'electron'
import fs from 'fs/promises'
import buffer from 'buffer'

console.log('Electron API:\n', ipcRenderer)
console.log('Node.js API(fs/promises):\n', fs)

console.log('----', buffer.hasOwnProperty('aaa'), '----')

