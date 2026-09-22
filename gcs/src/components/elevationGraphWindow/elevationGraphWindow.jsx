import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js"
import { useEffect, useMemo, useState } from "react"
import { Line } from "react-chartjs-2"

const MISSION_DATASET_LABEL = "Mission Elevation"
const TERRAIN_DATASET_LABEL = "Terrain"

const waypointLabelPlugin = {
  id: "waypointLabelPlugin",
  afterDatasetsDraw(chart) {
    const { ctx } = chart

    // Found by label rather than index, so the terrain dataset never gets
    // waypoint numbers drawn over it
    const datasetIndex = chart.data?.datasets?.findIndex(
      (dataset) => dataset.label === MISSION_DATASET_LABEL,
    )
    if (datasetIndex === undefined || datasetIndex < 0) return

    const datasetMeta = chart.getDatasetMeta(datasetIndex)
    const dataset = chart.data.datasets[datasetIndex]

    if (!datasetMeta || !dataset?.data) return

    ctx.save()
    ctx.font = "11px sans-serif"
    ctx.fillStyle = "#e2e8f0"
    ctx.textAlign = "left"
    ctx.textBaseline = "bottom"

    datasetMeta.data.forEach((element, index) => {
      const point = dataset.data[index]
      if (!point) return

      const label =
        point.waypointLabel ??
        (Number.isFinite(point.waypointSeq)
          ? `${point.waypointSeq}`
          : undefined)

      if (!label) return
      ctx.fillText(label, element.x + 6, element.y - 4)
    })

    ctx.restore()
  },
}

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  waypointLabelPlugin,
)

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  plugins: {
    legend: {
      display: true,
      position: "top",
      labels: {
        color: "#e2e8f0",
      },
    },
    tooltip: {
      callbacks: {
        title: () => "",
        label: (ctx) => {
          if (ctx.dataset?.label === TERRAIN_DATASET_LABEL) {
            return `Ground: ${ctx.parsed.y.toFixed(1)} m`
          }
          if (ctx.raw?.isHome) {
            return `Home: ${ctx.parsed.y.toFixed(2)} m`
          }
          const seq = ctx.raw?.waypointSeq
          return Number.isFinite(seq)
            ? `WP ${seq}: ${ctx.parsed.y.toFixed(2)} m`
            : `${ctx.parsed.y.toFixed(2)} m`
        },
      },
    },
  },
  scales: {
    x: {
      type: "linear",
      title: {
        display: true,
        text: "Distance (m)",
        color: "#e2e8f0",
      },
      ticks: {
        color: "#e2e8f0",
      },
      grid: {
        color: "rgba(148, 163, 184, 0.15)",
      },
    },
    y: {
      title: {
        display: true,
        text: "Altitude (m)",
        color: "#e2e8f0",
      },
      ticks: {
        color: "#e2e8f0",
      },
      grid: {
        color: "rgba(148, 163, 184, 0.15)",
      },
    },
  },
  elements: {
    line: {
      borderWidth: 2,
      tension: 0,
    },
    point: {
      radius: 4,
      hitRadius: 10,
    },
  },
}

export default function ElevationGraphWindow() {
  const [profile, setProfile] = useState({
    points: [],
    totalDistance: 0,
    warnings: [],
  })

  useEffect(() => {
    const handleUpdate = (_event, payload) => {
      setProfile(
        payload || {
          points: [],
          totalDistance: 0,
          warnings: [],
        },
      )
    }

    window.ipcRenderer.on("app:send-elevation-graph", handleUpdate)
    window.ipcRenderer.send("app:elevation-graph:ready")

    return () => {
      window.ipcRenderer.removeListener(
        "app:send-elevation-graph",
        handleUpdate,
      )
    }
  }, [])

  const chartData = useMemo(() => {
    const data = profile.points.map((point) => ({
      x: point.cumulativeDistance,
      y: point.altitude,
      waypointSeq: point.seq,
      waypointLabel: point.label,
      isHome: Boolean(point.isHome),
    }))

    const datasets = [
      {
        label: MISSION_DATASET_LABEL,
        data,
        borderColor: "#facc15",
        backgroundColor: "rgba(250, 204, 21, 0.35)",
        showLine: true,
        fill: false,
        order: 1,
      },
    ]

    const terrainData = (profile.terrainPoints || []).map((point) => ({
      x: point.cumulativeDistance,
      y: point.elevation,
    }))

    const hasUsableTerrain = terrainData.some((point) =>
      Number.isFinite(point.y),
    )

    if (terrainData.length >= 2 && hasUsableTerrain) {
      datasets.push({
        label: TERRAIN_DATASET_LABEL,
        data: terrainData,
        borderColor: "#a8a29e",
        backgroundColor: "rgba(87, 83, 78, 0.55)",
        fill: "start",
        pointRadius: 0,
        pointHitRadius: 0,
        borderWidth: 1.5,
        showLine: true,
        spanGaps: false,
        order: 2,
      })
    }

    return { datasets }
  }, [profile])

  const terrainMessage = useMemo(() => {
    switch (profile.terrainStatus) {
      case "loading":
        return "Terrain: loading…"
      case "no-api-key":
        return "Terrain unavailable — set a MapTiler API key in Settings"
      case "error":
        return "Terrain unavailable (offline or tile request failed)"
      case "disabled":
        return "Terrain: off"
      case "ready":
        return chartData.datasets.length > 1
          ? null
          : "Terrain: no elevation data for this area"
      default:
        // No status at all means the mission side never sent one
        return "Terrain: unavailable (no data received)"
    }
  }, [profile.terrainStatus, chartData])

  return (
    <div className="w-full h-full bg-falcongrey-800 text-slate-100 p-4 flex flex-col gap-3">
      <div className="flex flex-row justify-between items-center text-sm">
        <p className="font-semibold">Mission elevation profile</p>
        <div className="flex flex-row items-center gap-3">
          {terrainMessage && (
            <p className="text-slate-400 text-xs">{terrainMessage}</p>
          )}
          <p className="text-slate-300">
            Total distance: {Number(profile.totalDistance || 0).toFixed(2)} m
          </p>
        </div>
      </div>

      {profile.warnings?.length > 0 && (
        <div className="bg-yellow-950/40 border border-yellow-700 rounded px-3 py-2 text-yellow-200 text-xs">
          {profile.warnings.map((warning, idx) => (
            <p key={`${warning}-${idx}`}>{warning}</p>
          ))}
        </div>
      )}

      {profile.points.length === 0 ? (
        <div className="h-full flex items-center justify-center text-slate-400 text-sm border border-falcongrey-600 rounded">
          No NAV waypoints with altitude available for elevation graph.
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <Line options={chartOptions} data={chartData} />
        </div>
      )}
    </div>
  )
}
