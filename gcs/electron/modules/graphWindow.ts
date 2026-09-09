import { BrowserWindow, ipcMain } from "electron"
import path from "path"
import { getCenteredWindowPosition } from "../utils/windowUtils"

const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"]

type GraphKey = "graph_a" | "graph_b" | "graph_c" | "graph_d"

type GraphWindowMeta = {
  id: string
  msg: string
  field: string
  title: string
  description?: string
  label?: string
}

type OpenArgs = {
  graphKey: GraphKey
  meta: GraphWindowMeta
}

type CloseArgs = {
  graphKey: GraphKey
}

type GraphPoint = {
  graphKey: GraphKey
  data: { x: number; y: number }
}

const graphWins: Partial<Record<GraphKey, BrowserWindow>> = {}
const lastMeta: Partial<Record<GraphKey, GraphWindowMeta>> = {}

// Reference to the main FGCS window (the one with Redux + toolbar)
let mainWin: BrowserWindow | null = null

/** Get a window if it's still usable; auto-clean if destroyed. */
function getGraphWin(graphKey: GraphKey): BrowserWindow | null {
  const win = graphWins[graphKey]
  if (!win) return null

  if (win.isDestroyed()) {
    graphWins[graphKey] = undefined
    return null
  }

  if (win.webContents.isDestroyed()) {
    graphWins[graphKey] = undefined
    return null
  }

  return win
}

function notifyMainGraphClosed(graphKey: GraphKey) {
  try {
    if (!mainWin) return
    if (mainWin.isDestroyed()) return
    if (mainWin.webContents.isDestroyed()) return
    mainWin.webContents.send("app:graph-window:closed", { graphKey })
  } catch {
    // ignore during shutdown / race conditions
  }
}

function sendInit(graphKey: GraphKey) {
  const win = getGraphWin(graphKey)
  const meta = lastMeta[graphKey]
  if (!win || !meta) return
  try {
    win.webContents.send("app:graph-window:init", { graphKey, meta })
  } catch {
    // ignore (window may be closing)
  }
}

export function openGraphWindow(
  { graphKey, meta }: OpenArgs,
  parentWindow?: BrowserWindow,
) {
  // Always cache latest meta for this slot (used by ready-handshake)
  lastMeta[graphKey] = meta

  // Reuse existing window if it's alive
  let win = getGraphWin(graphKey)

  if (!win) {
    const windowOptions: Electron.BrowserWindowConstructorOptions = {
      width: 700,
      height: 350,
      frame: true,
      icon: path.join(process.env.VITE_PUBLIC!, "app_icon.ico"),
      show: false,
      backgroundColor: "#282c34",
      title: meta?.title ?? "Graph",
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

    win = new BrowserWindow(windowOptions)

    graphWins[graphKey] = win
    win.setMenuBarVisibility(false)

    // IMPORTANT: clean up reference when user closes window
    win.on("closed", () => {
      graphWins[graphKey] = undefined
      delete lastMeta[graphKey]
      // Tell the main window so Redux can untick the checkbox
      notifyMainGraphClosed(graphKey)
    })

    // Load content only on first creation
    if (VITE_DEV_SERVER_URL) {
      win.loadURL(VITE_DEV_SERVER_URL + "graphWindow.html")
    } else {
      win.loadFile(path.join(process.env.DIST!, "graphWindow.html"))
    }

    // Best-effort init on load (ready-handshake below is the real guarantee)
    win.webContents.once("did-finish-load", () => {
      const alive = getGraphWin(graphKey)
      if (!alive) return
      sendInit(graphKey)
    })
  } else {
    // Window already exists: just update title + init payload
    try {
      win.setTitle(meta?.title ?? "Graph")
      sendInit(graphKey)
    } catch (e) {
      // If it threw, treat it as dead and try again once
      graphWins[graphKey] = undefined
      return openGraphWindow({ graphKey, meta }, parentWindow)
    }
  }

  // Show/focus safely
  if (!win.isDestroyed()) {
    win.show()
    win.focus()
  }
}

export function closeGraphWindow({ graphKey }: CloseArgs) {
  const win = getGraphWin(graphKey)
  if (!win) return
  // Do NOT set undefined here — let the 'closed' event clean up.
  win.close()
}

export function destroyAllGraphWindows() {
  ;(Object.keys(graphWins) as GraphKey[]).forEach((k) => {
    const win = getGraphWin(k)
    win?.close()
  })
}

// Accept the main window so we can send close events back to Redux UI
export default function registerGraphWindowIPC(appWin?: BrowserWindow) {
  if (appWin) mainWin = appWin

  ipcMain.removeHandler("app:open-graph-window")
  ipcMain.removeHandler("app:close-graph-window")
  ipcMain.removeHandler("app:update-graph-windows")

  // READY HANDSHAKE:
  // popout renderer sends "app:graph-window:ready" after it registers listeners.
  // When we receive it, we send init using cached meta so init is never missed.
  ipcMain.removeAllListeners("app:graph-window:ready")
  ipcMain.on("app:graph-window:ready", (event) => {
    const senderId = event.sender.id

    const graphKey = (Object.keys(graphWins) as GraphKey[]).find((k) => {
      const w = getGraphWin(k)
      return w?.webContents?.id === senderId
    })

    if (!graphKey) return

    sendInit(graphKey)
  })

  ipcMain.handle("app:open-graph-window", (event, args: OpenArgs) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender)
    openGraphWindow(args, parentWindow || undefined)
  })

  ipcMain.handle("app:close-graph-window", (_event, args: CloseArgs) => {
    closeGraphWindow(args)
  })

  ipcMain.handle(
    "app:update-graph-windows",
    (_event, graphResults: GraphPoint[] | false) => {
      if (!graphResults) return

      for (const result of graphResults) {
        const win = getGraphWin(result.graphKey)
        if (!win) continue

        try {
          win.webContents.send("app:send-graph-point", result)
        } catch {
          // If it errors during close, drop it
          graphWins[result.graphKey] = undefined
          delete lastMeta[result.graphKey]
          // Also tell the main window, in case the close event races
          notifyMainGraphClosed(result.graphKey)
        }
      }
    },
  )
}
