import { ipcRenderer } from 'electron'
import fs from 'fs/promises'

console.log('Electron API:\n', ipcRenderer)
console.log('Node.js API(fs/promises):\n', fs)
