import { BrowserWindow, ipcMain } from "electron"
import path from "path"
import { getCenteredWindowPosition } from "../utils/windowUtils"

const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"]

let elevationGraphWin: BrowserWindow | null = null
let lastElevationGraphPayload: unknown = null

function sendElevationPayload() {
  if (!elevationGraphWin) return
  if (elevationGraphWin.isDestroyed()) return
  if (elevationGraphWin.webContents.isDestroyed()) return
  if (lastElevationGraphPayload === null) return

  elevationGraphWin.webContents.send(
    "app:send-elevation-graph",
    lastElevationGraphPayload,
  )
}

export function openElevationGraphWindow(parentWindow?: BrowserWindow) {
  if (elevationGraphWin === null) {
    const windowOptions: Electron.BrowserWindowConstructorOptions = {
      width: 760,
      height: 420,
      frame: true,
      icon: path.join(process.env.VITE_PUBLIC, "app_icon.ico"),
      show: false,
      title: "Elevation Graph",
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
      },
      fullscreen: false,
      fullscreenable: false,
      alwaysOnTop: true,
    }

    const centeredPosition = getCenteredWindowPosition(
      parentWindow,
      windowOptions.width!,
      windowOptions.height!,
    )
    if (centeredPosition) {
      windowOptions.x = centeredPosition.x
      windowOptions.y = centeredPosition.y
    }

    elevationGraphWin = new BrowserWindow(windowOptions)
    elevationGraphWin.once("closed", () => {
      elevationGraphWin = null
    })
  }

  if (VITE_DEV_SERVER_URL) {
    elevationGraphWin?.loadURL(VITE_DEV_SERVER_URL + "elevationGraph.html")
  } else {
    elevationGraphWin?.loadFile(
      path.join(process.env.DIST, "elevationGraph.html"),
    )
  }

  elevationGraphWin.setMenuBarVisibility(false)
  elevationGraphWin.show()
}

export function closeElevationGraphWindow() {
  destroyElevationGraphWindow()
}

export function destroyElevationGraphWindow() {
  elevationGraphWin?.close()
  elevationGraphWin = null
}

export default function registerElevationGraphIPC() {
  ipcMain.removeHandler("app:open-elevation-graph-window")
  ipcMain.removeHandler("app:close-elevation-graph-window")
  ipcMain.removeHandler("app:update-elevation-graph")

  ipcMain.removeAllListeners("app:elevation-graph:ready")
  ipcMain.on("app:elevation-graph:ready", (event) => {
    if (!elevationGraphWin) return
    if (event.sender.id !== elevationGraphWin.webContents.id) return
    sendElevationPayload()
  })

  ipcMain.handle("app:open-elevation-graph-window", (event) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender)
    openElevationGraphWindow(parentWindow || undefined)
  })

  ipcMain.handle("app:close-elevation-graph-window", () =>
    closeElevationGraphWindow(),
  )

  ipcMain.handle("app:update-elevation-graph", (_event, profileData) => {
    lastElevationGraphPayload = profileData
    sendElevationPayload()
  })
}
