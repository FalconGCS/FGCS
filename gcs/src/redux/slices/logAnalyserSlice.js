import { createSlice } from "@reduxjs/toolkit"

const logAnalyserSlice = createSlice({
  name: "logAnalyser",
  initialState: {
    file: null,
    units: {},
    formatMessages: {},
    utcAvailable: false,
    logEvents: null,
    flightModeMessages: [],
    logType: "dataflash",
    messageFilters: null,
    messageMeans: {},
    baseChartData: [],
    customColors: {},
    persistentColorMap: {},
    colorIndex: 0,
    aircraftType: null,
    canSavePreset: false,
    firmwareVersion: null,
    params: null,
    mapPositionData: null,
    panelLayout: {
      leftSidebar: 20,
      rightContent: 80,
      graph: 70,
      tabs: 30,
    },
  },
  reducers: {
    setFile: (state, action) => {
      state.file = action.payload
    },
    setUnits: (state, action) => {
      state.units = action.payload
    },
    setFormatMessages: (state, action) => {
      state.formatMessages = action.payload
    },
    setLogMessages: (state, action) => {
      state.logMessages = action.payload
    },
    setUtcAvailable: (state, action) => {
      state.utcAvailable = action.payload
    },
    setLogEvents: (state, action) => {
      state.logEvents = action.payload
    },
    setFlightModeMessages: (state, action) => {
      state.flightModeMessages = action.payload
    },
    setLogType: (state, action) => {
      state.logType = action.payload
    },
    setMessageFilters: (state, action) => {
      state.messageFilters = action.payload
    },
    setBaseChartData: (state, action) => {
      state.baseChartData = action.payload
    },
    setMessageMeans: (state, action) => {
      state.messageMeans = action.payload
    },
    setCustomColors: (state, action) => {
      state.customColors = action.payload
    },
    setPersistentColorMap: (state, action) => {
      state.persistentColorMap = action.payload
    },
    setPersistentColorMapEntry: (state, action) => {
      const { key, color } = action.payload || {}
      if (!key || !color) return
      if (state.persistentColorMap[key] === color) return
      state.persistentColorMap[key] = color
    },
    setColorIndex: (state, action) => {
      state.colorIndex = action.payload
    },
    setAircraftType: (state, action) => {
      state.aircraftType = action.payload
    },
    setCanSavePreset: (state, action) => {
      state.canSavePreset = action.payload
    },
    setFirmwareVersion: (state, action) => {
      state.firmwareVersion = action.payload
    },
    setParams: (state, action) => {
      state.params = action.payload
    },
    setMapPositionData: (state, action) => {
      state.mapPositionData = action.payload
    },
    setPanelLayout: (state, action) => {
      state.panelLayout = action.payload
    },
    setHorizontalLayout: (state, action) => {
      // action.payload is [leftSidebar, rightContent]
      state.panelLayout.leftSidebar = action.payload[0]
      state.panelLayout.rightContent = action.payload[1]
    },
    setVerticalLayout: (state, action) => {
      // action.payload is [graph, tabs]
      state.panelLayout.graph = action.payload[0]
      state.panelLayout.tabs = action.payload[1]
    },
  },
  selectors: {
    selectFile: (state) => state.file,
    selectUnits: (state) => state.units,
    selectFormatMessages: (state) => state.formatMessages,
    selectLogMessages: (state) => state.logMessages,
    selectLogEvents: (state) => state.logEvents,
    selectFlightModeMessages: (state) => state.flightModeMessages,
    selectLogType: (state) => state.logType,
    selectUtcAvailable: (state) => state.utcAvailable,
    selectMessageFilters: (state) => state.messageFilters,
    selectMessageMeans: (state) => state.messageMeans,
    selectBaseChartData: (state) => state.baseChartData,
    selectCustomColors: (state) => state.customColors,
    selectPersistentColorMap: (state) => state.persistentColorMap,
    selectColorIndex: (state) => state.colorIndex,
    selectAircraftType: (state) => state.aircraftType,
    selectCanSavePreset: (state) => state.canSavePreset,
    selectFirmwareVersion: (state) => state.firmwareVersion,
    selectParams: (state) => state.params,
    selectMapPositionData: (state) => state.mapPositionData,
    selectCanShowMapPositionData: (state) => state.mapPositionData !== null,
    selectPanelLayout: (state) => state.panelLayout,
  },
})

export const {
  setFile,
  setUnits,
  setFormatMessages,
  setLogMessages,
  setUtcAvailable,
  setLogEvents,
  setFlightModeMessages,
  setLogType,
  setMessageFilters,
  setMessageMeans,
  setBaseChartData,
  setCustomColors,
  setPersistentColorMap,
  setPersistentColorMapEntry,
  setColorIndex,
  setAircraftType,
  setCanSavePreset,
  setFirmwareVersion,
  setParams,
  setMapPositionData,
  setPanelLayout,
  setHorizontalLayout,
  setVerticalLayout,
} = logAnalyserSlice.actions

export const {
  selectFile,
  selectUnits,
  selectFormatMessages,
  selectLogMessages,
  selectLogEvents,
  selectFlightModeMessages,
  selectLogType,
  selectUtcAvailable,
  selectMessageFilters,
  selectMessageMeans,
  selectBaseChartData,
  selectCustomColors,
  selectPersistentColorMap,
  selectColorIndex,
  selectAircraftType,
  selectCanSavePreset,
  selectFirmwareVersion,
  selectParams,
  selectMapPositionData,
  selectCanShowMapPositionData,
  selectPanelLayout,
} = logAnalyserSlice.selectors

export default logAnalyserSlice
