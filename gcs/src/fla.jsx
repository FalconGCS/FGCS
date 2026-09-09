/*
  Falcon Log Analyser. This is a custom log analyser written to handle MavLink log files (.log) as well as FGCS telemetry log files (.ftlog).

  This allows users to toggle all messages on/off, look at preset message groups, save message groups, and follow the drone in 3D.
*/

// Base imports
import { useEffect, useMemo } from "react"

// 3rd Party Imports
import { useDispatch, useSelector } from "react-redux"

// Custom components and helpers
import { PRELOAD_LABELS } from "./components/fla/constants.js"
import { logEventIds } from "./components/fla/logEventIds.js"

import SelectFlightLog from "./components/fla/SelectFlightLog.jsx"
import MainDisplay from "./components/fla/mainDisplay.jsx"
import Layout from "./components/layout.jsx"
import { showErrorNotification } from "./helpers/notification.js"
import {
  selectBaseChartData,
  selectCustomColors,
  selectMessageFilters,
  selectPersistentColorMap,
  // Selectors
  setAircraftType,
  setBaseChartData,
  setCanSavePreset,
  setColorIndex,
  setCustomColors,
  setFile,
  setFirmwareVersion,
  setFlightModeMessages,
  setFormatMessages,
  setLogEvents,
  setLogMessages,
  setLogType,
  setMapPositionData,
  setMessageFilters,
  setMessageMeans,
  setParams,
  setUtcAvailable,
} from "./redux/slices/logAnalyserSlice.js"

export default function FLA() {
  // Redux
  const dispatch = useDispatch()
  const messageFilters = useSelector(selectMessageFilters)
  const customColors = useSelector(selectCustomColors)
  const persistentColorMap = useSelector(selectPersistentColorMap)
  const baseChartData = useSelector(selectBaseChartData)

  /**
   * Dispatch the lightweight summary info to Redux
   */
  async function getLogSummary(result) {
    const { summary } = result
    if (!summary) {
      showErrorNotification("Error loading file, no summary found.")
      return
    }
    dispatch(setFirmwareVersion(summary.firmwareVersion))
    dispatch(setLogType(summary.logType))
    dispatch(setAircraftType(summary.aircraftType))
    dispatch(setFormatMessages(summary.formatMessages))
    dispatch(setFlightModeMessages(summary.flightModeMessages))
    dispatch(setUtcAvailable(summary.utcAvailable))
    dispatch(setMessageFilters(summary.messageFilters))
    dispatch(setMessageMeans(summary.messageMeans))
    dispatch(
      setLogEvents(
        summary.logEvents.map((event) => ({
          // If UTC is available, use UtcTimeUS, otherwise TimeUS
          time:
            summary.utcAvailable && event.UtcTimeUS !== undefined
              ? event.UtcTimeUS
              : event.TimeUS,
          message: logEventIds[event.Id],
        })),
      ),
    )
    dispatch(setParams(summary.params))
    dispatch(setMapPositionData(summary.mapPositionData))
    dispatch(setBaseChartData([]))
    // Fire off preload in the background without blocking
    const labelsToPreload = PRELOAD_LABELS[summary.logType]
    if (labelsToPreload && labelsToPreload.length > 0) {
      setTimeout(() => fetchData(labelsToPreload), 0)
    }
  }

  // Close file
  function closeLogFile() {
    dispatch(setFile(null))
    dispatch(setLogMessages(null))
    dispatch(setMessageFilters(null))
    dispatch(setCustomColors({}))
    dispatch(setUtcAvailable(false))
    dispatch(setColorIndex(0))
    dispatch(setLogEvents(null))
    dispatch(setLogType("dataflash"))
    dispatch(setCanSavePreset(false))
    dispatch(setBaseChartData([]))
    dispatch(setParams(null))
    dispatch(setMapPositionData(null))
  }

  async function fetchData(labelsToFetch) {
    const newDatasets = await window.ipcRenderer.invoke(
      "fla:get-messages",
      labelsToFetch,
    )
    // Unpack and Cache
    if (Array.isArray(newDatasets) && newDatasets.length > 0) {
      const transformed = newDatasets.map((ds) => {
        if (Array.isArray(ds?.data)) return ds
        const len = Math.min(ds.x.length, ds.y.length)
        const points = new Array(len)
        for (let i = 0; i < len; i++) {
          points[i] = { x: ds.x[i], y: ds.y[i] }
        }
        return { label: ds.label, yAxisID: ds.yAxisID, data: points }
      })
      // Deduplicate by label: new datasets override old ones
      const existing = baseChartData || []
      const newLabels = new Set(transformed.map((ds) => ds.label))
      const filteredExisting = existing.filter((ds) => !newLabels.has(ds.label))
      dispatch(setBaseChartData([...filteredExisting, ...transformed]))
    }
  }

  // Step 1: Memoize the calculation of which labels are currently requested.
  // This loop only runs when `messageFilters` changes.
  const requestedLabels = useMemo(() => {
    if (!messageFilters) return new Set()

    const labels = new Set()
    Object.keys(messageFilters).forEach((categoryName) => {
      const category = messageFilters[categoryName]
      Object.keys(category).forEach((fieldName) => {
        if (category[fieldName]) {
          labels.add(`${categoryName}/${fieldName}`)
        }
      })
    })
    return labels
  }, [messageFilters])

  // Step 2: A dedicated effect for fetching missing data.
  // This only runs if the set of requestedLabels changes.
  useEffect(() => {
    const cachedLabels = new Set((baseChartData || []).map((d) => d.label))

    const labelsToFetch = [...requestedLabels].filter(
      (label) => !cachedLabels.has(label),
    )

    if (labelsToFetch.length > 0) {
      console.log("Cache miss. Fetching:", labelsToFetch)
      fetchData(labelsToFetch)
    }
  }, [requestedLabels, baseChartData])

  // Restore visible colors from persistent map when messageFilters change
  useEffect(() => {
    if (!messageFilters) return

    // Build colors for active filters only.
    // Prefer persisted colors when present, otherwise keep existing custom color.
    const mergedVisibleColors = Object.keys(messageFilters).reduce(
      (acc, category) => {
        Object.keys(messageFilters[category]).forEach((field) => {
          if (!messageFilters[category][field]) return

          const key = `${category}/${field}`
          const resolvedColor = persistentColorMap[key] ?? customColors[key]
          if (resolvedColor) {
            acc[key] = resolvedColor
          }
        })
        return acc
      },
      {},
    )

    const isSameAsCurrentColors =
      Object.keys(mergedVisibleColors).length ===
        Object.keys(customColors).length &&
      Object.entries(mergedVisibleColors).every(
        ([key, value]) => customColors[key] === value,
      )

    if (Object.keys(mergedVisibleColors).length > 0 && !isSameAsCurrentColors) {
      dispatch(setCustomColors(mergedVisibleColors))
    }
  }, [messageFilters, persistentColorMap, customColors, dispatch])

  // Step 3: Memoize the final chart data.
  // This filters the master cache. Colors are set to white by default.
  // The actual display colors come from customColors and are applied
  // by the Graph component to avoid resetting zoom on color changes.
  const visibleData = useMemo(() => {
    if (!baseChartData) return []

    return baseChartData
      .filter((dataset) => requestedLabels.has(dataset.label))
      .map((dataset) => ({
        ...dataset,
        borderColor: "#ffffff",
        backgroundColor: "rgba(255, 255, 255, 0.5)",
      }))
  }, [baseChartData, requestedLabels])

  // Memoize the chartData object to prevent unnecessary re-renders
  const chartData = useMemo(() => ({ datasets: visibleData }), [visibleData])

  return (
    <Layout currentPage="fla">
      {messageFilters === null ? (
        <SelectFlightLog getLogSummary={getLogSummary} />
      ) : (
        <MainDisplay
          closeLogFile={closeLogFile}
          chartData={chartData}
          customColors={customColors}
        />
      )}
    </Layout>
  )
}
