import { contextBridge, ipcRenderer, webUtils } from "electron"

// --------- Expose some API to the Renderer process ---------
// Whitelist of allowed IPC channels for security
const ALLOWED_INVOKE_CHANNELS = [
  "fla:open-file",
  "fla:get-recent-logs",
  "fla:get-messages",
  "fla:get-message-data-for-table",
  "fla:save-params-to-file",
  "app:get-save-file-path",
  "app:save-file",
  "app:get-node-env",
  "app:get-version",
  "app:is-mac",
  "settings:fetch-settings",
  "settings:save-settings",
  "app:open-video-window",
  "app:close-video-window",
  "app:open-graph-window",
  "app:close-graph-window",
  "app:update-graph-windows",
  "app:start-rtsp-stream",
  "app:stop-rtsp-stream",
  "app:get-current-stream-url",
  "ffmpeg:get-binary-info",
  "ffmpeg:download-binary",
  "ffmpeg:delete-binary",
  "ffmpeg:check-binary-exists",
  "app:open-about-window",
  "app:close-about-window",
  "app:open-link-stats-window",
  "app:close-link-stats-window",
  "app:update-link-stats",
  "window:select-file-in-explorer",
  "app:update-ekf-status",
  "app:open-ekf-status-window",
  "app:open-elevation-graph-window",
  "app:close-elevation-graph-window",
  "app:update-elevation-graph",
  "app:update-vibe-status",
  "app:open-vibe-status-window",
  "params:load-params-from-file",
  "app:open-fla-params-window",
  "app:close-fla-params-window",
  "app:open-statustext-window",
  "app:close-statustext-window",
  "app:update-statustext",
  "checklist:open",
  "kml:import",
  "kml:list",
  "kml:delete",
]

const ALLOWED_SEND_CHANNELS = [
  "window:close",
  "window:minimise",
  "window:maximise",
  "window:reload",
  "window:force-reload",
  "window:toggle-developer-tools",
  "window:actual-size",
  "window:toggle-fullscreen",
  "window:zoom-in",
  "window:zoom-out",
  "window:open-file-in-explorer",
  "window:update-title",
  // drone state updates (connectedToDrone, isArmed, isFlying)
  "app:drone-state",
  "app:graph-window:ready",
  "app:elevation-graph:ready",
  "app:statustext-window:ready",
]

const ALLOWED_ON_CHANNELS = [
  "main-process-message",
  "app:video-closed",
  "app:stream-stopped",
  "app:send-link-stats",
  "fla:log-parse-progress",
  "app:send-ekf-status",
  "app:send-elevation-graph",
  "app:send-vibe-status",
  "settings:open",
  "mavlink-forwarding:open",
  "app:send-fla-params",
  "app:graph-window:init",
  "app:send-graph-point",
  "app:graph-window:closed",
  "app:send-statustext",
  "app:statustext-window-opened",
  "app:statustext-window-closed",
]

const ALLOWED_SEND_SYNC_CHANNELS = [
  "settings:fetch-settings-sync",
  "settings:save-setting-sync",
]

contextBridge.exposeInMainWorld("ipcRenderer", {
  sendSync: (channel, ...args) => {
    if (ALLOWED_SEND_SYNC_CHANNELS.includes(channel)) {
      return ipcRenderer.sendSync(channel, ...args)
    }
    throw new Error(`IPC sendSync channel '${channel}' is not allowed`)
  },

  // Secure invoke method - only allows whitelisted channels
  invoke: (channel, ...args) => {
    if (ALLOWED_INVOKE_CHANNELS.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args)
    }
    throw new Error(`IPC invoke channel '${channel}' is not allowed`)
  },

  // Secure send method - only allows whitelisted channels
  send: (channel, ...args) => {
    if (ALLOWED_SEND_CHANNELS.includes(channel)) {
      return ipcRenderer.send(channel, ...args)
    }
    throw new Error(`IPC send channel '${channel}' is not allowed`)
  },

  // Secure on method - only allows whitelisted channels
  on: (channel, callback) => {
    if (ALLOWED_ON_CHANNELS.includes(channel)) {
      return ipcRenderer.on(channel, callback)
    }
    throw new Error(`IPC on channel '${channel}' is not allowed`)
  },

  removeListener: (channel, callback) => {
    if (ALLOWED_ON_CHANNELS.includes(channel)) {
      return ipcRenderer.removeListener(channel, callback)
    }
    throw new Error(`IPC removeListener channel '${channel}' is not allowed`)
  },

  // Secure removeAllListeners - only for whitelisted channels
  removeAllListeners: (channel) => {
    if (ALLOWED_ON_CHANNELS.includes(channel)) {
      return ipcRenderer.removeAllListeners(channel)
    }
    throw new Error(
      `IPC removeAllListeners channel '${channel}' is not allowed`,
    )
  },

  // Get file path
  // TODO: Exposing a generic readFilePath(file) to all renderer
  // code increases the surface area for leaking full local file paths
  // (Electron docs recommend avoiding this when possible).
  // A safer pattern is to keep path resolution inside the preload and expose
  // a narrower, purpose-built API (e.g., validate extension in preload and
  // invoke fla:open-file from there, or return only a token/basename when feasible).
  getPathForFile(file) {
    return webUtils.getPathForFile(file)
  },
})

// --------- Preload scripts loading ---------
function domReady(condition = ["complete", "interactive"]) {
  return new Promise((resolve) => {
    if (condition.includes(document.readyState)) {
      resolve(true)
    } else {
      document.addEventListener("readystatechange", () => {
        if (condition.includes(document.readyState)) {
          resolve(true)
        }
      })
    }
  })
}

const safeDOM = {
  append(parent, child) {
    if (!Array.from(parent.children).find((e) => e === child)) {
      parent.appendChild(child)
    }
  },
  remove(parent, child) {
    if (Array.from(parent.children).find((e) => e === child)) {
      parent.removeChild(child)
    }
  },
}

/**
 * https://tobiasahlin.com/spinkit
 * https://connoratherton.com/loaders
 * https://projects.lukehaas.me/css-loaders
 * https://matejkustec.github.io/SpinThatShit
 */
function useLoading() {
  const className = `loaders-css__square-spin`
  const styleContent = `
@keyframes square-spin {
  25% { transform: perspective(100px) rotateX(180deg) rotateY(0); }
  50% { transform: perspective(100px) rotateX(180deg) rotateY(180deg); }
  75% { transform: perspective(100px) rotateX(0) rotateY(180deg); }
  100% { transform: perspective(100px) rotateX(0) rotateY(0); }
}
.${className} > div {
  animation-fill-mode: both;
  width: 50px;
  height: 50px;
  background: #fff;
  animation: square-spin 3s 0s cubic-bezier(0.09, 0.57, 0.49, 0.9) infinite;
}
.app-loading-wrap {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #282c34;
  z-index: 9;
}
    `
  const oStyle = document.createElement("style")
  const oDiv = document.createElement("div")

  oStyle.id = "app-loading-style"
  oStyle.innerHTML = styleContent
  oDiv.className = "app-loading-wrap"
  oDiv.innerHTML = `<div class="${className}"><div></div></div>`

  return {
    appendLoading() {
      safeDOM.append(document.head, oStyle)
      safeDOM.append(document.body, oDiv)
    },
    removeLoading() {
      safeDOM.remove(document.head, oStyle)
      safeDOM.remove(document.body, oDiv)
    },
  }
}

// ----------------------------------------------------------------------

// eslint-disable-next-line react-hooks/rules-of-hooks
const { appendLoading, removeLoading } = useLoading()
domReady().then(appendLoading)

window.onmessage = (ev) => {
  if (!ev || ev.data == null || typeof ev.data !== "object") {
    return
  }
  if (ev.data.payload === "removeLoading") {
    removeLoading()
  }
}

setTimeout(removeLoading, 4999)
