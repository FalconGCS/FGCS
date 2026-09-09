import react from "@vitejs/plugin-react"
import path, { resolve } from "node:path"
import { defineConfig } from "vite"
import electron from "vite-plugin-electron/simple"
import { findAvailablePort } from "./electron/utils/portDetection"

// https://vitejs.dev/config/
export default defineConfig(async () => {
  // Find an available port, starting from the default 5173
  const port = await findAvailablePort(5173)
  console.log(`VITE dev server will run on port ${port}`)

  return {
    plugins: [
      react(),
      electron({
        main: {
          // Shortcut of `build.lib.entry`.
          entry: "electron/main.ts",
        },
        preload: {
          // Shortcut of `build.rollupOptions.input`.
          // Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
          input: path.join(__dirname, "electron/preload.js"),
        },
        // Ployfill the Electron and Node.js built-in modules for Renderer process.
        // See 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
        renderer: {},
      }),
    ],
    server: {
      port,
    },
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, "index.html"),
          linkStats: resolve(__dirname, "linkStats.html"),
          aboutWindow: resolve(__dirname, "aboutWindow.html"),
          videoWindow: resolve(__dirname, "videoWindow.html"),
          ekfStatus: resolve(__dirname, "ekfStatus.html"),
          elevationGraph: resolve(__dirname, "elevationGraph.html"),
          vibeStatus: resolve(__dirname, "vibeStatus.html"),
          flaParams: resolve(__dirname, "flaParams.html"),
          graphWindow: resolve(__dirname, "graphWindow.html"),
          statusTextWindow: resolve(__dirname, "statusTextWindow.html"),
        },
      },
    },
  }
})
