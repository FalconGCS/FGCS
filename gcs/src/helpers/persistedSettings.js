// Persists settings to disk via the main process, and reads them back

function hasSyncIpc() {
  return (
    typeof window !== "undefined" &&
    typeof window.ipcRenderer?.sendSync === "function"
  )
}

export function readSettingsSync() {
  if (!hasSyncIpc()) {
    return { readable: false, settings: {} }
  }

  try {
    const stored = window.ipcRenderer.sendSync("settings:fetch-settings-sync")
    if (stored === null || typeof stored !== "object") {
      return { readable: false, settings: {} }
    }

    const settings =
      stored.settings !== null && typeof stored.settings === "object"
        ? stored.settings
        : {}

    return { readable: true, settings }
  } catch (error) {
    console.error("Failed to read settings synchronously", error)
    return { readable: false, settings: {} }
  }
}

export function writeSettingSync(key, value) {
  if (!hasSyncIpc()) {
    return false
  }

  try {
    return (
      window.ipcRenderer.sendSync("settings:save-setting-sync", key, value) ===
      true
    )
  } catch (error) {
    console.error(`Failed to save setting '${key}'`, error)
    return false
  }
}
