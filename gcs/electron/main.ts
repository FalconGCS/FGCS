import {
  BrowserWindow,
  Menu,
  MenuItemConstructorOptions,
  app,
  dialog,
  ipcMain,
  shell,
} from "electron"
import {
  ChildProcessWithoutNullStreams,
  spawn,
  spawnSync,
} from "node:child_process"
import { randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import packageInfo from "../package.json"

import openFile, {
  getMessageDataForTable,
  getMessages,
  getRecentFiles,
  saveParamsToFile,
} from "./fla"
import registerAboutIPC, {
  destroyAboutWindow,
  openAboutPopout,
} from "./modules/aboutWindow"
import registerEkfStatusIPC, {
  destroyEkfStatusWindow,
} from "./modules/ekfStatusWindow"
import registerElevationGraphIPC, {
  destroyElevationGraphWindow,
} from "./modules/elevationGraphWindow"
import registerFFmpegBinaryIPC from "./modules/ffmpegBinary"
import registerFlaParamsIPC, {
  destroyFlaParamsWindow,
} from "./modules/flaParamsWindow"
import registerGraphWindowIPC, {
  destroyAllGraphWindows,
} from "./modules/graphWindow"
import registerLinkStatsIPC, {
  destroyLinkStatsWindow,
  openLinkStatsWindow,
} from "./modules/linkStatsWindow"
import registerRTSPStreamIPC, {
  cleanupAllRTSPStreams,
} from "./modules/rtspStream"
import registerStatusTextWindowIPC, {
  destroyStatusTextWindow,
} from "./modules/statusTextWindow"
import registerVibeStatusIPC, {
  destroyVibeStatusWindow,
} from "./modules/vibeStatusWindow"
import registerVideoIPC, { destroyVideoWindow } from "./modules/videoWindow"
import createKmlFileManager from "./utils/kmlFileManager"
import { readParamsFile } from "./utils/paramsFile"

// Largest KML we're willing to read into memory
const MAX_KML_FILE_SIZE_BYTES = 25 * 1024 * 1024

// Check if required data files exist
function checkRequiredDataFiles(): {
  success: boolean
  missingFiles: string[]
} {
  interface ParamVersionManifest {
    vehicles?: Record<
      string,
      {
        versions?: string[]
        files?: Record<string, string>
      }
    >
  }

  const manifestPath = path.join(
    __dirname,
    "../data/gen_apm_params_versions.json",
  )

  const requiredFiles = [
    manifestPath,
    path.join(__dirname, "../data/gen_log_messages_desc_copter.json"),
    path.join(__dirname, "../data/gen_log_messages_desc_plane.json"),
  ]

  const missingFiles: string[] = []

  for (const filePath of requiredFiles) {
    if (!fs.existsSync(filePath)) {
      missingFiles.push(path.basename(filePath))
    }
  }

  if (fs.existsSync(manifestPath)) {
    try {
      const manifest: ParamVersionManifest = JSON.parse(
        fs.readFileSync(manifestPath, "utf-8"),
      )

      for (const aircraftType of ["plane", "copter"]) {
        const versions = manifest.vehicles?.[aircraftType]?.versions ?? []
        const fileMap = manifest.vehicles?.[aircraftType]?.files ?? {}

        if (versions.length === 0) {
          missingFiles.push(`${aircraftType} versions in manifest`)
          continue
        }

        for (const version of versions) {
          const fileName = fileMap[version]
          if (!fileName) {
            missingFiles.push(
              `${aircraftType} ${version} file mapping in manifest`,
            )
            continue
          }

          const filePath = path.join(__dirname, "../data", fileName)
          if (!fs.existsSync(filePath)) {
            missingFiles.push(fileName)
          }
        }
      }
    } catch {
      missingFiles.push(path.basename(manifestPath))
    }
  }

  return {
    success: missingFiles.length === 0,
    missingFiles,
  }
}

process.env.DIST = path.join(__dirname, "../dist")
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, "../public")

// Fix UI Scaling
app.commandLine.appendSwitch("high-dpi-support", "1")
app.commandLine.appendSwitch("force-device-scale-factor", "1")

// Fix linux WebGL error (icl chatgpt made this)
if (process.platform === "linux") {
  app.commandLine.appendSwitch("use-gl", "desktop") // force mesa
  app.commandLine.appendSwitch("ignore-gpu-blacklist") // allow iris, etc.
  app.commandLine.appendSwitch("enable-webgl")
  app.commandLine.appendSwitch("enable-webgl2-compute-context")
}

let win: BrowserWindow | null
let loadingWin: BrowserWindow | null
let isConnectedToDrone = false
let isArmed = false
let isFlying = false
let quittingApproved = false

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"]

let pythonBackend: ChildProcessWithoutNullStreams | null = null

// ===== Single Instance Lock =====
// Ensure only one instance of the application is running
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  // Another instance is already running; terminate immediately so no
  // additional initialization (windows/backend/ipc) can run in this process.
  app.exit(0)
  process.exit(0)
} else {
  // This is the primary instance
  app.on("second-instance", () => {
    // Someone tried to run a second instance, we should focus our window
    if (win) {
      if (win.isMinimized()) {
        win.restore()
      }
      win.focus()
    }
  })
}

function getWindow() {
  return BrowserWindow.getFocusedWindow()
}

// Settings logic

interface Settings {
  version: string
  settings: object
}

let userSettings: Settings | null = null

const STORE_OWNED_SETTING_KEYS = ["selectedDisplayTelemetry"]

// Merge incoming settings with store-owned settings
function withStoreOwnedSettings(incoming: Settings): Settings {
  if (userSettings === null) return incoming

  const storeOwned: Record<string, unknown> = {}
  for (const key of STORE_OWNED_SETTING_KEYS) {
    const currentValue = (userSettings.settings as Record<string, unknown>)[key]
    if (currentValue !== undefined) {
      storeOwned[key] = currentValue
    }
  }

  return {
    ...incoming,
    settings: { ...incoming.settings, ...storeOwned },
  }
}

function saveUserConfiguration(settings: Settings) {
  userSettings = settings
  fs.writeFileSync(
    path.join(app.getPath("userData"), "settings.json"),
    JSON.stringify(userSettings, null, 2),
    "utf-8",
  )
}

/**
 * Checks the application version within the loaded user settings and updates if it is outdated
 * @param configPath The path to the configuration file
 * @returns
 */
function checkAppVersion(configPath: string) {
  if (userSettings === null) {
    console.warn(
      "Attempting to check app version when user settings have not been loaded",
    )
    return
  }

  if (userSettings.version == app.getVersion()) return

  userSettings.version = app.getVersion()
  fs.writeFileSync(configPath, JSON.stringify(userSettings))
}

/**
 * Called when the application requests user settings
 *
 * @returns
 */
function getUserConfiguration() {
  // Return the already loaded user settings if loaded
  console.log("Fetching user settings!")
  if (userSettings !== null) return userSettings

  // Directories
  const userDir = app.getPath("userData")
  const config = path.join(userDir, "settings.json")

  // Write version and blank settings to user config if doesn't exist
  if (!fs.existsSync(config)) {
    console.log("Generating user settings")
    userSettings = { version: app.getVersion(), settings: {} }
    fs.writeFileSync(config, JSON.stringify(userSettings))
  } else {
    console.log("Reading user settings from config file " + config)
    userSettings = JSON.parse(fs.readFileSync(config, "utf-8"))
    checkAppVersion(config)
  }
  return userSettings
}

ipcMain.handle("settings:fetch-settings", () => {
  return getUserConfiguration()
})
ipcMain.handle("settings:save-settings", (_, settings) => {
  saveUserConfiguration(withStoreOwnedSettings(settings))
})

ipcMain.on("settings:fetch-settings-sync", (event) => {
  try {
    event.returnValue = getUserConfiguration()
  } catch (error) {
    console.error("Failed to read user settings synchronously", error)
    event.returnValue = null
  }
})

ipcMain.on("settings:save-setting-sync", (event, key, value) => {
  try {
    const currentSettings = getUserConfiguration()
    if (currentSettings === null) {
      event.returnValue = false
      return
    }

    saveUserConfiguration({
      ...currentSettings,
      settings: { ...currentSettings.settings, [key]: value },
    })
    event.returnValue = true
  } catch (error) {
    console.error(`Failed to save setting '${key}'`, error)
    event.returnValue = false
  }
})

// Cache connection state from renderer
ipcMain.on("app:drone-state", (_event, obj) => {
  isConnectedToDrone = Boolean(obj.connectedToDrone)
  isArmed = Boolean(obj.isArmed)
  isFlying = Boolean(obj.isFlying)
})

ipcMain.handle("app:is-mac", () => {
  return process.platform == "darwin"
})
ipcMain.on("window:close", () => {
  closeWithBackend()
})
ipcMain.on("window:minimise", () => {
  getWindow()?.minimize()
})
ipcMain.on("window:maximise", () => {
  getWindow()?.isMaximized()
    ? getWindow()?.unmaximize()
    : getWindow()?.maximize()
})

ipcMain.on("window:reload", () => {
  getWindow()?.reload()
})
ipcMain.on("window:force-reload", () => {
  getWindow()?.webContents.reloadIgnoringCache()
})
ipcMain.on("window:toggle-developer-tools", () => {
  getWindow()?.webContents.toggleDevTools()
})
ipcMain.on("window:actual-size", () => {
  getWindow()?.webContents.setZoomFactor(1)
})
ipcMain.on("window:toggle-fullscreen", () => {
  getWindow()?.isFullScreen()
    ? getWindow()?.setFullScreen(false)
    : getWindow()?.setFullScreen(true)
})
ipcMain.on("window:zoom-in", () => {
  const window = getWindow()?.webContents
  window?.setZoomFactor(window?.getZoomFactor() + 0.1)
})
ipcMain.on("window:zoom-out", () => {
  const window = getWindow()?.webContents
  window?.setZoomFactor(window?.getZoomFactor() - 0.1)
})

ipcMain.on("window:open-file-in-explorer", (_event, filePath) => {
  shell.showItemInFolder(filePath)
})
ipcMain.handle("window:select-file-in-explorer", async (_event, filters) => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [...filters, { name: "All Files", extensions: ["*"] }],
  })
  if (!canceled && filePaths.length > 0) {
    const filePath = filePaths[0]
    try {
      const stats = fs.statSync(filePath)
      return {
        success: true,
        path: filePath,
        name: path.basename(filePath),
        size: stats.size,
      }
    } catch (err) {
      return {
        success: false,
        message:
          err instanceof Error
            ? err.message
            : "File is inaccessible or deleted",
      }
    }
  }
  return null
})
ipcMain.on("window:update-title", async (_event, value) => {
  getWindow()?.setTitle(value)
})

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, "app_icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: true,
    },
    title: "FGCS",
    show: false,
    alwaysOnTop: true,
    minWidth: 750,
    minHeight: 500,
    titleBarStyle: "hidden",
    frame: false,
  })

  registerVideoIPC(win)
  registerAboutIPC()
  registerLinkStatsIPC()
  registerEkfStatusIPC()
  registerElevationGraphIPC()
  registerVibeStatusIPC()
  registerStatusTextWindowIPC(win)
  registerFFmpegBinaryIPC()
  registerRTSPStreamIPC(win)
  registerFlaParamsIPC()
  registerGraphWindowIPC(win)

  // Open links in browser, not within the electron window.
  // Note, links must have target="_blank"
  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)

    return { action: "deny" }
  })

  // Test active push message to Renderer-process.
  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("main-process-message", new Date().toLocaleString())
    win?.webContents.setZoomFactor(1.0)
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(process.env.DIST, "index.html"))
  }

  // Swap to main window when ready
  win.once("ready-to-show", () => {
    loadingWin?.destroy()
    win?.maximize()
    // Window starts always on top so it opens even if loading window is hid
    win?.setAlwaysOnTop(false)
  })

  win.on("close", () => {
    closeWithBackend()
  })

  // Listen for key events to trigger hard refresh
  win.webContents.on("before-input-event", (event, input) => {
    const controlKeyPressed =
      process.platform === "darwin" ? input.meta : input.control

    if (controlKeyPressed && input.key === "r") {
      event.preventDefault() // Prevent default refresh
      win?.webContents.reloadIgnoringCache() // Perform hard refresh
    }
  })

  // Set Main Menu on Mac Only
  if (process.platform === "darwin") {
    setMainMenu()
  }
}

// For Mac only
function setMainMenu() {
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        {
          label: "About FGCS",
          click: () => {
            openAboutPopout()
          },
        },
        {
          label: "Settings",
          accelerator: "Cmd+,",
          click: () => {
            win?.webContents.send("settings:open")
          },
        },
        { type: "separator" },
        {
          label: "Report a bug",
          click: async () => {
            await shell.openExternal(packageInfo.bugs.url)
          },
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Advanced",
      submenu: [
        {
          label: "Connection Stats",
          click: () => {
            openLinkStatsWindow()
          },
        },
        {
          label: "MAVLink Forwarding",
          click: () => {
            win?.webContents.send("mavlink-forwarding:open")
          },
        },
      ],
    },
  ]
  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

function createLoadingWindow() {
  loadingWin = new BrowserWindow({
    frame: false,
    transparent: true,
    center: true,
  })

  // Resize and center window
  loadingWin.loadFile(
    path.join(process.env.VITE_PUBLIC, "window_loading_icon.svg"),
  )
  loadingWin.setSize(300, 300, true)
  loadingWin.center()
}

function startBackend() {
  if (pythonBackend) {
    console.log("Backend already running")
    return
  }

  console.log("Starting backend")

  // Add more platforms here
  const backendPaths: Partial<Record<NodeJS.Platform, string>> = {
    win32: "extras/fgcs_backend.exe",
    darwin: path.join(
      process.resourcesPath,
      "../extras",
      "fgcs_backend.app",
      "Contents",
      "MacOS",
      "fgcs_backend",
    ),
  }

  const backendPath = backendPaths[process.platform]

  if (!backendPath) {
    console.error("Unsupported platform!")
    return
  }

  console.log(`Starting backend: ${backendPath}`)
  pythonBackend = spawn(backendPath)

  // pythonBackend.stdout.on('data', (data) => console.log(`Backend stdout: ${data}`));
  // pythonBackend.stderr.on('data', (data) => console.error(`Backend stderr: ${data}`));

  pythonBackend.on("close", (code) => {
    console.log(`Backend process exited with code ${code}`)
    pythonBackend = null
  })

  pythonBackend.on("error", (error) => {
    console.error("Failed to start backend:", error)
    dialog.showErrorBox(
      "Backend Error",
      `Failed to start backend: ${error.message}`,
    )
  })
}

function closeWindows() {
  destroyVideoWindow()
  destroyAboutWindow()
  destroyLinkStatsWindow()
  destroyEkfStatusWindow()
  destroyElevationGraphWindow()
  destroyVibeStatusWindow()
  destroyStatusTextWindow()
  cleanupAllRTSPStreams()
  destroyFlaParamsWindow()
  destroyAllGraphWindows()
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
function closeWithBackend() {
  // Always close all popout windows first
  closeWindows()
  console.log("Killing backend")
  // kill any processes with the name "fgcs_backend.exe"
  // Windows
  spawn("taskkill /f /im fgcs_backend.exe", { shell: true })
  if (process.platform !== "darwin") {
    app.quit()
    win = null
  }
}

app.on("window-all-closed", () => {
  closeWithBackend()
})

function getExitMessage() {
  if (isFlying) {
    return "The aircraft is currently flying."
  } else if (isArmed) {
    return "The aircraft is currently armed."
  } else {
    return "You are connected to an aircraft."
  }
}

// To ensure that the backend process is killed with Cmd + Q on macOS,
// listen to the before-quit event.
app.on("before-quit", (e) => {
  if (process.platform !== "darwin") return

  // User already approved, let it proceed without re-prompting
  if (quittingApproved) return

  if (isConnectedToDrone && win && !win.isDestroyed()) {
    e.preventDefault()
    const choice = dialog.showMessageBoxSync(win, {
      type: "warning",
      buttons: ["Cancel", "Quit"],
      defaultId: 0,
      title: "Confirm Quit",
      message: "Are you sure you want to quit FGCS?",
      detail: getExitMessage(),
    })
    if (choice === 1) {
      quittingApproved = true
      if (pythonBackend) {
        console.log("Stopping backend")
        spawnSync("pkill", ["-f", "fgcs_backend"])
        pythonBackend = null
      }
      // Close all popout windows
      closeWindows()
      // Destroy main window
      if (win && !win.isDestroyed()) {
        win.destroy()
      }
      app.quit()
    }
    // choice === 0 (Cancel): do nothing, quit is prevented
  } else {
    // Not connected or no window: stop backend and proceed
    if (pythonBackend) {
      console.log("Stopping backend")
      spawnSync("pkill", ["-f", "fgcs_backend"])
      pythonBackend = null
      closeWindows()
    }
  }
})

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  // In development, ensure required data files exist before starting the app.
  // In production (packaged app), JSON data is bundled, so raw file checks
  // can be invalid and are therefore skipped.
  if (!app.isPackaged) {
    const fileCheck = checkRequiredDataFiles()
    if (!fileCheck.success) {
      dialog.showErrorBox(
        "Missing Required Files",
        `The following required data files are missing:\n\n${fileCheck.missingFiles.join("\n")}\n\n` +
          `Please run the following commands from the data directory within the 'gcs' folder:\n` +
          `  python generate_param_definitions.py\n` +
          `  python generate_log_message_descriptions.py\n\n` +
          `Then restart the application.`,
      )
      app.quit()
      return
    }
  }

  createLoadingWindow()
  // Open file and Get Recent Logs
  ipcMain.handle("fla:open-file", openFile)
  ipcMain.handle("fla:get-recent-logs", async () => {
    try {
      const recentLogs = getRecentFiles()
      if (!Array.isArray(recentLogs)) {
        throw new Error(
          `Expected recentLogs to be an array, but got ${typeof recentLogs}`,
        )
      }
      return recentLogs
        .map((log) => {
          try {
            const logName = path.basename(log.path)
            const fileStats = fs.statSync(log.path)
            return {
              name: logName,
              path: log.path,
              size: fileStats.size,
              timestamp: new Date(log.timestamp),
            }
          } catch {
            return null
          }
        })
        .filter((log) => log !== null)
    } catch (error) {
      return []
    }
  })

  // Load Messages on demand
  ipcMain.handle("fla:get-messages", getMessages)

  // Get message data for table
  ipcMain.handle("fla:get-message-data-for-table", getMessageDataForTable)

  // Save FLA params to file
  ipcMain.handle("fla:save-params-to-file", saveParamsToFile)

  // Open native save dialog
  ipcMain.handle("app:get-save-file-path", async (event, options) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) {
      throw new Error("No active window found")
    }
    const result = await dialog.showSaveDialog(window, options)
    return result
  })

  ipcMain.handle(
    "app:save-file",
    async (
      _event,
      { filePath, content }: { filePath: string; content: number[] },
    ) => {
      try {
        // Convert number array to Buffer for fs.writeFileSync
        const buffer = Buffer.from(content)
        fs.writeFileSync(filePath, buffer as unknown as string)
        return { success: true }
      } catch (err) {
        console.error("Error saving file:", err)
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        }
      }
    },
  )

  ipcMain.handle("params:load-params-from-file", async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) {
      throw new Error("No active window found")
    }

    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        { name: "Param File", extensions: ["param"] },
        { name: "All Files", extensions: ["*"] },
      ],
    })

    if (!canceled && filePaths.length > 0) {
      const filePath = filePaths[0]
      try {
        const params = readParamsFile(filePath)
        return {
          success: true,
          path: filePath,
          name: path.basename(filePath),
          params: params,
        }
      } catch (err) {
        console.error("Error reading param file:", err)
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        }
      }
    }

    return null
  })

  ipcMain.handle("app:get-node-env", () =>
    app.isPackaged ? "production" : "development",
  )
  ipcMain.handle("app:get-version", () => app.getVersion())

  ipcMain.handle("checklist:open", async () => {
    const window = BrowserWindow.getFocusedWindow()
    if (!window) {
      throw new Error("No active window found")
    }

    const { canceled, filePaths } = await dialog.showOpenDialog(window, {
      properties: ["openFile"],
      filters: [{ name: "Checklist files", extensions: ["checklist", "txt"] }],
    })

    if (!canceled && filePaths.length > 0) {
      const filePath = filePaths[0]
      try {
        const fileContents = fs.readFileSync(filePath, "utf-8")
        return {
          success: true,
          file: {
            path: filePath,
            contents: fileContents,
          },
        }
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        }
      }
    }

    return {
      success: false,
      error: "No file selected",
    }
  })

  const kmlFileManager = createKmlFileManager()

  ipcMain.handle("kml:import", async () => {
    const window = BrowserWindow.getFocusedWindow()
    if (!window) {
      throw new Error("No active window found")
    }

    const { canceled, filePaths } = await dialog.showOpenDialog(window, {
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "KML files", extensions: ["kml"] }],
    })

    if (canceled || filePaths.length === 0) {
      return {
        success: false,
        error: "No file selected",
      }
    }

    // A failure on one file shouldn't abort the whole import, so collect the
    // errors and let the renderer report them alongside the successes
    const layers = []
    const errors = []

    for (const filePath of filePaths) {
      const name = path.basename(filePath)
      try {
        const stats = fs.statSync(filePath)
        if (stats.size > MAX_KML_FILE_SIZE_BYTES) {
          errors.push({
            name,
            error: `File is too large (${Math.round(stats.size / 1e6)} MB)`,
          })
          continue
        }

        const contents = await fs.promises.readFile(filePath, "utf-8")
        const entry = await kmlFileManager.addKmlFile(
          randomUUID(),
          filePath,
          contents,
        )
        layers.push({ ...entry, contents })
      } catch (err) {
        errors.push({
          name,
          error: err instanceof Error ? err.message : "Unknown error",
        })
      }
    }

    return {
      success: layers.length > 0,
      layers,
      errors,
      error: layers.length > 0 ? undefined : "No readable KML files selected",
    }
  })

  ipcMain.handle("kml:list", async () => {
    try {
      return { success: true, layers: await kmlFileManager.getKmlFiles() }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }
    }
  })

  ipcMain.handle("kml:delete", async (_event, id: string) => {
    try {
      return { success: kmlFileManager.deleteKmlFile(id) }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }
    }
  })

  if (app.isPackaged && pythonBackend === null) {
    startBackend()
  }

  // Load user settings
  createWindow()
})
