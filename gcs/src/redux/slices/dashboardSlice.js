import { createSlice } from "@reduxjs/toolkit"

const initialState = {
  contextMenu: {
    isOpen: false,
    position: { x: 0, y: 0 },
    menuSize: { width: 0, height: 0 },
    canvasSize: { width: 0, height: 0 },
    gpsCoords: { lat: 0, lng: 0 },
    markerId: null,
  },
  distanceMeasurements: {
    draftStart: null,
    items: [],
  },
}

const dashboardSlice = createSlice({
  name: "dashboard",
  initialState,
  reducers: {
    updateDashboardContextMenuState: (state, action) => {
      if (action.payload === state.contextMenu) return

      // Update the position of the context menu to ensure it fits within the canvas

      const updatedState = {
        ...state.contextMenu,
        ...action.payload,
      }

      const contextMenuWidth = updatedState.menuSize.width
      const contextMenuHeight = updatedState.menuSize.height
      let x = updatedState.position.x
      let y = updatedState.position.y

      if (
        contextMenuWidth + updatedState.position.x >
        updatedState.canvasSize.width
      ) {
        x = updatedState.position.x - contextMenuWidth
      }
      if (
        contextMenuHeight + updatedState.position.y >
        updatedState.canvasSize.height
      ) {
        y = updatedState.position.y - contextMenuHeight
      }

      state.contextMenu = {
        ...updatedState,
        position: { x: x, y: y },
      }
    },
    setDashboardDistanceMeasurementDraftStart: (state, action) => {
      state.distanceMeasurements.draftStart = action.payload
    },
    addDashboardDistanceMeasurement: (state, action) => {
      state.distanceMeasurements.items.push(action.payload)
      state.distanceMeasurements.draftStart = null
    },
    clearDashboardDistanceMeasurementDraftStart: (state) => {
      state.distanceMeasurements.draftStart = null
    },
    removeDashboardDistanceMeasurement: (state, action) => {
      state.distanceMeasurements.items =
        state.distanceMeasurements.items.filter(
          (measurement) => measurement.id !== action.payload,
        )
    },
    clearDashboardDistanceMeasurements: (state) => {
      state.distanceMeasurements.items = []
      state.distanceMeasurements.draftStart = null
    },
  },
  selectors: {
    selectDashboardContextMenu: (state) => state.contextMenu,
    selectDashboardDistanceMeasurements: (state) =>
      state.distanceMeasurements.items,
    selectDashboardDistanceMeasurementDraftStart: (state) =>
      state.distanceMeasurements.draftStart,
  },
})

export const {
  updateDashboardContextMenuState,
  setDashboardDistanceMeasurementDraftStart,
  addDashboardDistanceMeasurement,
  clearDashboardDistanceMeasurementDraftStart,
  removeDashboardDistanceMeasurement,
  clearDashboardDistanceMeasurements,
} = dashboardSlice.actions

export const {
  selectDashboardContextMenu,
  selectDashboardDistanceMeasurements,
  selectDashboardDistanceMeasurementDraftStart,
} = dashboardSlice.selectors

export default dashboardSlice
