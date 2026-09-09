import { BrowserWindow, ipcMain } from "electron"
import path from "path"
import { getCenteredWindowPosition } from "../utils/windowUtils"

const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"]

type StatusTextMessage = {
  timestamp: number | null
  text: string
  severity: number
}

let statusTextWin: BrowserWindow | null = null
let mainWin: BrowserWindow | null = null
let statusTextMessages: StatusTextMessage[] = []

function notifyMainStatusTextOpened() {
  mainWin?.webContents.send("app:statustext-window-opened")
}

function notifyMainStatusTextClosed() {
  mainWin?.webContents.send("app:statustext-window-closed")
}

function sendStatusTextMessages() {
  statusTextWin?.webContents.send("app:send-statustext", statusTextMessages)
}

export function openStatusTextWindow(parentWindow?: BrowserWindow) {
  if (statusTextWin === null) {
    const windowOptions: Electron.BrowserWindowConstructorOptions = {
      width: 800,
      height: 500,
      frame: true,
      icon: path.join(process.env.VITE_PUBLIC, "app_icon.ico"),
      show: false,
      title: "Status Messages",
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
      },
      fullscreen: false,
      fullscreenable: false,
      alwaysOnTop: true,
    }

    // Position window in the center of the parent window
    const centeredPosition = getCenteredWindowPosition(
      parentWindow,
      windowOptions.width!,
      windowOptions.height!,
    )
    if (centeredPosition) {
      windowOptions.x = centeredPosition.x
      windowOptions.y = centeredPosition.y
    }

    statusTextWin = new BrowserWindow(windowOptions)

    statusTextWin.on("close", () => {
      notifyMainStatusTextClosed()
      statusTextWin = null
    })

    if (VITE_DEV_SERVER_URL) {
      statusTextWin.loadURL(VITE_DEV_SERVER_URL + "statusTextWindow.html")
    } else {
      statusTextWin.loadFile(
        path.join(process.env.DIST, "statusTextWindow.html"),
      )
    }
  }

  statusTextWin.setMenuBarVisibility(false)
  statusTextWin.show()
  statusTextWin.focus()
  notifyMainStatusTextOpened()
}

export function closeStatusTextWindow() {
  destroyStatusTextWindow()
}

export function destroyStatusTextWindow() {
  statusTextWin?.close()
  statusTextWin = null
}

export default function registerStatusTextWindowIPC(appWin?: BrowserWindow) {
  if (appWin) mainWin = appWin

  ipcMain.removeHandler("app:open-statustext-window")
  ipcMain.removeHandler("app:close-statustext-window")
  ipcMain.removeHandler("app:update-statustext")

  ipcMain.removeAllListeners("app:statustext-window:ready")
  ipcMain.on("app:statustext-window:ready", (event) => {
    if (!statusTextWin) return
    if (statusTextWin.isDestroyed()) return
    if (statusTextWin.webContents.isDestroyed()) return
    if (event.sender.id !== statusTextWin.webContents.id) return
    sendStatusTextMessages()
  })

  ipcMain.handle("app:open-statustext-window", (event) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender)
    if (parentWindow) mainWin = parentWindow
    openStatusTextWindow(parentWindow || undefined)
  })
  ipcMain.handle("app:close-statustext-window", () => closeStatusTextWindow())
  ipcMain.handle("app:update-statustext", (_event, msg: StatusTextMessage) => {
    statusTextMessages = [msg, ...statusTextMessages]
    sendStatusTextMessages()
  })
}
