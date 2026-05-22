import path from 'node:path'

import { app, BrowserWindow } from 'electron'
import Store from 'electron-store'

import { storeDirectory } from '../shared/store-config'

process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'

Store.initRenderer()

let win: BrowserWindow | null = null

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 1080,
    minHeight: 760,
    title: 'Electron Store Studio',
    backgroundColor: '#efe7dd',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      nodeIntegrationInWorker: true,
      webSecurity: false,
    },
  })

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('electron-store-example:meta', {
      cwd: process.cwd(),
      storeDirectory,
    })
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
})

app.on('window-all-closed', () => {
  app.quit()
})
