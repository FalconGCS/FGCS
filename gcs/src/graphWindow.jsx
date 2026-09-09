import "./css/index.css"
import "./css/resizable.css"

import React from "react"
import ReactDOM from "react-dom/client"
import { useEffect, useRef, useState } from "react"

import RealtimeGraph from "./components/realtimeGraph.jsx"

import resolveConfig from "tailwindcss/resolveConfig"
import tailwindConfig from "../tailwind.config.js"
const tailwindColors = resolveConfig(tailwindConfig).theme.colors

const SLOT_COLORS = {
  graph_a: tailwindColors.sky[400],
  graph_b: tailwindColors.pink[400],
  graph_c: tailwindColors.orange[400],
  graph_d: tailwindColors.green[400],
}

export default function GraphWindowApp() {
  const sentReadyRef = useRef(false)
  const graphRef = useRef(null)

  // store current slot safely without causing re-registers
  const activeGraphKeyRef = useRef(null)

  const [meta, setMeta] = useState(null)

  useEffect(() => {
    if (!window.ipcRenderer) {
      console.error("ipcRenderer not available in this window")
      return
    }

    const handleInit = (_event, payload) => {
      if (!payload) return

      setMeta(payload)
      activeGraphKeyRef.current = payload.graphKey

      // clear data on init
      const ds = graphRef.current?.data?.datasets?.[0]
      if (ds) {
        ds.data = []
        graphRef.current.update("none")
      }
    }

    const handlePoint = (_event, result) => {
      if (!result) return
      if (!graphRef.current?.data?.datasets?.[0]) return

      const myKey = activeGraphKeyRef.current
      if (!myKey) return
      if (result.graphKey !== myKey) return

      const y = Number(result.data?.y)
      if (!Number.isFinite(y)) return

      graphRef.current.data.datasets[0].data.push({ x: Date.now(), y })
      graphRef.current.update("none")
    }

    window.ipcRenderer.on("app:graph-window:init", handleInit)
    window.ipcRenderer.on("app:send-graph-point", handlePoint)

    // tell main we are ready *after* listeners exist
    if (!sentReadyRef.current) {
      window.ipcRenderer.send("app:graph-window:ready")
      window.postMessage({ payload: "removeLoading" }, "*")
      sentReadyRef.current = true
    }

    return () => {
      window.ipcRenderer.removeListener("app:graph-window:init", handleInit)
      window.ipcRenderer.removeListener("app:send-graph-point", handlePoint)
    }
  }, [])

  const graphKey = meta?.graphKey
  const m = meta?.meta

  const label = m?.label ?? m?.id ?? "Graph"
  const lineColor = graphKey ? SLOT_COLORS[graphKey] : tailwindColors.sky[400]

  return (
    <div className="w-full h-full bg-falcongrey-800 p-4 flex flex-col">
      <div className="flex-1 min-h-0">
        <RealtimeGraph
          ref={graphRef}
          datasetLabel={label}
          lineColor={lineColor}
        />
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <GraphWindowApp />
  </React.StrictMode>,
)
