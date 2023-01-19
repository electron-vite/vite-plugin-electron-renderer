import { app, BrowserWindow } from "electron";
import { Worker } from "node:worker_threads";
import path from "node:path";

process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";

let win: BrowserWindow;

app.whenReady().then(() => {
  win = new BrowserWindow({
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      nodeIntegrationInWorker: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  const worker = new Worker(path.join(__dirname, "./worker.js"));
  worker.on("message", (value) => {
    console.log("[worker message]:", value);
  });
});
