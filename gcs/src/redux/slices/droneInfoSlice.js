import { createSelector, createSlice } from "@reduxjs/toolkit"
import { bearing, distance } from "@turf/turf"
import { defaultDataMessages } from "../../helpers/dashboardDefaultDataMessages"
import { centiDegToDeg, intToCoord } from "../../helpers/dataFormatters"
import {
  getActiveEKFFlags,
  getFlightModeMap,
  MAV_STATE,
} from "../../helpers/mavlinkConstants"
import { mavlinkDef } from "../../helpers/mavlinkDef"

// TODO: Make this configurable in the future?
const GPS_TRACK_MAX_LENGTH = 300

const minGpsSpeedForHeading = 0.5 // m/s
const minGpsDistanceForHeading = 0.5 // meters

const droneInfoSlice = createSlice({
  name: "droneInfo",
  initialState: {
    flightSwVersion: "",
    attitudeData: {
      roll: 0.0,
      pitch: 0.0,
      yaw: 0.0,
    },
    telemetryData: {
      airspeed: 0.0,
      groundspeed: 0.0,
      alt: 0.0,
      climb: 0.0,
      heading: 0.0,
      throttle: 0.0,
    },
    escData: {
      ESC_TELEMETRY_1_TO_4: null,
      ESC_TELEMETRY_5_TO_8: null,
    },
    gpsData: {
      mavpackettype: "GLOBAL_POSITION_INT",
      time_boot_ms: 0,
      lat: 0,
      lon: 0,
      alt: 0,
      relative_alt: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      hdg: 0,
      timestamp: 0,
    },
    gpsTrack: [],
    gpsTrackHeading: 0,
    homePosition: {
      lat: 0,
      lon: 0,
      alt: 0,
    },
    navControllerData: {
      navBearing: 0.0,
      wpDist: 0.0,
      loiterRadius: 80.0,
    },
    heartbeatData: {
      baseMode: 0,
      customMode: 0,
      systemStatus: 0,
    },
    heartbeatMonitor: {
      lastReceivedAt: 0,
    },
    onboardControlSensorsEnabled: 0,
    onboardControlSensorsHealth: 0,
    gpsRawIntData: {
      fixType: 0,
      satellitesVisible: 0,
      velocity: 0,
      courseOverGround: 0,
      hdop: 0,
    },
    gps2RawIntData: {
      fixType: 0,
      satellitesVisible: 0,
      velocity: 0,
      courseOverGround: 0,
      hdop: 0,
    },
    hasSecondaryGps: false,
    hasEverHadGpsFix: false,
    rssi: 0.0,
    notificationSound: "",
    aircraftType: 2, // Default to copter, will be updated on heartbeat
    batteryData: [],
    selectedDisplayTelemetry: [...defaultDataMessages],
    guidedModePinData: {
      lat: 0, // Stored in coords not int
      lon: 0, // Stored in coords not int
      alt: 0,
    },
    ekfStatusReportData: {
      compass_variance: 0,
      pos_horiz_variance: 0,
      pos_vert_variance: 0,
      terrain_alt_variance: 0,
      velocity_variance: 0,
      flags: 0,
    },
    ekfCalculatedStatus: 0,
    vibrationData: {
      vibration_x: 0,
      vibration_y: 0,
      vibration_z: 0,
      clipping_0: 0,
      clipping_1: 0,
      clipping_2: 0,
    },
    graphs: {
      selectedGraphs: {
        graph_a: null,
        graph_b: null,
        graph_c: null,
        graph_d: null,
      },
      lastGraphResultsMessage: false,
    },
    lowBatteryAlerted: false,
    isArmed: false,
    isFlying: false,
    totalTimeFlying: 0,
  },
  reducers: {
    setFlightSwVersion: (state, action) => {
      state.flightSwVersion = action.payload
      window.ipcRenderer.send(
        "window:update-title",
        `FGCS - ${state.aircraftType === 1 ? "ArduPlane" : "ArduCopter"} ${action.payload}`,
      )
    },
    setHeartbeatData: (state, action) => {
      if (
        action.payload.base_mode & mavlinkDef.MavModeFlag["SAFETY_ARMED"] &&
        !(state.heartbeatData.baseMode & mavlinkDef.MavModeFlag["SAFETY_ARMED"])
      ) {
        state.isArmed = true
        state.notificationSound = "armed"
      } else if (
        !(action.payload.base_mode & mavlinkDef.MavModeFlag["SAFETY_ARMED"]) &&
        state.heartbeatData.baseMode & mavlinkDef.MavModeFlag["SAFETY_ARMED"]
      ) {
        state.isArmed = false
        state.isFlying = false
        state.notificationSound = "disarmed"
      }
      state.heartbeatData.baseMode = action.payload.base_mode

      if (action.payload.custom_mode !== state.heartbeatData.customMode) {
        state.notificationSound = "mode_change"
      }
      state.heartbeatData.customMode = action.payload.custom_mode
      state.heartbeatData.systemStatus = action.payload.system_status
    },
    setHeartbeatMonitorLastReceivedAt: (state, action) => {
      if (action.payload !== state.heartbeatMonitor.lastReceivedAt) {
        state.heartbeatMonitor.lastReceivedAt = action.payload
      }
    },
    resetHeartbeatMonitor: (state) => {
      state.heartbeatMonitor.lastReceivedAt = 0
    },
    setBatteryData: (state, action) => {
      const battery = state.batteryData.filter(
        (battery) => battery.id == action.payload.id,
      )[0]
      if (battery) {
        Object.assign(battery, action.payload)
      } else {
        state.batteryData.push(action.payload)
      }
      if (action.payload.battery_remaining <= 20 && !state.lowBatteryAlerted) {
        state.notificationSound = "low_battery"
        state.lowBatteryAlerted = true
      }
    },
    soundPlayed: (state) => {
      state.notificationSound = ""
    },
    changeSelectedDisplayTelemetry: (state, action) => {
      state.selectedDisplayTelemetry[action.payload.index] = {
        ...state.selectedDisplayTelemetry[action.payload.index],
        ...action.payload.data,
      }
    },
    setSelectedDisplayTelemetry: (state, action) => {
      if (action.payload !== state.selectedDisplayTelemetry) {
        state.selectedDisplayTelemetry = action.payload
      }
    },
    setDroneAircraftType: (state, action) => {
      if (action.payload !== state.aircraftType) {
        state.aircraftType = action.payload
      }
    },
    setEscTelemetryData: (state, action) => {
      const packetType = action.payload?.mavpackettype
      if (!packetType) return

      state.escData = {
        ...state.escData,
        [packetType]: {
          ...action.payload,
          rpm: Array.isArray(action.payload.rpm) ? [...action.payload.rpm] : [],
          current: Array.isArray(action.payload.current)
            ? [...action.payload.current]
            : [],
          voltage: Array.isArray(action.payload.voltage)
            ? [...action.payload.voltage]
            : [],
          temperature: Array.isArray(action.payload.temperature)
            ? [...action.payload.temperature]
            : [],
          totalcurrent: Array.isArray(action.payload.totalcurrent)
            ? [...action.payload.totalcurrent]
            : [],
        },
      }
    },
    setTelemetryData: (state, action) => {
      state.telemetryData = {
        airspeed: action.payload.airspeed,
        groundspeed: action.payload.groundspeed,
        alt: action.payload.alt,
        climb: action.payload.climb,
        heading: action.payload.heading,
        throttle: action.payload.throttle,
      }

      if (
        state.isArmed &&
        !state.isFlying &&
        (action.payload.throttle > 10 ||
          (action.payload.groundspeed >= 0.5 && action.payload.alt >= 1))
      ) {
        // Aircraft is armed AND is not already flying AND (throttle is > 10% OR
        // (groundspeed is above 0.5 m/s AND altitude is above 1 m))
        state.isFlying = true
      }
    },
    setGpsData: (state, action) => {
      if (action.payload !== state.gpsData) {
        state.gpsData = action.payload
      }
    },
    setHomePosition: (state, action) => {
      if (action.payload !== state.homePosition) {
        state.homePosition = action.payload
      }
    },
    setAttitudeData: (state, action) => {
      if (action.payload !== state.attitudeData) {
        state.attitudeData = action.payload
      }
    },
    setNavControllerOutput: (state, action) => {
      if (action.payload !== state.navControllerData) {
        state.navControllerData.wpDist = action.payload.wp_dist
        state.navControllerData.navBearing = action.payload.nav_bearing
      }
    },
    setGpsRawIntData: (state, action) => {
      if (action.payload !== state.gpsRawIntData) {
        state.gpsRawIntData.satellitesVisible =
          action.payload.satellites_visible
        state.gpsRawIntData.fixType = action.payload.fix_type
        state.gpsRawIntData.velocity = action.payload.vel / 100.0 // cm/s to m/s
        state.gpsRawIntData.courseOverGround = centiDegToDeg(action.payload.cog)
        state.gpsRawIntData.hdop = action.payload.hdop ?? 0

        if (!state.hasEverHadGpsFix && action.payload.fix_type >= 2) {
          state.hasEverHadGpsFix = true
          // TODO: If we get GPS position later on in the connection,
          // fetch home position
        }
      }
    },
    setGps2RawIntData: (state, action) => {
      if (action.payload !== state.gps2RawIntData) {
        state.gps2RawIntData.satellitesVisible =
          action.payload.satellites_visible
        state.gps2RawIntData.fixType = action.payload.fix_type
        state.gps2RawIntData.velocity = action.payload.vel / 100.0 // cm/s to m/s
        state.gps2RawIntData.courseOverGround = centiDegToDeg(
          action.payload.cog,
        )
        state.gps2RawIntData.hdop = action.payload.hdop ?? 0

        state.hasSecondaryGps = true // Reducer called => gps2 exists
      }
    },
    setHasEverHadGpsFix: (state, action) => {
      state.hasEverHadGpsFix = action.payload
    },
    setOnboardControlSensorsEnabled: (state, action) => {
      if (action.payload !== state.onboardControlSensorsEnabled) {
        state.onboardControlSensorsEnabled = action.payload
      }
    },
    setOnboardControlSensorsHealth: (state, action) => {
      if (action.payload !== state.onboardControlSensorsHealth) {
        state.onboardControlSensorsHealth = action.payload
      }
    },
    setRSSIData: (state, action) => {
      if (action.payload !== state.rssi) {
        state.rssi = action.payload
      }
    },
    setGraphValues: (state, action) => {
      if (action.payload !== state.graphs.selectedGraphs) {
        state.graphs.selectedGraphs = action.payload
      }
    },
    setLastGraphMessage: (state, action) => {
      if (action.payload !== state.graphs.lastGraphResultsMessage) {
        state.graphs.lastGraphResultsMessage = action.payload
      }
    },
    setLoiterRadius: (state, action) => {
      if (action.payload !== state.navControllerData.loiterRadius) {
        state.navControllerData.loiterRadius = action.payload
      }
    },
    setGuidedModePinData: (state, action) => {
      state.guidedModePinData = action.payload
    },
    setEkfStatusReportData: (state, action) => {
      state.ekfStatusReportData = action.payload

      // Calculate EKF status value ranging from 0-1
      // https://github.com/ArduPilot/MissionPlanner/blob/4d441bd4b1dbc08adce4d8b26e078e93760da3a7/ExtLibs/ArduPilot/CurrentState.cs#L2645-L2647
      const vel = state.ekfStatusReportData.velocity_variance
      const comp = state.ekfStatusReportData.compass_variance
      const posHor = state.ekfStatusReportData.pos_horiz_variance
      const posVer = state.ekfStatusReportData.pos_vert_variance
      const terAlt = state.ekfStatusReportData.terrain_alt_variance
      state.ekfCalculatedStatus = Math.max(vel, comp, posHor, posVer, terAlt)

      // Check EKF flags to handle critical errors
      // https://github.com/ArduPilot/MissionPlanner/blob/4d441bd4b1dbc08adce4d8b26e078e93760da3a7/ExtLibs/ArduPilot/CurrentState.cs#L2674-L2736
      const activeFlags = getActiveEKFFlags(state.ekfStatusReportData.flags)
      if (!activeFlags.includes("ATTITUDE")) {
        // If we have no attitude solution
        state.ekfCalculatedStatus = 1
      } else if (!activeFlags.includes("VELOCITY_HORIZ")) {
        // If we have GPS but no horizontal velocity solution
        const gpsStatus = state.gpsRawIntData.fixType
        if (gpsStatus > 0) {
          state.ekfCalculatedStatus = 1
        }
      } else if (activeFlags.includes("UNINITIALIZED")) {
        // EKF not initialized at all
        state.ekfCalculatedStatus = 1
      }
    },
    setVibrationData: (state, action) => {
      state.vibrationData = action.payload
    },
    appendToGpsTrack: (state, action) => {
      if (state.gpsTrack.length >= GPS_TRACK_MAX_LENGTH) {
        state.gpsTrack.shift()
      }
      state.gpsTrack.push(action.payload)
    },
    resetGpsTrack: (state) => {
      state.gpsTrack = []
    },
    setGpsTrackHeading: (state, action) => {
      state.gpsTrackHeading = action.payload
    },
    setTotalTimeFlying: (state, action) => {
      state.totalTimeFlying = action.payload
    },
  },
  selectors: {
    selectFlightSwVersion: (state) => state.flightSwVersion,
    selectAttitude: (state) => state.attitudeData,
    selectTelemetry: (state) => state.telemetryData,
    selectEscTelemetry1To4: (state) => state.escData.ESC_TELEMETRY_1_TO_4,
    selectEscTelemetry5To8: (state) => state.escData.ESC_TELEMETRY_5_TO_8,
    selectGPS: (state) => state.gpsData,
    selectHeading: (state) => centiDegToDeg(state.gpsData.hdg),
    selectHomePosition: (state) => state.homePosition,
    selectNavController: (state) => state.navControllerData,
    selectDesiredBearing: (state) => state.navControllerData.navBearing,
    selectHeartbeat: (state) => state.heartbeatData,
    selectHeartbeatLastReceivedAt: (state) =>
      state.heartbeatMonitor.lastReceivedAt,
    selectIsArmed: (state) => state.isArmed,
    selectIsFlying: (state) => state.isFlying,
    selectNotificationSound: (state) => state.notificationSound,
    selectFlightMode: (state) => state.heartbeatData.customMode,
    selectSystemStatus: (state) => MAV_STATE[state.heartbeatData.systemStatus],
    selectReadyToArm: (state) => {
      const isEnabled = !!(
        state.onboardControlSensorsEnabled &
        mavlinkDef.MavSysStatusSensor.PREARM_CHECK
      )
      const isHealthy = !!(
        state.onboardControlSensorsHealth &
        mavlinkDef.MavSysStatusSensor.PREARM_CHECK
      )

      // If pre-arm check is enabled, it must also be healthy
      // If pre-arm check is disabled, just check if it's healthy
      return isEnabled ? isHealthy : isHealthy
    },
    selectGPSRawInt: (state) => state.gpsRawIntData,
    selectGPS2RawInt: (state) => state.gps2RawIntData,
    selectHasSecondaryGps: (state) => state.hasSecondaryGps,
    selectHasEverHadGpsFix: (state) => state.hasEverHadGpsFix,
    selectRSSI: (state) => state.rssi,
    selectAircraftType: (state) => state.aircraftType,

    selectRawBatteryData: (state) => state.batteryData,
    selectGuidedModePinData: (state) => state.guidedModePinData,
    selectSelectedDisplayTelemetry: (state) => state.selectedDisplayTelemetry,
    selectStatusText: (state) => state.statusText,
    selectGraphValues: (state) => state.graphs.selectedGraphs,
    selectLastGraphMessage: (state) => state.graphs.lastGraphResultsMessage,
    selectEkfStatusReportData: (state) => state.ekfStatusReportData,
    selectEkfCalculatedStatus: (state) => state.ekfCalculatedStatus,
    selectVibrationData: (state) => state.vibrationData,
    selectGpsTrack: (state) => state.gpsTrack,
    selectGpsTrackHeading: (state) => state.gpsTrackHeading,
    selectTotalTimeFlying: (state) => state.totalTimeFlying,
  },
})

export const {
  setFlightSwVersion,
  setHeartbeatData,
  setHeartbeatMonitorLastReceivedAt,
  resetHeartbeatMonitor,
  soundPlayed,
  changeSelectedDisplayTelemetry,
  setSelectedDisplayTelemetry,
  setDroneAircraftType,
  setEscTelemetryData,
  setTelemetryData,
  setGpsData,
  setHomePosition,
  setAttitudeData,
  setNavControllerOutput,
  setGpsRawIntData,
  setGps2RawIntData,
  setHasEverHadGpsFix,
  setBatteryData,
  setOnboardControlSensorsEnabled,
  setOnboardControlSensorsHealth,
  setRSSIData,
  setGraphValues,
  setLastGraphMessage,
  setLoiterRadius,
  setGuidedModePinData,
  setEkfStatusReportData,
  setVibrationData,
  appendToGpsTrack,
  resetGpsTrack,
  setGpsTrackHeading,
  setTotalTimeFlying,
} = droneInfoSlice.actions

// Memoized selectors because redux is a bitch
export const selectBatteryData = createSelector(
  [droneInfoSlice.selectors.selectRawBatteryData],
  (batteryData) => [...batteryData].sort((b1, b2) => b1.id - b2.id),
)

export const selectDroneCoords = createSelector(
  [droneInfoSlice.selectors.selectGPS],
  ({ lat, lon }) => {
    return { lat: lat * 1e-7, lon: lon * 1e-7 }
  },
)

export const selectAttitudeDeg = createSelector(
  [droneInfoSlice.selectors.selectAttitude],
  ({ roll, pitch, yaw }) => {
    return {
      roll: roll * (180 / Math.PI),
      pitch: pitch * (180 / Math.PI),
      yaw: yaw * (180 / Math.PI),
    }
  },
)

export const selectEscTelemetry = createSelector(
  [
    droneInfoSlice.selectors.selectEscTelemetry1To4,
    droneInfoSlice.selectors.selectEscTelemetry5To8,
  ],
  (esc1To4, esc5To8) => {
    const escs = []

    function pushEscPacket(packet, baseIndex) {
      if (!packet) return

      // Most fields are arrays of length 4, but guard anyway
      const rpm = packet.rpm ?? []
      const count = Math.min(4, rpm.length)

      for (let i = 0; i < count; i++) {
        escs.push({
          escId: baseIndex + i + 1,
          rpm: packet.rpm?.[i] ?? null,
          current: packet.current?.[i] ?? null,
          voltage: packet.voltage?.[i] ?? null,
          temperature: packet.temperature?.[i] ?? null,
          totalcurrent: packet.totalcurrent?.[i] ?? null,
          timestamp: packet.timestamp ?? null,
        })
      }
    }

    // ESC 1-4
    pushEscPacket(esc1To4, 0)

    // ESC 5-8
    pushEscPacket(esc5To8, 4)

    return escs
  },
)

export const selectAlt = createSelector(
  [droneInfoSlice.selectors.selectGPS],
  ({ alt, relative_alt }) => {
    return { alt: alt / 1000, relativeAlt: relative_alt / 1000 }
  },
)

export const selectAircraftTypeString = createSelector(
  [droneInfoSlice.selectors.selectAircraftType],
  (aircraftType) => {
    switch (aircraftType) {
      case 1:
        return "Plane"
      case 2:
        return "Copter"
      default:
        return "Unknown"
    }
  },
)

export const selectFlightModeString = createSelector(
  [droneInfoSlice.selectors.selectFlightMode, selectAircraftTypeString],
  (flightMode, aircraftType) => {
    const flightModeMap = getFlightModeMap(aircraftType)
    return flightModeMap[flightMode] || "UNKNOWN"
  },
)

export const calculateGpsTrackHeadingThunk = () => (dispatch, getState) => {
  // If the GPS speed is above a certain threshold, use the COG directly
  // Otherwise, calculate the bearing from the last two GPS points if the distance is above a threshold
  const { gpsTrack, gpsRawIntData } = getState().droneInfo

  let computedBearing = null
  let computedDistance = null

  if (gpsTrack.length >= 2) {
    const lastPos = gpsTrack[gpsTrack.length - 1]
    const secondLastPos = gpsTrack[gpsTrack.length - 2]
    const convertedLastPos = [intToCoord(lastPos.lon), intToCoord(lastPos.lat)]
    const convertedSecondLastPos = [
      intToCoord(secondLastPos.lon),
      intToCoord(secondLastPos.lat),
    ]
    computedDistance = distance(convertedLastPos, convertedSecondLastPos, {
      units: "meters",
    })
    computedBearing = bearing(convertedSecondLastPos, convertedLastPos)
    if (computedBearing < 0) {
      computedBearing += 360
    }
  }

  const gpsVel = gpsRawIntData.velocity
  const gpsCog = gpsRawIntData.courseOverGround
  if (gpsVel >= minGpsSpeedForHeading && gpsCog !== null) {
    dispatch(setGpsTrackHeading(gpsCog))
  } else if (
    computedDistance !== null &&
    computedDistance >= minGpsDistanceForHeading
  ) {
    dispatch(setGpsTrackHeading(computedBearing))
  } else {
    // Keep previous heading
  }
}

export const {
  selectFlightSwVersion,
  selectAttitude,
  selectTelemetry,
  selectGPS,
  selectHomePosition,
  selectNavController,
  selectDesiredBearing,
  selectHeartbeat,
  selectHeartbeatLastReceivedAt,
  selectIsArmed,
  selectIsFlying,
  selectReadyToArm,
  selectGPSRawInt,
  selectGPS2RawInt,
  selectHasSecondaryGps,
  selectHasEverHadGpsFix,
  selectRSSI,
  selectHeading,
  selectSystemStatus,
  selectNotificationSound,
  selectEscTelemetry1To4,
  selectEscTelemetry5To8,
  selectFlightMode,
  selectAircraftType,
  selectGuidedModePinData,
  selectSelectedDisplayTelemetry,
  selectGraphValues,
  selectLastGraphMessage,
  selectEkfStatusReportData,
  selectEkfCalculatedStatus,
  selectVibrationData,
  selectGpsTrack,
  selectGpsTrackHeading,
  selectTotalTimeFlying,
} = droneInfoSlice.selectors

export default droneInfoSlice
