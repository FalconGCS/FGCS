/*
This graph component is responsible for rendering the graph for FLA. It includes
a toolbar for different graph actions such as zooming and screenshotting, as well
as graph annotations to show events or different flight modes.
*/

// Base imports
import { useEffect, useMemo, useRef, useState } from "react"

// 3rd party imports
import "chartjs-adapter-moment"

import { ActionIcon, Button, Tooltip as MantineTooltip } from "@mantine/core"
import {
  IconCapture,
  IconCopy,
  IconZoomIn,
  IconZoomOut,
  IconZoomReset,
} from "@tabler/icons-react"
import {
  CategoryScale,
  Chart as ChartJS,
  Colors,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  TimeScale,
  Title,
  Tooltip,
} from "chart.js"
import { getRelativePosition } from "chart.js/helpers"
import annotationPlugin from "chartjs-plugin-annotation"
import zoomPlugin from "chartjs-plugin-zoom"
import createColormap from "colormap"
import { Line } from "react-chartjs-2"

// Redux imports
import { useDispatch, useSelector } from "react-redux"
import {
  selectAircraftType,
  selectCanSavePreset,
  selectCanShowMapPositionData,
  selectFile,
  selectFirmwareVersion,
  selectFlightModeMessages,
  selectLogEvents,
  selectMapPositionData,
  selectMessageFilters,
  selectParams,
  selectUtcAvailable,
  setCanSavePreset,
  setColorIndex,
  setCustomColors,
  setMessageFilters,
} from "../../redux/slices/logAnalyserSlice.js"

// Styling imports
import resolveConfig from "tailwindcss/resolveConfig"
import tailwindConfig from "../../../tailwind.config.js"

// Custom components and helpers
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels"
import {
  COPTER_MODES_FLIGHT_MODE_MAP,
  PLANE_MODES_FLIGHT_MODE_MAP,
} from "../../helpers/mavlinkConstants.js"
import {
  showErrorNotification,
  showSuccessNotification,
} from "../../helpers/notification.js"
import FlaMapSection from "./flaMap.jsx"
import { dataflashOptions, fgcsOptions } from "./graphConfigs.js"
import { hexToRgba } from "./utils.js"

// https://www.chartjs.org/docs/latest/configuration/canvas-background.html#color
// Note: changes to the plugin code is not reflected to the chart, because the plugin is loaded at chart construction time and editor changes only trigger an chart.update().
const customCanvasBackgroundColor = {
  id: "customCanvasBackgroundColor",
  beforeDraw: (chart) => {
    const { ctx } = chart
    ctx.save()
    ctx.globalCompositeOperation = "destination-over"
    ctx.fillStyle = tailwindColors.falcongrey[800]
    ctx.fillRect(0, 0, chart.width, chart.height)
    ctx.restore()
  },
}

ChartJS.register(
  CategoryScale,
  TimeScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Colors,
  zoomPlugin,
  customCanvasBackgroundColor,
  annotationPlugin,
)

const tailwindColors = resolveConfig(tailwindConfig).theme.colors

export default function Graph({ data, customColors, openPresetModal }) {
  // Redux state
  const dispatch = useDispatch()
  const messageFilters = useSelector(selectMessageFilters)
  const utcAvailable = useSelector(selectUtcAvailable)
  const events = useSelector(selectLogEvents)
  const flightModes = useSelector(selectFlightModeMessages)
  const canSavePreset = useSelector(selectCanSavePreset)
  const aircraftType = useSelector(selectAircraftType)
  const firmwareVersion = useSelector(selectFirmwareVersion)
  const params = useSelector(selectParams)
  const file = useSelector(selectFile)
  const fileName = file?.name
  const canShowMapPositionData = useSelector(selectCanShowMapPositionData)
  const mapPositionData = useSelector(selectMapPositionData)

  const [config, setConfig] = useState({
    ...(utcAvailable ? fgcsOptions : dataflashOptions),
  })
  const [showEvents, setShowEvents] = useState(false)
  const chartRef = useRef(null)
  const [showMap, setShowMap] = useState(false)
  const [hoverPosition, setHoverPosition] = useState(null)
  const hoverRafIdRef = useRef(null)
  const pendingMouseEventRef = useRef(null)
  const lastHoverBestTimeRef = useRef(null)

  // Create a stable key from dataset labels to detect actual data changes
  const datasetKey = useMemo(
    () => data.datasets.map((d) => d.label).join(","),
    [data.datasets],
  )

  // Build one sorted timeline of map points from GPS1 only so hover snaps to a
  // single source
  const mapTimeline = useMemo(() => {
    if (!mapPositionData) return []

    const getTimeValue = (point) => {
      const value = utcAvailable ? point.UtcTimeUS : point.TimeUS
      return typeof value === "number" && Number.isFinite(value) ? value : null
    }

    const timeline = []

    if (Array.isArray(mapPositionData.gps) && mapPositionData.gps.length > 0) {
      for (const point of mapPositionData.gps) {
        const time = getTimeValue(point)
        if (
          time === null ||
          typeof point.lat !== "number" ||
          typeof point.lon !== "number"
        ) {
          continue
        }

        timeline.push({
          time,
          lat: point.lat,
          lon: point.lon,
        })
      }
    }

    timeline.sort((a, b) => a.time - b.time)

    return timeline
  }, [mapPositionData, utcAvailable])

  const attTimeline = useMemo(() => {
    if (!mapPositionData || !Array.isArray(mapPositionData.att)) return []

    const timeline = []
    for (const point of mapPositionData.att) {
      const timeValue = utcAvailable ? point.UtcTimeUS : point.TimeUS
      if (
        typeof timeValue !== "number" ||
        !Number.isFinite(timeValue) ||
        typeof point.yaw !== "number" ||
        !Number.isFinite(point.yaw)
      ) {
        continue
      }
      timeline.push({ time: timeValue, yaw: point.yaw })
    }

    timeline.sort((a, b) => a.time - b.time)

    return timeline
  }, [mapPositionData, utcAvailable])

  // Binary search nearest map point to the hovered chart time.
  const findGpsPositionAtTime = useMemo(() => {
    return (timestamp) => {
      if (
        !Array.isArray(mapTimeline) ||
        mapTimeline.length === 0 ||
        typeof timestamp !== "number" ||
        !Number.isFinite(timestamp)
      ) {
        return null
      }

      let left = 0
      let right = mapTimeline.length

      while (left < right) {
        const mid = Math.floor((left + right) / 2)
        if (mapTimeline[mid].time < timestamp) {
          left = mid + 1
        } else {
          right = mid
        }
      }

      const candidates = []
      // Check the closest entries on both sides of the found index
      if (left < mapTimeline.length) candidates.push(mapTimeline[left])
      if (left > 0) candidates.push(mapTimeline[left - 1])

      if (candidates.length === 0) return null

      let best = candidates[0]
      let bestDiff = Math.abs(best.time - timestamp)

      // Iterate through candidates to find the closest one
      for (let i = 1; i < candidates.length; i++) {
        const candidate = candidates[i]
        const diff = Math.abs(candidate.time - timestamp)
        if (diff < bestDiff) {
          best = candidate
          bestDiff = diff
        }
      }

      return {
        lat: best.lat,
        lon: best.lon,
        time: best.time,
      }
    }
  }, [mapTimeline])

  // Binary search nearest attitude point to the hovered chart time to get yaw
  // for map hover
  const findYawAtTime = useMemo(() => {
    return (timestamp) => {
      if (
        !Array.isArray(attTimeline) ||
        attTimeline.length === 0 ||
        typeof timestamp !== "number" ||
        !Number.isFinite(timestamp)
      ) {
        return null
      }

      let left = 0
      let right = attTimeline.length

      while (left < right) {
        const mid = Math.floor((left + right) / 2)
        if (attTimeline[mid].time < timestamp) {
          left = mid + 1
        } else {
          right = mid
        }
      }

      const candidates = []
      // Check the closest entries on both sides of the found index
      if (left < attTimeline.length) candidates.push(attTimeline[left])
      if (left > 0) candidates.push(attTimeline[left - 1])
      if (candidates.length === 0) return null

      let best = candidates[0]
      let bestDiff = Math.abs(best.time - timestamp)
      // Iterate through candidates to find the closest one
      for (let i = 1; i < candidates.length; i++) {
        const candidate = candidates[i]
        const diff = Math.abs(candidate.time - timestamp)
        if (diff < bestDiff) {
          best = candidate
          bestDiff = diff
        }
      }

      return best.yaw
    }
  }, [attTimeline])

  function clearHoverPosition() {
    pendingMouseEventRef.current = null
    lastHoverBestTimeRef.current = null
    setHoverPosition((prev) => (prev === null ? prev : null))
  }

  function processPendingHover() {
    if (!chartRef.current || !showMap) {
      clearHoverPosition()
      return
    }

    const nativeEvent = pendingMouseEventRef.current
    if (!nativeEvent) return

    const chart = chartRef.current
    const position = getRelativePosition(nativeEvent, chart)
    const chartArea = chart.chartArea
    if (!position || !chartArea) return

    // Ignore hover events outside the chart plotting area.
    if (position.x < chartArea.left || position.x > chartArea.right) {
      clearHoverPosition()
      return
    }

    // Get the x scale (time scale or linear time axis)
    const xScale = chart.scales.x
    if (!xScale) return

    // Get the timestamp at the mouse position
    let timestamp = xScale.getValueForPixel(position.x)
    if (timestamp === null || timestamp === undefined) return

    // Keep the value in the same unit used by the chart data.
    // - UTC mode (time scale): milliseconds
    // - Dataflash mode (linear): microseconds
    if (timestamp instanceof Date) {
      timestamp = timestamp.getTime()
    }

    const gpsPosition = findGpsPositionAtTime(timestamp)
    if (!gpsPosition) {
      clearHoverPosition()
      return
    }

    // Skip state updates when the nearest point hasn't changed.
    if (lastHoverBestTimeRef.current === gpsPosition.time) {
      return
    }

    const yaw = findYawAtTime(timestamp)
    lastHoverBestTimeRef.current = gpsPosition.time
    setHoverPosition({
      ...gpsPosition,
      yaw,
      hoverTime: timestamp,
      deltaTime: Math.abs(gpsPosition.time - timestamp),
    })
  }

  function requestHoverUpdate() {
    if (hoverRafIdRef.current !== null) return

    hoverRafIdRef.current = window.requestAnimationFrame(() => {
      hoverRafIdRef.current = null
      processPendingHover()
    })
  }

  // Handle mouse move on chart to update hover position
  const handleChartMouseMove = (event) => {
    if (!showMap) return

    pendingMouseEventRef.current = event.nativeEvent
    requestHoverUpdate()
  }

  // Handle mouse leave to clear hover position
  const handleChartMouseLeave = () => {
    if (hoverRafIdRef.current !== null) {
      window.cancelAnimationFrame(hoverRafIdRef.current)
      hoverRafIdRef.current = null
    }
    clearHoverPosition()
  }

  useEffect(() => {
    return () => {
      if (hoverRafIdRef.current !== null) {
        window.cancelAnimationFrame(hoverRafIdRef.current)
      }
    }
  }, [])

  // Toggle show events without resetting zoom
  function toggleShowEvents() {
    const newShowEventsVal = !showEvents
    setShowEvents(newShowEventsVal)

    // Update annotations visibility directly on the chart instance
    if (chartRef.current) {
      const chart = chartRef.current
      const annotations = chart.options?.plugins?.annotation?.annotations

      if (annotations) {
        // Update display property for event annotations only
        Object.keys(annotations).forEach((key) => {
          const annotation = annotations[key]
          // Only update line annotations (events), not box annotations (flight modes)
          if (annotation.type === "line") {
            annotation.display = newShowEventsVal
            if (annotation.label) {
              annotation.label.display = newShowEventsVal
            }
          }
        })

        chart.update("none") // 'none' mode prevents animation and maintains zoom
      }
    }
  }

  // Apply custom colors to datasets without resetting zoom
  // Runs when customColors change or when the datasets change
  useEffect(() => {
    if (chartRef.current && customColors) {
      const chart = chartRef.current
      const datasets = chart.data.datasets

      // Update colors directly on the chart instance
      datasets.forEach((dataset) => {
        const color = customColors[dataset.label]
        if (color) {
          dataset.borderColor = color
          dataset.backgroundColor = hexToRgba(color, 0.5)
        }
      })

      // Only update if we actually have colors to apply
      if (Object.keys(customColors).length > 0) {
        chart.update("none") // 'none' mode prevents animation and maintains zoom
      }
    }
  }, [customColors, datasetKey])

  // Turn on/off all filters
  function clearFilters() {
    let newFilters = structuredClone(messageFilters)
    Object.keys(newFilters).forEach((categoryName) => {
      const category = newFilters[categoryName]
      Object.keys(category).forEach((fieldName) => {
        newFilters[categoryName][fieldName] = false
      })
    })
    dispatch(setMessageFilters(newFilters))
    dispatch(setCustomColors({}))
    dispatch(setColorIndex(0))
    dispatch(setCanSavePreset(false))
  }

  function downloadUpscaledImage(originalDataURI, wantedWidth, wantedHeight) {
    // https://stackoverflow.com/questions/20958078/resize-a-base-64-image-in-javascript-without-using-canvas
    // We create an image to receive the Data URI
    var img = document.createElement("img")

    // When the event "onload" is triggered we can resize the image.
    img.onload = function () {
      // We create a canvas and get its context.
      var canvas = document.createElement("canvas")
      var ctx = canvas.getContext("2d")

      // We set the dimensions at the wanted size.
      canvas.width = wantedWidth
      canvas.height = wantedHeight

      // We resize the image with the canvas method drawImage();
      ctx.drawImage(this, 0, 0, wantedWidth, wantedHeight)

      var upscaledDataUri = canvas.toDataURL()

      const link = document?.createElement("a")
      link.download = "graph.png"

      link.href = upscaledDataUri

      link.click()
    }

    // We put the Data URI in the image's src attribute
    img.src = originalDataURI
  }

  function downloadGraphAsImage() {
    const height = chartRef?.current?.height
    const width = chartRef?.current?.width
    downloadUpscaledImage(
      chartRef?.current?.toBase64Image(),
      width * 2,
      height * 2,
    )
  }

  function copyGraphToClipboard() {
    try {
      const height = chartRef?.current?.height
      const width = chartRef?.current?.width
      const wantedWidth = width * 2
      const wantedHeight = height * 2

      // https://stackoverflow.com/questions/20958078/resize-a-base-64-image-in-javascript-without-using-canvas
      // We create an image to receive the Data URI
      var img = document.createElement("img")

      // When the event "onload" is triggered we can resize the image.
      img.onload = function () {
        // We create a canvas and get its context.
        var canvas = document.createElement("canvas")
        var ctx = canvas.getContext("2d")

        // We set the dimensions at the wanted size.
        canvas.width = wantedWidth
        canvas.height = wantedHeight

        // We resize the image with the canvas method drawImage();
        ctx.drawImage(this, 0, 0, wantedWidth, wantedHeight)

        canvas.toBlob((blob) => {
          navigator.clipboard.write([
            new ClipboardItem({
              "image/png": blob,
            }),
          ])

          showSuccessNotification("Graph copied to clipboard")
        })
      }

      img.src = chartRef?.current?.toBase64Image()
    } catch (error) {
      showErrorNotification(error)
    }
  }

  function openParamsWindow() {
    try {
      if (!window || !window.ipcRenderer || !window.ipcRenderer.invoke) {
        showErrorNotification(
          "IPC renderer is not available to open the FLA Params Window.",
        )
        return
      }

      window.ipcRenderer.invoke("app:open-fla-params-window", {
        params,
        fileName,
        aircraftType,
        firmwareVersion,
      })
    } catch (error) {
      showErrorNotification(error)
    }
  }

  useEffect(() => {
    setConfig({ ...(utcAvailable ? fgcsOptions : dataflashOptions) })
  }, [utcAvailable])

  useEffect(() => {
    const annotations = []

    if (events !== null) {
      events.forEach((event) => {
        annotations.push({
          type: "line",
          mode: "vertical",
          scaleID: "x",
          value: event.time,
          borderColor: tailwindColors.red[500],
          borderWidth: 1,
          borderDash: [6, 6],
          borderDashOffset: 0,
          display: showEvents,
          label: {
            backgroundColor: tailwindColors.gray[800],
            content: event.message,
            display: showEvents,
            position: "start",
          },
        })
      })
    }

    if (flightModes?.length && data?.datasets?.length) {
      const colors = createColormap({
        colormap: "hsv",
        nshades: Math.max(11, flightModes.length), // HSV map requires at least 11 shades
        format: "rgbaString",
        alpha: 0.035,
      })
      const flightModeColorsMap = {}
      flightModes.forEach((flightMode, index) => {
        if (flightMode.name === "MODE") {
          if (flightMode.Mode in flightModeColorsMap) return

          flightModeColorsMap[flightMode.Mode] = colors[index]
        } else if (flightMode.name === "HEARTBEAT") {
          if (flightMode.custom_mode in flightModeColorsMap) return

          flightModeColorsMap[flightMode.custom_mode] = colors[index]
        }
      })

      // Create a box annotation to show the different flight modes
      for (let i = 0; i < flightModes.length; i++) {
        const flightMode = flightModes[i]
        const nextFlightMode = flightModes[i + 1]

        // Depending on log file, set different annotation config options
        var labelContent = ""
        var modeNumber = 0
        var xMax = "end"
        if (flightMode.name === "MODE") {
          modeNumber = flightMode.Mode
          if (aircraftType === "copter") {
            labelContent =
              COPTER_MODES_FLIGHT_MODE_MAP[modeNumber] || modeNumber
          } else {
            labelContent = PLANE_MODES_FLIGHT_MODE_MAP[modeNumber] || modeNumber
          }
        } else if (flightMode.name === "HEARTBEAT") {
          modeNumber = flightMode.custom_mode
          // Check if the aircraft type is a plane or copter to select the correct flight mode
          if (flightMode.type === 1) {
            labelContent = PLANE_MODES_FLIGHT_MODE_MAP[modeNumber] || modeNumber
          } else {
            labelContent =
              COPTER_MODES_FLIGHT_MODE_MAP[modeNumber] || modeNumber
          }
          xMax = flightModes[0].TimeUS
        }

        const backgroundColor = flightModeColorsMap[modeNumber]

        // https://stackoverflow.com/a/8179549/10077669
        const labelColor = backgroundColor.replace(/[^,]+(?=\))/, "1")

        // Get time values: use UtcTimeUS if available, otherwise TimeUS
        const getTimeValue = (mode) => {
          if (utcAvailable && mode.UtcTimeUS !== undefined) {
            return mode.UtcTimeUS
          }
          return mode.TimeUS
        }

        // Critical fix: Convert timestamp to Date object for time scale
        let xMinValue = getTimeValue(flightMode)
        let xMaxValue = xMax

        // Check if we're using a time scale
        const isTimeScale = config.scales?.x?.type === "time"

        // Convert timestamps to Date objects when using time scale
        if (isTimeScale) {
          xMinValue = new Date(xMinValue)

          // Handle xMax
          if (nextFlightMode !== undefined) {
            xMaxValue = new Date(getTimeValue(nextFlightMode))
          } else {
            // Stretch to the latest date
            let maxTime = 0
            data.datasets.forEach((dataset) => {
              dataset.data.forEach((point) => {
                if (point.x > maxTime) {
                  maxTime = point.x
                }
              })
            })
            const maxDate = new Date(maxTime)
            xMaxValue = maxDate
          }
        } else {
          // For non-time scales, handle next flight mode
          if (nextFlightMode !== undefined) {
            xMaxValue = getTimeValue(nextFlightMode)
          }
        }

        const flightModeChange = {
          type: "box",
          xScaleID: "x",
          yMin: "end",
          yMax: "start",
          xMin: xMinValue,
          xMax: xMaxValue,
          backgroundColor: backgroundColor,
          borderWidth: 0,
          display: true,
          z: -100,
          label: {
            backgroundColor: tailwindColors.gray[800],
            content: labelContent,
            display: true,
            position: { y: "end", x: "start" },
            color: labelColor,
          },
        }

        annotations.push(flightModeChange)
      }
    }

    const yAxisIDs = [
      ...new Set(data.datasets.map((dataset) => dataset.yAxisID)),
    ]
    const scales = {}

    if (yAxisIDs.length === 0) {
      scales.y = {
        grid: { color: tailwindColors.gray[500] },
      }
    }

    yAxisIDs.forEach((yAxisID, index) => {
      scales[yAxisID] = {
        position: "left", // Only on Left
        grid: {
          color: tailwindColors.gray[500],
          drawOnChartArea: index === 0, // Only draw grid lines for the first axis
        },
        title: {
          display: true,
          text: yAxisID,
        },
      }
    })

    scales.x = { ...config.scales.x }

    setConfig((prevConfig) => ({
      ...prevConfig,
      scales: {
        ...scales,
      },
      plugins: {
        ...prevConfig.plugins,
        annotation: {
          annotations: annotations,
        },
      },
    }))
  }, [events, flightModes, datasetKey])

  return (
    <div className="h-full flex flex-col">
      <PanelGroup direction="horizontal" className="flex-1 min-h-0">
        <Panel minSize={20}>
          <div
            className="chart-container relative cursor-crosshair h-full"
            onMouseMove={handleChartMouseMove}
            onMouseLeave={handleChartMouseLeave}
          >
            <Line ref={chartRef} options={config} data={data} />
          </div>
        </Panel>
        {showMap && (
          <>
            <PanelResizeHandle className='w-1 bg-falcongrey-700 hover:bg-falconred-500 data-[resize-handle-state="hover"]:bg-falconred-500 data-[resize-handle-state="drag"]:bg-falconred-500' />
            <Panel minSize={10}>
              <FlaMapSection hoverPosition={hoverPosition} />
            </Panel>
          </>
        )}
      </PanelGroup>
      <div className="flex flex-row gap-2 py-2 flex-shrink-0">
        <MantineTooltip label="Zoom in">
          <ActionIcon
            variant="filled"
            onClick={() => chartRef?.current?.zoom(1.5)}
            size={32}
          >
            <IconZoomIn size={18} />
          </ActionIcon>
        </MantineTooltip>
        <MantineTooltip label="Zoom out">
          <ActionIcon
            variant="filled"
            onClick={() => chartRef?.current?.zoom(0)}
            size={32}
          >
            <IconZoomOut size={18} />
          </ActionIcon>
        </MantineTooltip>
        <MantineTooltip label="Zoom reset">
          <ActionIcon
            size={32}
            variant="filled"
            onClick={chartRef?.current?.resetZoom}
          >
            <IconZoomReset size={18} />
          </ActionIcon>
        </MantineTooltip>
        <MantineTooltip label="Save graph as image">
          <ActionIcon size={32} variant="filled" onClick={downloadGraphAsImage}>
            <IconCapture size={18} />
          </ActionIcon>
        </MantineTooltip>
        <MantineTooltip label="Copy graph as image">
          <ActionIcon size={32} variant="filled" onClick={copyGraphToClipboard}>
            <IconCopy size={18} />
          </ActionIcon>
        </MantineTooltip>
        <MantineTooltip label="Clear Filters">
          <Button
            className="min-h-8 max-h-8"
            color={"red"}
            onClick={clearFilters}
          >
            Clear Filters
          </Button>
        </MantineTooltip>
        {canSavePreset && (
          <MantineTooltip label="Save Preset">
            <Button
              className="min-h-8 max-h-8"
              color={"green"}
              onClick={() => {
                openPresetModal()
              }}
            >
              Save Preset
            </Button>
          </MantineTooltip>
        )}
        {params !== null && (
          <MantineTooltip label="View Params">
            <Button className="min-h-8 max-h-8" onClick={openParamsWindow}>
              View Params
            </Button>
          </MantineTooltip>
        )}

        {canShowMapPositionData && (
          <MantineTooltip label={showMap ? "Hide Map" : "Show Map"}>
            <Button
              className="min-h-8 max-h-8"
              onClick={() => setShowMap(!showMap)}
            >
              {showMap ? "Hide Map" : "Show Map"}
            </Button>
          </MantineTooltip>
        )}

        <MantineTooltip label={showEvents ? "Hide events" : "Show events"}>
          <Button className="min-h-8 max-h-8" onClick={toggleShowEvents}>
            {showEvents ? "Hide events" : "Show events"}
          </Button>
        </MantineTooltip>
      </div>
    </div>
  )
}
