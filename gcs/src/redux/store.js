import { combineSlices, configureStore } from "@reduxjs/toolkit"
import { defaultDataMessages } from "../helpers/dashboardDefaultDataMessages"
import {
  KML_PRESENTATION_STORAGE_KEY,
  toKmlPresentationConfig,
} from "../helpers/kml"
import armedMiddleware from "./middleware/armedMiddleware"
import heartbeatMonitorMiddleware from "./middleware/heartbeatMonitorMiddleware"
import socketMiddleware from "./middleware/socketMiddleware"
import applicationSlice from "./slices/applicationSlice"
import checklistSlice, { setChecklistItems } from "./slices/checklistSlice"
import configSlice from "./slices/configSlice"
import dashboardSlice from "./slices/dashboardSlice"
import droneConnectionSlice, {
  setBaudrate,
  setConnectionType,
  setForwardingAddress,
  setIp,
  setIsForwarding,
  setNetworkType,
  setOutsideVisibility,
  setPort,
  setSelectedComPorts,
  setStatusTextSize,
} from "./slices/droneConnectionSlice"
import droneInfoSlice, {
  setGraphValues,
  setSelectedDisplayTelemetry,
} from "./slices/droneInfoSlice"
import ftpSlice from "./slices/ftpSlice"
import kmlSlice from "./slices/kmlSlice"
import logAnalyserSlice, {
  setPersistentColorMap,
} from "./slices/logAnalyserSlice"
import missionInfoSlice, {
  setDefaultWaypointAltitude,
  setPlannedHomePosition,
} from "./slices/missionSlice"
import paramsSlice from "./slices/paramsSlice"
import simulationParamsSlice from "./slices/simulationParamsSlice"
import socketSlice from "./slices/socketSlice"
import statusTextSlice from "./slices/statusTextSlice"

const rootReducer = combineSlices(
  logAnalyserSlice,
  socketSlice,
  droneConnectionSlice,
  droneInfoSlice,
  missionInfoSlice,
  statusTextSlice,
  paramsSlice,
  configSlice,
  checklistSlice,
  applicationSlice,
  dashboardSlice,
  ftpSlice,
  simulationParamsSlice,
  kmlSlice,
)

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) => {
    return getDefaultMiddleware({
      immutableCheck: false,
      serializableCheck: false,
    }).concat([socketMiddleware, heartbeatMonitorMiddleware, armedMiddleware])
  },
})

// Load individual persisted values from localStorage
const selected_com_port = localStorage.getItem("selected_com_port")
if (selected_com_port !== null) {
  store.dispatch(setSelectedComPorts(selected_com_port))
}

const baudrate = localStorage.getItem("baudrate")
if (baudrate !== null) {
  store.dispatch(setBaudrate(baudrate))
}

const connectionType = localStorage.getItem("connectionType")
if (connectionType !== null) {
  store.dispatch(setConnectionType(connectionType))
}

const networkType = localStorage.getItem("networkType")
if (networkType !== null) {
  store.dispatch(setNetworkType(networkType))
}

const ip = localStorage.getItem("ip")
if (ip !== null) {
  store.dispatch(setIp(ip))
}

const port = localStorage.getItem("port")
if (port !== null) {
  store.dispatch(setPort(port))
}

const forwardingAddress = localStorage.getItem("forwardingAddress")
if (forwardingAddress !== null) {
  store.dispatch(setForwardingAddress(forwardingAddress))
}

const isForwarding = localStorage.getItem("isForwarding")
if (isForwarding !== null) {
  store.dispatch(setIsForwarding(isForwarding === "true"))
}

const outsideVisibility = localStorage.getItem("outsideVisibility")
if (outsideVisibility !== null) {
  store.dispatch(setOutsideVisibility(outsideVisibility === "true"))
}

const statusTextSize = localStorage.getItem("statusTextSize")
if (statusTextSize !== null) {
  try {
    const parsedStatusTextSize = JSON.parse(statusTextSize)
    if (
      parsedStatusTextSize &&
      typeof parsedStatusTextSize === "object" &&
      typeof parsedStatusTextSize.width === "number" &&
      typeof parsedStatusTextSize.height === "number"
    ) {
      store.dispatch(setStatusTextSize(parsedStatusTextSize))
    }
  } catch {
    console.log("Failed to parse statusTextSize from local storage.")
  }
} else {
  // Backwards compatibility with legacy separate keys.
  const legacyStatusTextWidth = localStorage.getItem("statusTextWidth")
  const legacyStatusTextHeight = localStorage.getItem("statusTextHeight")
  if (legacyStatusTextWidth !== null && legacyStatusTextHeight !== null) {
    const parsedStatusTextWidth = Number(legacyStatusTextWidth)
    const parsedStatusTextHeight = Number(legacyStatusTextHeight)
    if (
      !Number.isNaN(parsedStatusTextWidth) &&
      !Number.isNaN(parsedStatusTextHeight)
    ) {
      store.dispatch(
        setStatusTextSize({
          width: parsedStatusTextWidth,
          height: parsedStatusTextHeight,
        }),
      )
    }
  }
}

const preFlightChecklist = localStorage.getItem("preFlightChecklist")
if (preFlightChecklist !== null) {
  try {
    store.dispatch(setChecklistItems(JSON.parse(preFlightChecklist)))
  } catch {
    console.log(
      "Failed to parse JSON from pre flight checklist items, resetting to blank array.",
    )
  }
}

const selectedRealtimeGraphs = localStorage.getItem("selectedRealtimeGraphs")
if (selectedRealtimeGraphs !== null) {
  try {
    const parsedGraphs = JSON.parse(selectedRealtimeGraphs)
    store.dispatch(setGraphValues(parsedGraphs))
  } catch (error) {
    store.dispatch(
      setGraphValues({
        graph_a: null,
        graph_b: null,
        graph_c: null,
        graph_d: null,
      }),
    )
  }
}

const selectedDisplayTelemetry = localStorage.getItem(
  "selectedDisplayTelemetry",
)
if (selectedDisplayTelemetry !== null) {
  try {
    const parsedSelectedDisplayTelemetry = JSON.parse(selectedDisplayTelemetry)
    if (
      Array.isArray(parsedSelectedDisplayTelemetry) &&
      parsedSelectedDisplayTelemetry.length > 0
    ) {
      store.dispatch(
        setSelectedDisplayTelemetry(
          mergeSelectedDisplayTelemetryConfigWithDefaults(
            parsedSelectedDisplayTelemetry,
          ),
        ),
      )
    }
  } catch {
    store.dispatch(setSelectedDisplayTelemetry([...defaultDataMessages]))
  }
}

const plannedHomePosition = localStorage.getItem("plannedHomePosition")
if (plannedHomePosition !== null) {
  try {
    const homePos = JSON.parse(plannedHomePosition)
    // Validate the loaded planned home position, if invalid reset to 0,0,0
    if (
      !("lat" in homePos) ||
      typeof homePos.lat !== "number" ||
      !("lon" in homePos) ||
      typeof homePos.lon !== "number" ||
      !("alt" in homePos) ||
      typeof homePos.alt !== "number"
    ) {
      store.dispatch(setPlannedHomePosition({ lat: 0, lon: 0, alt: 0 }))
    } else {
      store.dispatch(setPlannedHomePosition(homePos))
    }
  } catch (error) {
    store.dispatch(setPlannedHomePosition({ lat: 0, lon: 0, alt: 0 }))
  }
}

const defaultWaypointAltitude = localStorage.getItem("defaultWaypointAltitude")
if (defaultWaypointAltitude !== null) {
  const parsedDefaultWaypointAltitude = Number(defaultWaypointAltitude)
  if (Number.isFinite(parsedDefaultWaypointAltitude)) {
    store.dispatch(setDefaultWaypointAltitude(parsedDefaultWaypointAltitude))
  }
}

const persistentColorMap = localStorage.getItem("flaPersistentColorMap")
if (persistentColorMap !== null) {
  try {
    const parsedColorMap = JSON.parse(persistentColorMap)
    if (parsedColorMap && typeof parsedColorMap === "object") {
      store.dispatch(setPersistentColorMap(parsedColorMap))
    }
  } catch {
    console.log("Failed to parse persistent color map from localStorage")
    store.dispatch(setPersistentColorMap({}))
  }
}

const updateLocalStorageIfChanged = (key, newValue) => {
  if (newValue !== null && newValue !== undefined) {
    const currentValue = localStorage.getItem(key)
    const stringValue = String(newValue)
    if (currentValue !== stringValue) {
      localStorage.setItem(key, stringValue)
    }
  }
}

const updateSessionStorageIfChanged = (key, newValue) => {
  if (newValue !== null && newValue !== undefined) {
    const currentValue = sessionStorage.getItem(key)
    const stringValue = String(newValue)
    if (currentValue !== stringValue) {
      sessionStorage.setItem(key, stringValue)
    }
  }
}

const updateJSONLocalStorageIfChanged = (key, newValue) => {
  if (newValue !== null && newValue !== undefined) {
    const currentValue = localStorage.getItem(key)
    const stringValue = JSON.stringify(newValue)
    if (currentValue !== stringValue) {
      localStorage.setItem(key, stringValue)
    }
  }
}

// We only want to store the necessary fields of the selected display telemetry
// in local storage, and not the value which is updated frequently with incoming
// messages.
function toSelectedDisplayTelemetryPersistedConfig(selectedDisplayTelemetry) {
  return selectedDisplayTelemetry.map(
    ({ boxId, currently_selected, display_name }) => ({
      boxId,
      currently_selected,
      display_name,
    }),
  )
}

// When loading the selected display telemetry config from local storage, we
// want to merge it with the default config to ensure any new telemetry options
// are included and old ones that have been removed are not included. We also
// want to ensure that if the default config changes (e.g. display names updated)
// that these changes are reflected while still keeping the user's selected
// telemetry and display names.
function mergeSelectedDisplayTelemetryConfigWithDefaults(persistedConfig) {
  const defaultSelectedDisplayTelemetry =
    store.getState().droneInfo.selectedDisplayTelemetry

  const persistedConfigByBoxId = new Map(
    persistedConfig
      .filter((item) => item && item.boxId != null)
      .map((item) => [item.boxId, item]),
  )

  return defaultSelectedDisplayTelemetry.map((defaultItem) => {
    const persistedItem = persistedConfigByBoxId.get(defaultItem.boxId)
    if (!persistedItem) {
      return defaultItem
    }

    return {
      ...defaultItem,
      currently_selected: persistedItem.currently_selected,
      display_name: persistedItem.display_name,
    }
  })
}

let prevPersistentColorMap = store.getState().logAnalyser.persistentColorMap
let prevKmlLayers = store.getState().kml.layers

// Update states when a new message comes in
store.subscribe(() => {
  const store_mut = store.getState()

  if (typeof store_mut.droneConnection.selected_com_ports === "string") {
    updateLocalStorageIfChanged(
      "selected_com_port",
      store_mut.droneConnection.selected_com_ports,
    )
  }

  if (typeof store_mut.droneConnection.baudrate === "string") {
    updateLocalStorageIfChanged("baudrate", store_mut.droneConnection.baudrate)
  }

  if (typeof store_mut.droneConnection.connection_type === "string") {
    updateLocalStorageIfChanged(
      "connectionType",
      store_mut.droneConnection.connection_type,
    )
  }

  if (typeof store_mut.droneConnection.network_type === "string") {
    updateLocalStorageIfChanged(
      "networkType",
      store_mut.droneConnection.network_type,
    )
  }

  if (typeof store_mut.droneConnection.ip === "string") {
    updateLocalStorageIfChanged("ip", store_mut.droneConnection.ip)
  }

  if (typeof store_mut.droneConnection.port === "string") {
    updateLocalStorageIfChanged("port", store_mut.droneConnection.port)
  }

  if (typeof store_mut.droneConnection.forwardingAddress === "string") {
    updateLocalStorageIfChanged(
      "forwardingAddress",
      store_mut.droneConnection.forwardingAddress,
    )
  }

  if (typeof store_mut.droneConnection.isForwarding === "boolean") {
    updateLocalStorageIfChanged(
      "isForwarding",
      store_mut.droneConnection.isForwarding,
    )
  }

  if (typeof store_mut.droneConnection.outsideVisibility === "boolean") {
    updateLocalStorageIfChanged(
      "outsideVisibility",
      store_mut.droneConnection.outsideVisibility,
    )
  }

  if (
    store_mut.droneConnection.statusTextSize &&
    typeof store_mut.droneConnection.statusTextSize === "object" &&
    typeof store_mut.droneConnection.statusTextSize.width === "number" &&
    typeof store_mut.droneConnection.statusTextSize.height === "number"
  ) {
    updateJSONLocalStorageIfChanged(
      "statusTextSize",
      store_mut.droneConnection.statusTextSize,
    )
  }

  if (typeof store_mut.droneInfo.graphs.selectedGraphs === "object") {
    updateJSONLocalStorageIfChanged(
      "selectedRealtimeGraphs",
      store_mut.droneInfo.graphs.selectedGraphs,
    )
  }

  if (
    Array.isArray(store_mut.droneInfo.selectedDisplayTelemetry) &&
    store_mut.droneInfo.selectedDisplayTelemetry.length > 0
  ) {
    updateJSONLocalStorageIfChanged(
      "selectedDisplayTelemetry",
      toSelectedDisplayTelemetryPersistedConfig(
        store_mut.droneInfo.selectedDisplayTelemetry,
      ),
    )
  }

  if (typeof store_mut.droneConnection.connected === "boolean") {
    updateSessionStorageIfChanged(
      "connectedToDrone",
      store_mut.droneConnection.connected,
    )
  }

  if (typeof store_mut.checklist.items === "object") {
    updateJSONLocalStorageIfChanged(
      "preFlightChecklist",
      store_mut.checklist.items,
    )
  }

  // Store the planned home position for use in the map when no drone is connected
  if (
    store_mut.missionInfo.plannedHomePosition &&
    typeof store_mut.missionInfo.plannedHomePosition === "object"
  ) {
    updateJSONLocalStorageIfChanged(
      "plannedHomePosition",
      store_mut.missionInfo.plannedHomePosition,
    )
  }

  // Store the altitude given to newly added mission waypoints
  if (typeof store_mut.missionInfo.defaultWaypointAltitude === "number") {
    updateLocalStorageIfChanged(
      "defaultWaypointAltitude",
      store_mut.missionInfo.defaultWaypointAltitude,
    )
  }

  const currentPersistentColorMap = store_mut.logAnalyser.persistentColorMap
  if (
    currentPersistentColorMap !== prevPersistentColorMap &&
    currentPersistentColorMap &&
    typeof currentPersistentColorMap === "object"
  ) {
    updateJSONLocalStorageIfChanged(
      "flaPersistentColorMap",
      currentPersistentColorMap,
    )
    prevPersistentColorMap = currentPersistentColorMap
  }

  const currentKmlLayers = store_mut.kml.layers
  if (currentKmlLayers !== prevKmlLayers) {
    updateJSONLocalStorageIfChanged(
      KML_PRESENTATION_STORAGE_KEY,
      toKmlPresentationConfig(currentKmlLayers),
    )
    prevKmlLayers = currentKmlLayers
  }
})
