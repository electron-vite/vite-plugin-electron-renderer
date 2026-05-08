// oxlint-disable no-alert
import fs from 'node:fs/promises'
import { platform } from 'node:os'

import { ipcRenderer } from 'electron'

console.log('Electron API:\n', ipcRenderer)
console.log('Node.js API(fs/promises):\n', fs)

platform() === 'win32'
  ? alert('Hello from Electron renderer process!')
  : alert('Hello from Electron renderer process! (Node.js APIs are available)')
