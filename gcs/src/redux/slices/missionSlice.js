import { createSelector, createSlice } from "@reduxjs/toolkit"
import { v4 as uuidv4 } from "uuid"
import { coordToInt } from "../../helpers/dataFormatters"
import { isGlobalFrameHomeCommand } from "../../helpers/filterMissions"
import { MAV_FRAME_LIST } from "../../helpers/mavlinkConstants"
import {
  closeLoadingNotification,
  showLoadingNotification,
} from "../../helpers/notification"

export const DEFAULT_WAYPOINT_ALTITUDE = 30

export const DEFAULT_ACCEPTANCE_RADIUS = 10

const newItemAltitude = (state) =>
  state.activeTab === "mission"
    ? state.defaultWaypointAltitude
    : DEFAULT_WAYPOINT_ALTITUDE

const missionInfoSlice = createSlice({
  name: "missionInfo",
  initialState: {
    currentMission: {
      mission_state: 0,
      total: 0,
      seq: 0,
    },
    currentMissionItems: {
      missionItems: [],
      fenceItems: [],
      rallyItems: [],
    },
    drawingItems: {
      // This is for the missions page, used locally and then will update currentMissionItems on save
      missionItems: [],
      fenceItems: [],
      rallyItems: [],
    },
    unwrittenChanges: {
      mission: false,
      fence: false,
      rally: false,
    },
    missionProgressData: {
      message: "",
      progress: null,
    },
    updatePlannedHomePositionFromLoadData: {
      lat: null,
      lon: null,
      alt: null,
      from: "", // "file" or "drone"
    },
    modals: {
      missionProgressModal: false,
      updatePlannedHomePositionFromLoadModal: false,
    },
    plannedHomePosition: {
      lat: 0,
      lon: 0,
      alt: 0,
    },
    targetInfo: {
      target_component: 0,
      target_system: 255,
    },
    activeTab: "mission",
    // Altitude given to new mission waypoints, persisted to localStorage by
    // the store so it survives a restart.
    defaultWaypointAltitude: DEFAULT_WAYPOINT_ALTITUDE,
    // Fallback acceptance radius in metres, used when disconnected. Persisted to
    // localStorage by the store alongside defaultWaypointAltitude.
    acceptanceRadius: DEFAULT_ACCEPTANCE_RADIUS,
    // The radius read off a connected aircraft, as { radius, paramId } in metres,
    // or null when unknown. Live vehicle state, so deliberately not persisted.
    vehicleWaypointRadius: null,
    hoveredMissionItemSeq: null,
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
    shouldFetchAllMissionsOnDashboard: true, // bool so that the dashboard can refresh its data when switched to if needed
    dashboardMissionFetchingNotificationId: null,
    isFetchingDashboardMission: false, // flag to prevent duplicate mission fetches
  },
  reducers: {
    setCurrentMission: (state, action) => {
      if (action.payload === state.currentMission) return
      state.currentMission = action.payload
    },
    setCurrentMissionItems: (state, action) => {
      if (
        action.payload === state.currentMissionItems ||
        action.payload === undefined
      )
        return
      state.currentMissionItems = action.payload
    },
    setPlannedHomePosition: (state, action) => {
      if (action.payload === state.plannedHomePosition) return

      // Ensure that lat, lon, and alt (if provided) are numbers
      if (
        ("lat" in action.payload && typeof action.payload.lat !== "number") ||
        ("lon" in action.payload && typeof action.payload.lon !== "number") ||
        ("alt" in action.payload && typeof action.payload.alt !== "number")
      ) {
        console.error(
          "Latitude, Longitude, and Altitude must be numbers. Got: ",
          action.payload,
        )
        return
      }

      if (
        ("lat" in action.payload &&
          (action.payload.lat < coordToInt(-90) ||
            action.payload.lat > coordToInt(90))) ||
        ("lon" in action.payload &&
          (action.payload.lon < coordToInt(-180) ||
            action.payload.lon > coordToInt(180)))
      ) {
        console.error(
          "Latitude must be between -90 and 90, Longitude must be between -180 and 180. Got: ",
          action.payload,
        )
        return
      }

      state.plannedHomePosition = {
        ...state.plannedHomePosition,
        ...action.payload,
      }

      if (
        state.drawingItems.missionItems.length > 0 &&
        isGlobalFrameHomeCommand(state.drawingItems.missionItems[0])
      ) {
        state.drawingItems.missionItems[0] = {
          ...state.drawingItems.missionItems[0],
          x: state.plannedHomePosition.lat,
          y: state.plannedHomePosition.lon,
          z: state.plannedHomePosition.alt || 0,
        }
      } else {
        const newHomeItem = {
          id: uuidv4(),
          seq: 0, // Home position is always the first item
          x: state.plannedHomePosition.lat,
          y: state.plannedHomePosition.lon,
          z: state.plannedHomePosition.alt || 0,
          frame: getFrameKey("GLOBAL"),
          command: 16, // MAV_CMD_NAV_WAYPOINT
          param1: 0,
          param2: 0,
          param3: 0,
          param4: 0,
          current: 1, // Set as current waypoint
          autocontinue: 1,
          target_component: state.targetInfo.target_component,
          target_system: state.targetInfo.target_system,
          mission_type: 0,
          mavpackettype: "MISSION_ITEM_INT",
        }

        state.drawingItems.missionItems = [
          newHomeItem,
          ...state.drawingItems.missionItems,
        ]
      }
    },
    setTargetInfo: (state, action) => {
      if (action.payload === state.targetInfo) return
      state.targetInfo = action.payload
    },
    updateDrawingItem: (state, action) => {
      const payload = action.payload
      const _type = `${state.activeTab}Items`

      const index = state.drawingItems[_type].findIndex(
        (i) => i.id === payload.id,
      )
      if (index === -1) return

      const currentItem = state.drawingItems[_type][index]

      if (currentItem === payload) return

      state.drawingItems[_type][index] = { ...currentItem, ...payload }
      state.unwrittenChanges = {
        ...state.unwrittenChanges,
        [state.activeTab]: true,
      }
    },
    removeDrawingItem: (state, action) => {
      const id = action.payload
      const _type = `${state.activeTab}Items`

      const index = state.drawingItems[_type].findIndex((i) => i.id === id)
      if (index === -1) return

      state.drawingItems[_type] = state.drawingItems[_type]
        .filter((s) => s.id !== id)
        .map((item, index) => {
          return { ...item, seq: index }
        })
      state.unwrittenChanges = {
        ...state.unwrittenChanges,
        [state.activeTab]: true,
      }
    },
    insertDrawingItemAfter: (state, action) => {
      const { afterId, x, y } = action.payload
      const _type = `${state.activeTab}Items`
      const index = state.drawingItems[_type].findIndex((i) => i.id === afterId)

      if (index === -1) return

      const drawingItem = newMissionItem(
        x,
        y,
        state.targetInfo,
        newItemAltitude(state),
      )
      drawingItem.seq = index + 1
      drawingItem.command = { mission: 16, fence: 5004, rally: 5100 }[
        state.activeTab
      ]
      drawingItem.mission_type = { mission: 0, fence: 1, rally: 2 }[
        state.activeTab
      ]

      if (state.activeTab === "fence") {
        drawingItem.param1 = 5
        drawingItem.frame = getFrameKey("GLOBAL")
      }

      state.drawingItems[_type].splice(index + 1, 0, drawingItem)
      state.drawingItems[_type] = state.drawingItems[_type].map(
        (item, itemIndex) => ({
          ...item,
          seq: itemIndex,
        }),
      )

      state.unwrittenChanges = {
        ...state.unwrittenChanges,
        [state.activeTab]: true,
      }
    },
    reorderDrawingItem: (state, action) => {
      const { id, increment } = action.payload
      const _type = `${state.activeTab}Items`
      const index = state.drawingItems[_type].findIndex((i) => i.id === id)

      if (
        index === -1 ||
        (increment === -1 && index === 0) ||
        (increment === 1 && index === state.drawingItems[_type].length - 1)
      ) {
        return // Prevents reordering if index is out of bounds or at the edge of the list
      }

      ;[
        state.drawingItems[_type][index],
        state.drawingItems[_type][index + increment],
      ] = [
        { ...state.drawingItems[_type][index + increment], seq: index },
        { ...state.drawingItems[_type][index], seq: index + increment },
      ]
      state.unwrittenChanges = {
        ...state.unwrittenChanges,
        [state.activeTab]: true,
      }
    },
    createNewDefaultDrawingItem: (state, action) => {
      const { x, y } = action.payload
      const drawingItem = newMissionItem(
        x,
        y,
        state.targetInfo,
        newItemAltitude(state),
      )

      const _type = `${state.activeTab}Items`

      drawingItem.seq = state.drawingItems[_type].length
      drawingItem.command = { mission: 16, fence: 5004, rally: 5100 }[
        state.activeTab
      ]
      drawingItem.mission_type = { mission: 0, fence: 1, rally: 2 }[
        state.activeTab
      ]

      if (state.activeTab == "fence") {
        drawingItem.param1 = 5
        drawingItem.frame = getFrameKey("GLOBAL")
      }

      state.drawingItems[_type].push(drawingItem)
      state.unwrittenChanges = {
        ...state.unwrittenChanges,
        [state.activeTab]: true,
      }
    },
    setDefaultWaypointAltitude: (state, action) => {
      const altitude = Number(action.payload)
      if (!Number.isFinite(altitude)) return
      state.defaultWaypointAltitude = altitude
    },
    setAcceptanceRadius: (state, action) => {
      const radius = Number(action.payload)
      if (!Number.isFinite(radius) || radius <= 0) return
      state.acceptanceRadius = radius
    },
    setVehicleWaypointRadius: (state, action) => {
      state.vehicleWaypointRadius = action.payload
    },
    createNewSpecificMissionItem: (state, action) => {
      const { x, y, z, command } = action.payload

      if (!command) {
        console.error("Invalid command for new mission item:", action.payload)
        return
      }

      const drawingItem = newMissionItem(x, y, state.targetInfo)
      const _type = `${state.activeTab}Items`

      drawingItem.seq = state.drawingItems[_type].length
      drawingItem.z = z
      drawingItem.command = command
      drawingItem.mission_type = { mission: 0, fence: 1, rally: 2 }[
        state.activeTab
      ]
      if (action.payload.frame) {
        drawingItem.frame = getFrameKey(action.payload.frame)
      }
      if (action.payload.params) {
        Object.keys(action.payload.params).forEach((key) => {
          drawingItem[key] = action.payload.params[key]
        })
      }

      state.drawingItems[_type].push(drawingItem)
      state.unwrittenChanges = {
        ...state.unwrittenChanges,
        [state.activeTab]: true,
      }
    },
    clearDrawingItems: (state) => {
      const _type = `${state.activeTab}Items`

      if (state.drawingItems[_type].length === 0) return

      if (
        state.activeTab == "mission" &&
        state.drawingItems.missionItems.length > 0 &&
        isGlobalFrameHomeCommand(state.drawingItems.missionItems[0])
      ) {
        state.drawingItems.missionItems = [state.drawingItems.missionItems[0]]
      } else {
        state.drawingItems[_type] = []
      }
      state.unwrittenChanges = {
        ...state.unwrittenChanges,
        [state.activeTab]: true,
      }
    },
    createFencePolygon: (state, action) => {
      const items = action.payload

      state.drawingItems.fenceItems = [
        ...state.drawingItems.fenceItems,
        ...items.map((item, index) => ({
          ...newMissionItem(item.x, item.y, state.targetInfo),
          ...item,
          seq: state.drawingItems.fenceItems.length + index,
        })),
      ]
      state.unwrittenChanges.fence = true
    },
    insertFencePolygonVertex: (state, action) => {
      const { afterId, polygonStartIndex, polygonLength, x, y } = action.payload

      if (
        typeof polygonStartIndex !== "number" ||
        typeof polygonLength !== "number"
      ) {
        return
      }

      const fenceItems = state.drawingItems.fenceItems
      const index = fenceItems.findIndex((item) => item.id === afterId)

      if (index === -1) return

      const insertIndex = index + 1
      const polygonEndIndex = polygonStartIndex + polygonLength - 1

      if (index < polygonStartIndex || index > polygonEndIndex) {
        return
      }

      const polygonItems = fenceItems.slice(
        polygonStartIndex,
        polygonStartIndex + polygonLength,
      )

      if (polygonItems.length === 0) return

      const fenceTypeCommand = polygonItems[0].command
      const drawingItem = {
        ...newMissionItem(x, y, state.targetInfo),
        command: fenceTypeCommand,
        mission_type: 1,
        param1: polygonLength + 1,
        frame: polygonItems[0].frame,
      }

      fenceItems.splice(insertIndex, 0, drawingItem)

      state.drawingItems.fenceItems = fenceItems.map((item, itemIndex) => {
        const updatedItem = {
          ...item,
          seq: itemIndex,
        }

        if (
          itemIndex >= polygonStartIndex &&
          itemIndex <= polygonEndIndex + 1
        ) {
          updatedItem.param1 = polygonLength + 1
          updatedItem.z = itemIndex - polygonStartIndex
        }

        return updatedItem
      })

      state.unwrittenChanges.fence = true
    },
    setDrawingMissionItems: (state, action) => {
      if (action.payload === state.drawingItems.missionItems) return
      state.drawingItems.missionItems = action.payload
    },
    setDrawingFenceItems: (state, action) => {
      if (action.payload === state.drawingItems.fenceItems) return
      state.drawingItems.fenceItems = action.payload
    },
    setDrawingRallyItems: (state, action) => {
      if (action.payload === state.drawingItems.rallyItems) return
      state.drawingItems.rallyItems = action.payload
    },
    setUnwrittenChanges: (state, action) => {
      if (action.payload === state.unwrittenChanges) return
      state.unwrittenChanges = action.payload
    },
    setMissionProgressModal: (state, action) => {
      if (action.payload === state.modals.missionProgressModal) return
      state.modals.missionProgressModal = action.payload
    },
    setActiveTab: (state, action) => {
      if (action.payload === state.activeTab) return
      state.activeTab = action.payload
    },
    setHoveredMissionItemSeq: (state, action) => {
      if (action.payload === state.hoveredMissionItemSeq) return
      state.hoveredMissionItemSeq = action.payload
    },
    setMissionProgressData: (state, action) => {
      if (action.payload === state.missionProgressData) return
      state.missionProgressData = action.payload
    },
    resetMissionProgressData: (state) => {
      if (
        !state.missionProgressData.message &&
        !state.missionProgressData.progress
      )
        return
      state.missionProgressData = { message: "", progress: null }
    },
    setUpdatePlannedHomePositionFromLoadModal: (state, action) => {
      if (
        action.payload === state.modals.updatePlannedHomePositionFromLoadModal
      )
        return
      state.modals.updatePlannedHomePositionFromLoadModal = action.payload
    },
    setUpdatePlannedHomePositionFromLoadData: (state, action) => {
      if (
        JSON.stringify(action.payload) ===
        JSON.stringify(state.updatePlannedHomePositionFromLoadData)
      )
        return
      state.updatePlannedHomePositionFromLoadData = action.payload
    },
    resetUpdatePlannedHomePositionFromLoadData: (state) => {
      state.updatePlannedHomePositionFromLoadData = {
        lat: null,
        lon: null,
        alt: null,
        from: "", // "file" or "drone"
      }
    },
    updateContextMenuState: (state, action) => {
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

      // Clamp position so the menu never renders outside the map canvas.
      const maxX = Math.max(0, updatedState.canvasSize.width - contextMenuWidth)
      const maxY = Math.max(
        0,
        updatedState.canvasSize.height - contextMenuHeight,
      )
      x = Math.max(0, Math.min(x, maxX))
      y = Math.max(0, Math.min(y, maxY))

      state.contextMenu = {
        ...updatedState,
        position: { x: x, y: y },
      }
    },
    setMissionDistanceMeasurementDraftStart: (state, action) => {
      state.distanceMeasurements.draftStart = action.payload
    },
    addMissionDistanceMeasurement: (state, action) => {
      state.distanceMeasurements.items.push(action.payload)
      state.distanceMeasurements.draftStart = null
    },
    clearMissionDistanceMeasurementDraftStart: (state) => {
      state.distanceMeasurements.draftStart = null
    },
    removeMissionDistanceMeasurement: (state, action) => {
      state.distanceMeasurements.items =
        state.distanceMeasurements.items.filter(
          (measurement) => measurement.id !== action.payload,
        )
    },
    clearMissionDistanceMeasurements: (state) => {
      state.distanceMeasurements.items = []
      state.distanceMeasurements.draftStart = null
    },
    setShouldFetchAllMissionsOnDashboard: (state, action) => {
      if (action.payload === state.shouldFetchAllMissionsOnDashboard) return
      state.shouldFetchAllMissionsOnDashboard = action.payload
    },
    setDashboardMissionFetchingNotificationId: (state, action) => {
      if (action.payload === state.dashboardMissionFetchingNotificationId)
        return
      state.dashboardMissionFetchingNotificationId = action.payload
    },
    setIsFetchingDashboardMission: (state, action) => {
      if (action.payload === state.isFetchingDashboardMission) return
      state.isFetchingDashboardMission = action.payload
    },

    // Emits
    emitGetTargetInfo: () => {},
    emitGetCurrentMission: () => {},
    emitWriteCurrentMission: () => {},
    emitImportMissionFromFile: () => {},
    emitExportMissionToFile: () => {},
    emitControlMission: () => {},
    emitGetWaypointRadius: () => {},
    emitSetWaypointRadius: () => {},
  },
  selectors: {
    selectCurrentMission: (state) => state.currentMission,
    selectCurrentMissionItems: (state) => state.currentMissionItems,
    selectPlannedHomePosition: (state) => state.plannedHomePosition,
    selectUpdatePlannedHomePositionFromLoadModal: (state) =>
      state.modals.updatePlannedHomePositionFromLoadModal,
    selectUpdatePlannedHomePositionFromLoadData: (state) =>
      state.updatePlannedHomePositionFromLoadData,
    selectTargetInfo: (state) => state.targetInfo,
    selectDrawingMissionItems: (state) => state.drawingItems.missionItems,
    selectDrawingFenceItems: (state) => state.drawingItems.fenceItems,
    selectDrawingRallyItems: (state) => state.drawingItems.rallyItems,
    selectUnwrittenChanges: (state) => state.unwrittenChanges,
    selectFirstUnwrittenTab: (state) =>
      Object.entries(state.unwrittenChanges).find(([, changed]) => changed),
    selectMissionProgressModal: (state) => state.modals.missionProgressModal,
    selectMissionProgressData: (state) => state.missionProgressData,
    selectActiveTab: (state) => state.activeTab,
    selectHoveredMissionItemSeq: (state) => state.hoveredMissionItemSeq,
    selectDefaultWaypointAltitude: (state) => state.defaultWaypointAltitude,
    selectAcceptanceRadius: (state) => state.acceptanceRadius,
    selectVehicleWaypointRadius: (state) => state.vehicleWaypointRadius,
    selectContextMenu: (state) => state.contextMenu,
    selectMissionDistanceMeasurements: (state) =>
      state.distanceMeasurements.items,
    selectMissionDistanceMeasurementDraftStart: (state) =>
      state.distanceMeasurements.draftStart,
    selectShouldFetchAllMissionsOnDashboard: (state) =>
      state.shouldFetchAllMissionsOnDashboard,
    selectDashboardMissionFetchingNotificationId: (state) =>
      state.dashboardMissionFetchingNotificationId,
    selectIsFetchingDashboardMission: (state) =>
      state.isFetchingDashboardMission,
  },
})

export const selectDrawingMissionItemByIdx = (index) =>
  createSelector(
    [missionInfoSlice.selectors.selectDrawingMissionItems],

    (missionItems) => missionItems.at(index),
  )

export const selectDrawingFenceItemByIdx = (index) =>
  createSelector(
    [missionInfoSlice.selectors.selectDrawingFenceItems],

    (fenceItems) => fenceItems.at(index),
  )

export const selectDrawingRallyItemByIdx = (index) =>
  createSelector(
    [missionInfoSlice.selectors.selectDrawingRallyItems],

    (rallyItems) => rallyItems.at(index),
  )

export const addIdToItem = (missionItem) => {
  if (!missionItem.id) {
    missionItem.id = uuidv4()
  }
  return missionItem
}

export const updatePlannedHomePositionBasedOnLoadedWaypointsThunk =
  () => (dispatch, getState) => {
    const { updatePlannedHomePositionFromLoadData } = getState().missionInfo
    dispatch(
      setPlannedHomePosition({
        lat: updatePlannedHomePositionFromLoadData.lat,
        lon: updatePlannedHomePositionFromLoadData.lon,
        alt: updatePlannedHomePositionFromLoadData.alt,
      }),
    )
    dispatch(resetUpdatePlannedHomePositionFromLoadData())
    dispatch(setUpdatePlannedHomePositionFromLoadModal(false))
  }

export const setPlannedHomePositionToDronesHomePositionThunk =
  () => (dispatch, getState) => {
    const droneHomePosition = getState().droneInfo.homePosition
    if (
      droneHomePosition &&
      typeof droneHomePosition.lat === "number" &&
      typeof droneHomePosition.lon === "number" &&
      typeof droneHomePosition.alt === "number"
    ) {
      dispatch(
        setPlannedHomePosition({
          lat: droneHomePosition.lat,
          lon: droneHomePosition.lon,
          alt: droneHomePosition.alt,
        }),
      )
    } else {
      console.error(
        "Drone home position is not available or invalid. Got: ",
        droneHomePosition,
      )
    }
  }

export const showDashboardMissionFetchingNotificationThunk =
  () => (dispatch) => {
    const notificationId = showLoadingNotification(
      "Fetching the mission",
      "Fetching the mission from the drone",
    )
    dispatch(setDashboardMissionFetchingNotificationId(notificationId))
  }

export const closeDashboardMissionFetchingNotificationThunk =
  () => (dispatch, getState) => {
    const { dashboardMissionFetchingNotificationId } = getState().missionInfo
    if (dashboardMissionFetchingNotificationId) {
      closeLoadingNotification(
        dashboardMissionFetchingNotificationId,
        "Mission fetched",
        "Successfully fetched the mission from the drone",
      )
    }
    dispatch(setDashboardMissionFetchingNotificationId(null))
  }
export const closeDashboardMissionFetchingNotificationNoSuccessThunk =
  () => (dispatch, getState) => {
    const { dashboardMissionFetchingNotificationId } = getState().missionInfo
    if (dashboardMissionFetchingNotificationId) {
      closeLoadingNotification(dashboardMissionFetchingNotificationId, "", "")
    }
    dispatch(setDashboardMissionFetchingNotificationId(null))
  }

export const getFrameKey = (frame) =>
  parseInt(
    Object.keys(MAV_FRAME_LIST).find((key) => MAV_FRAME_LIST[key] == frame),
  )

export const newMissionItem = (
  x,
  y,
  targetInfo,
  z = DEFAULT_WAYPOINT_ALTITUDE,
) => {
  return {
    id: uuidv4(),
    seq: null,
    x: x,
    y: y,
    z: z,
    frame: getFrameKey("GLOBAL_RELATIVE_ALT"),
    command: null,
    param1: 0,
    param2: 0,
    param3: 0,
    param4: 0,
    current: 0,
    autocontinue: 1,
    target_component: targetInfo.target_component,
    target_system: targetInfo.target_system,
    mission_type: null,
    mavpackettype: "MISSION_ITEM_INT",
  }
}

export const {
  selectCurrentMission,
  selectCurrentMissionItems,
  selectPlannedHomePosition,
  selectUpdatePlannedHomePositionFromLoadModal,
  selectUpdatePlannedHomePositionFromLoadData,
  selectTargetInfo,
  selectDrawingMissionItems,
  selectDrawingFenceItems,
  selectDrawingRallyItems,
  selectUnwrittenChanges,
  selectFirstUnwrittenTab,
  selectMissionProgressModal,
  selectMissionProgressData,
  selectActiveTab,
  selectHoveredMissionItemSeq,
  selectDefaultWaypointAltitude,
  selectAcceptanceRadius,
  selectVehicleWaypointRadius,
  selectContextMenu,
  selectMissionDistanceMeasurements,
  selectMissionDistanceMeasurementDraftStart,
  selectShouldFetchAllMissionsOnDashboard,
  selectDashboardMissionFetchingNotificationId,
  selectIsFetchingDashboardMission,
} = missionInfoSlice.selectors

export const {
  setCurrentMission,
  setCurrentMissionItems,
  setPlannedHomePosition,
  setUpdatePlannedHomePositionFromLoadModal,
  setUpdatePlannedHomePositionFromLoadData,
  resetUpdatePlannedHomePositionFromLoadData,
  setTargetInfo,
  updateDrawingItem,
  removeDrawingItem,
  insertDrawingItemAfter,
  reorderDrawingItem,
  createNewDefaultDrawingItem,
  setDefaultWaypointAltitude,
  setAcceptanceRadius,
  setVehicleWaypointRadius,
  createNewSpecificMissionItem,
  clearDrawingItems,
  createFencePolygon,
  insertFencePolygonVertex,
  setDrawingMissionItems,
  setDrawingFenceItems,
  setDrawingRallyItems,
  setUnwrittenChanges,
  setMissionProgressModal,
  setActiveTab,
  setHoveredMissionItemSeq,
  setMissionProgressData,
  resetMissionProgressData,
  updateContextMenuState,
  setMissionDistanceMeasurementDraftStart,
  addMissionDistanceMeasurement,
  clearMissionDistanceMeasurementDraftStart,
  removeMissionDistanceMeasurement,
  clearMissionDistanceMeasurements,
  emitGetTargetInfo,
  emitGetCurrentMission,
  emitWriteCurrentMission,
  emitImportMissionFromFile,
  emitExportMissionToFile,
  setShouldFetchAllMissionsOnDashboard,
  setDashboardMissionFetchingNotificationId,
  setIsFetchingDashboardMission,
  emitControlMission,
  emitGetWaypointRadius,
  emitSetWaypointRadius,
} = missionInfoSlice.actions

export default missionInfoSlice
