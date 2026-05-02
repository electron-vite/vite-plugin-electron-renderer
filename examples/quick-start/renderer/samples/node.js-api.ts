import fs from 'node:fs/promises'

import { ipcRenderer } from 'electron'

console.log('Electron API:\n', ipcRenderer)
console.log('Node.js API(fs/promises):\n', fs)
