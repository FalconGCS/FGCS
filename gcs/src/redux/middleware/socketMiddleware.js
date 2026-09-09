// this redux middleware intercepts all actions from the

// socket actions
import {
  initSocket,
  socketConnected,
  socketDisconnected,
} from "../slices/socketSlice"

// drone actions
import {
  ConnectionType,
  emitConnectToDrone,
  emitGetComPorts,
  emitIsConnectedToDrone,
  setComPorts,
  setConnected,
  setConnectedToSimulator,
  setConnecting,
  setConnectionModal,
  setConnectionStatus,
  setFetchingComPorts,
  setForceArmModalOpened,
  setForceDisarmModalOpened,
  setSelectedComPorts,
} from "../slices/droneConnectionSlice"

import {
  clearSimulationLoadingNotificationId,
  setSimulationLoadingNotificationId,
  setSimulationStatus,
  SimulationStatus,
} from "../slices/simulationParamsSlice"

// socket factory
import { dataFormatters } from "../../helpers/dataFormatters.js"
import { isGlobalFrameHomeCommand } from "../../helpers/filterMissions.js"
import {
  EKF_STATUS_WARNING_LEVEL,
  FRAME_CLASS_MAP,
} from "../../helpers/mavlinkConstants.js"
import { CHECKLIST_AUTO_BINDINGS } from "../../helpers/checklistAutoBindings"
import {
  closeLoadingNotification,
  redColor,
  showErrorNotification,
  showLoadingNotification,
  showSuccessNotification,
  showWarningNotification,
} from "../../helpers/notification.js"
import SocketFactory from "../../helpers/socket"
import {
  emitGetFlightModeConfig,
  emitGetGripperConfig,
  setChannelsConfig,
  setCurrentPwmValue,
  setFlightModeChannel,
  setFlightModesList,
  setFrameClass,
  setFrameTypeDirection,
  setFrameTypeName,
  setFrameTypeOrder,
  setGetGripperEnabled,
  setGripperConfig,
  setNumberOfMotors,
  setRadioCalibrationModalOpen,
  setRadioPwmChannels,
  setRefreshingFlightModeData,
  setRefreshingGripperConfigData,
  setSerialPortsConfig,
  setServoConfig,
  setServoPwmOutputs,
  setShowMotorTestWarningModal,
  updateChannelsConfigParam,
  updateGripperConfigParam,
  updateSerialPortConfigParam,
  updateServoConfigParam,
} from "../slices/configSlice.js"
import {
  appendToGpsTrack,
  calculateGpsTrackHeadingThunk,
  resetGpsTrack,
  setAttitudeData,
  setBatteryData,
  setDroneAircraftType,
  setEkfStatusReportData,
  setEscTelemetryData,
  setFlightSwVersion,
  setGps2RawIntData,
  setGpsData,
  setGpsRawIntData,
  setGuidedModePinData,
  setHasEverHadGpsFix,
  setHeartbeatData,
  setHomePosition,
  setLastGraphMessage,
  setLoiterRadius,
  setNavControllerOutput,
  setOnboardControlSensorsEnabled,
  setOnboardControlSensorsHealth,
  setRSSIData,
  setSelectedDisplayTelemetry,
  setTelemetryData,
  setTotalTimeFlying,
  setVibrationData,
} from "../slices/droneInfoSlice"
import {
  addFiles,
  resetFiles,
  setIsReadingFile,
  setLoadingListFiles,
  setLogPath,
  setReadFileData,
  setReadFileProgress,
} from "../slices/ftpSlice.js"
import {
  addIdToItem,
  closeDashboardMissionFetchingNotificationNoSuccessThunk,
  closeDashboardMissionFetchingNotificationThunk,
  setCurrentMission,
  setCurrentMissionItems,
  setDrawingFenceItems,
  setDrawingMissionItems,
  setDrawingRallyItems,
  setIsFetchingDashboardMission,
  setMissionProgressData,
  setMissionProgressModal,
  setShouldFetchAllMissionsOnDashboard,
  setTargetInfo,
  setUnwrittenChanges,
  setUpdatePlannedHomePositionFromLoadData,
  setUpdatePlannedHomePositionFromLoadModal,
} from "../slices/missionSlice"
import {
  emitRefreshParams,
  resetParamsWriteProgressData,
  setAutoPilotRebootModalOpen,
  setFetchingParam,
  setFetchingVars,
  setFetchingVarsProgress,
  setHasFetchedOnce,
  setModifiedParams,
  setParams,
  setParamSearchValue,
  setParamsFailedToWrite,
  setParamsFailedToWriteModalOpen,
  setParamsWriteProgressData,
  setParamsWriteProgressModalOpen,
  setRebootData,
  setRebootPromptModalOpen,
  setShownParams,
  updateParamValue,
} from "../slices/paramsSlice.js"
import { pushMessage } from "../slices/statusTextSlice.js"
import { setChecklistAutoBindingChecked } from "../slices/checklistSlice"
import { handleEmitters } from "./emitters.js"

const SocketEvents = Object.freeze({
  Connect: "connect",
  Disconnect: "disconnect",
  isConnectedToDrone: "is_connected_to_drone",
  listComPorts: "list_com_ports",
  linkDebugStats: "link_debug_stats",
  onSimulationResult: "simulation_result",
  onSimulationLoading: "simulation_loading",
})

const DroneSpecificSocketEvents = Object.freeze({
  onForwardingStatus: "forwarding_status",
  onDroneError: "drone_error",
  onArmDisarm: "arm_disarm",
  onSetCurrentFlightMode: "set_current_flight_mode_result",
  onNavResult: "nav_result",
  onHomePositionResult: "home_position_result",
  onIncomingMsg: "incoming_msg",
  onNavRepositionResult: "nav_reposition_result",
  onGetLoiterRadiusResult: "nav_get_loiter_radius_result",
  onSetLoiterRadiusResult: "nav_set_loiter_radius_result",
})

const ParamSpecificSocketEvents = Object.freeze({
  onRebootAutopilot: "reboot_autopilot",
  onGetParamsResult: "get_params_result",
  onParamRequestUpdate: "param_request_update",
  onParamSetSuccess: "param_set_success",
  onParamError: "params_error",
  onExportParamsResult: "export_params_result",
  onSetMultipleParamsProgress: "set_multiple_params_progress",
})

const MissionSpecificSocketEvents = Object.freeze({
  onMissionControlResult: "mission_control_result",
  onWriteMissionResult: "write_mission_result",
  onImportMissionResult: "import_mission_result",
  onExportMissionResult: "export_mission_result",
  onCurrentMissionAll: "current_mission_all",
  onCurrentMission: "current_mission",
  onTargetInfo: "target_info",
  onCurrentMissionProgress: "current_mission_progress",
})

const ConfigSpecificSocketEvents = Object.freeze({
  onGripperEnabled: "is_gripper_enabled",
  onSetGripperEnabledResult: "set_gripper_enabled_result",
  onSetGripperDisabledResult: "set_gripper_disabled_result",
  onSetGripperResult: "set_gripper_result",
  onGripperConfig: "gripper_config",
  setGripperParamResult: "set_gripper_param_result",
  onMotorTestResult: "motor_test_result",
  onFlightModeConfig: "flight_mode_config",
  onSetFlightModeResult: "set_flight_mode_result",
  onSetFlightModeChannelResult: "set_flight_mode_channel_result",
  onFrameTypeConfig: "frame_type_config",
  onRcConfig: "rc_config",
  onSetRcConfigResult: "set_rc_config_result",
  onBatchSetRcConfigResult: "batch_set_rc_config_result",
  onServoConfig: "servo_config",
  onSetServoConfigResult: "set_servo_config_result",
  onBatchSetServoConfigResult: "batch_set_servo_config_result",
  onTestServoPwmResult: "test_servo_result",
  onSerialPortsConfig: "serial_ports_config",
  onSetSerialPortConfigResult: "set_serial_port_config_result",
  onBatchSetSerialPortConfigResult: "batch_set_serial_port_config_result",
})

const FtpSpecificSocketEvents = Object.freeze({
  onListFilesResult: "list_files_result",
  onListLogFilesResult: "list_log_files_result",
  onReadFileResult: "read_file_result",
  onReadFileProgress: "read_file_progress",
})

const socketMiddleware = (store) => {
  let socket

  function handleRcChannels(msg) {
    let chans = {}
    const chanCount = msg.chancount || 16 // default to 16 channels if chancount is 0
    for (let i = 1; i < chanCount + 1; i++) {
      chans[i] = msg[`chan${i}_raw`]
    }

    store.dispatch(setRadioPwmChannels(chans))
  }

  function handleServoOutputRaw(msg) {
    const outputs = {}
    for (let i = 1; i <= 16; i++) {
      const pwm = msg[`servo${i}_raw`]
      if (typeof pwm === "number") outputs[i] = pwm
    }

    store.dispatch(setServoPwmOutputs(outputs))
  }

  function syncSingleParamInParamsSlice(paramId, value) {
    if (!paramId || value === undefined) {
      return
    }

    store.dispatch(
      updateParamValue({
        param_id: paramId,
        param_value: value,
      }),
    )
  }

  function syncBatchParamsInParamsSlice(paramsList) {
    if (!Array.isArray(paramsList) || paramsList.length === 0) {
      return
    }

    for (const param of paramsList) {
      const paramId = param?.param_id
      const paramValue =
        param?.param_value !== undefined ? param.param_value : param?.value
      syncSingleParamInParamsSlice(paramId, paramValue)
    }
  }

  const incomingMessageHandler = (msg) => {
    switch (msg.mavpackettype) {
      case "VFR_HUD":
        store.dispatch(setTelemetryData(msg))
        break
      case "ATTITUDE":
        store.dispatch(setAttitudeData(msg))
        break
      case "GLOBAL_POSITION_INT":
        store.dispatch(setGpsData(msg))
        store.dispatch(
          appendToGpsTrack({
            lat: msg.lat,
            lon: msg.lon,
          }),
        )
        store.dispatch(calculateGpsTrackHeadingThunk())
        break
      case "NAV_CONTROLLER_OUTPUT":
        store.dispatch(setNavControllerOutput(msg))
        break
      case "HEARTBEAT":
        store.dispatch(setHeartbeatData(msg))
        break
      case "STATUSTEXT":
        store.dispatch(pushMessage(msg))
        window.ipcRenderer.invoke("app:update-statustext", msg)
        break
      case "SYS_STATUS":
        store.dispatch(
          setOnboardControlSensorsEnabled(msg.onboard_control_sensors_enabled),
        )
        store.dispatch(
          setOnboardControlSensorsHealth(msg.onboard_control_sensors_health),
        )
        break
      case "GPS_RAW_INT": {
        // MAVLink GPS_RAW_INT provides 'eph' (HDOP * 100).
        const hdop = msg.eph != null ? msg.eph / 100.0 : null

        store.dispatch(
          setGpsRawIntData({
            ...msg,
            hdop,
          }),
        )
        store.dispatch(calculateGpsTrackHeadingThunk())
        break
      }
      case "GPS2_RAW": {
        // MAVLink GPS2_RAW provides 'eph' (HDOP * 100).
        const hdop = msg.eph != null ? msg.eph / 100.0 : null

        store.dispatch(
          setGps2RawIntData({
            ...msg,
            hdop,
          }),
        )
        break
      }
      case "RC_CHANNELS":
        // NOTE: UNABLE TO TEST IN SIMULATOR!
        store.dispatch(setRSSIData(msg.rssi))
        handleRcChannels(msg)
        break
      case "MISSION_CURRENT":
        store.dispatch(setCurrentMission(msg))
        break
      case "BATTERY_STATUS":
        store.dispatch(setBatteryData(msg))
        break
      case "EKF_STATUS_REPORT": {
        const data = {
          compass_variance: msg.compass_variance,
          pos_horiz_variance: msg.pos_horiz_variance,
          pos_vert_variance: msg.pos_vert_variance,
          terrain_alt_variance: msg.terrain_alt_variance,
          velocity_variance: msg.velocity_variance,
          flags: msg.flags,
        }
        store.dispatch(setEkfStatusReportData(data))

        const { ekfCalculatedStatus } = store.getState().droneInfo
        store.dispatch(
          setChecklistAutoBindingChecked({
            bindingKey: CHECKLIST_AUTO_BINDINGS.EkfAllGreen.key,
            checked: ekfCalculatedStatus <= EKF_STATUS_WARNING_LEVEL,
          }),
        )

        window.ipcRenderer.invoke("app:update-ekf-status", data)
        break
      }
      case "VIBRATION": {
        const data = {
          vibration_x: msg.vibration_x,
          vibration_y: msg.vibration_y,
          vibration_z: msg.vibration_z,
          clipping_0: msg.clipping_0,
          clipping_1: msg.clipping_1,
          clipping_2: msg.clipping_2,
        }
        store.dispatch(setVibrationData(data))
        window.ipcRenderer.invoke("app:update-vibe-status", data)
        break
      }
      case "ESC_TELEMETRY_1_TO_4":
      case "ESC_TELEMETRY_5_TO_8":
        store.dispatch(setEscTelemetryData(msg))
        break
      case "SERVO_OUTPUT_RAW":
        handleServoOutputRaw(msg)
        break
    }
  }

  return (next) => (action) => {
    if (initSocket.match(action)) {
      // client side execution
      if (!socket && typeof window !== "undefined") {
        socket = SocketFactory.create()

        /*
          ========================
          = UNDERLYING CONNECTION =
          ========================
        */

        // handle socket connection events
        // EXAMPLE SOCKET.ON EVENT
        socket.socket.on(SocketEvents.Connect, () => {
          // DISPATCH ALL ACTIONS HERE
          // SINCE IT'S MIDDLEWARE, OTHER FUNCTIONS CAN ALSO BE CALLED
          console.log(`Connected to socket from redux, ${socket.socket.id}`)
          store.dispatch(socketConnected())
          store.dispatch(emitIsConnectedToDrone())
        })

        socket.socket.on(SocketEvents.Disconnect, () => {
          console.log(`Disconnected from socket via redux, ${socket.socket.id}`)
          store.dispatch(socketDisconnected())
        })

        /*
          ====================
          = DRONE CONNECTIONS =
          ====================
        */

        socket.socket.on("connected", () => {
          store.dispatch(setConnected(true))
        })

        socket.socket.on("disconnect", () => {
          store.dispatch(setConnected(false))
          store.dispatch(setConnecting(false))
          store.dispatch(
            closeDashboardMissionFetchingNotificationNoSuccessThunk(),
          )
        })

        socket.socket.on("is_connected_to_drone", (msg) => {
          if (msg) {
            store.dispatch(setConnected(true))
          } else {
            store.dispatch(setConnected(false))
            store.dispatch(setConnecting(false))
            store.dispatch(emitGetComPorts())
          }
        })

        socket.socket.on("reboot_connecting", () => {
          store.dispatch(setConnecting(true))
        })

        // Fetch com ports and list them
        socket.socket.on("list_com_ports", (msg) => {
          store.dispatch(setFetchingComPorts(false))
          store.dispatch(setComPorts(msg))
          const possibleComPort = msg.find(
            (port) =>
              port.toLowerCase().includes("mavlink") ||
              port.toLowerCase().includes("ardupilot"),
          )
          if (!store.getState().droneConnection.selected_com_ports) {
            // If no com port is selected, select a possible mavlink/ardupilot port if it exists, otherwise select the first port
            if (possibleComPort !== undefined) {
              store.dispatch(setSelectedComPorts(possibleComPort))
            } else if (msg.length > 0) {
              store.dispatch(setSelectedComPorts(msg[0]))
            }
          }
        })

        // Flags that the drone is disconnected
        socket.socket.on("disconnected_from_drone", () => {
          store.dispatch(setConnected(false))
          store.dispatch(setConnectedToSimulator(false))
          store.dispatch(
            setGpsData({
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
            }),
          )
          store.dispatch(
            setHomePosition({
              lat: 0,
              lon: 0,
              alt: 0,
            }),
          )
          store.dispatch(resetGpsTrack())
          store.dispatch(setIsFetchingDashboardMission(false))
          store.dispatch(
            closeDashboardMissionFetchingNotificationNoSuccessThunk(),
          )

          window.ipcRenderer.send("window:update-title", "FGCS")
        })

        // Flags an error with the com port
        socket.socket.on("connection_error", (msg) => {
          console.error("Connection error: " + msg.message)
          showErrorNotification(msg.message)
          store.dispatch(setConnecting(false))
          store.dispatch(setConnected(false))
        })

        // Setting connection status
        socket.socket.on("drone_connect_status", (msg) => {
          store.dispatch(
            setConnectionStatus({
              message: msg.message,
              sub_message: msg.sub_message || "",
              progress: msg.progress,
            }),
          )
        })

        // Flags that the drone is connected
        socket.socket.on("connected_to_drone", (msg) => {
          store.dispatch(
            setHomePosition({
              lat: 0,
              lon: 0,
              alt: 0,
            }),
          )
          store.dispatch(setDroneAircraftType(msg.aircraft_type)) // There are two aircraftTypes, make sure to not use FLA one haha :D
          if (msg.aircraft_type !== 1 && msg.aircraft_type !== 2) {
            showErrorNotification("Aircraft not of type quadcopter or plane")
          }

          store.dispatch(setFlightSwVersion(msg.flight_sw_version))
          store.dispatch(setConnected(true))
          store.dispatch(setConnecting(false))
          store.dispatch(setConnectionModal(false))

          store.dispatch(setGuidedModePinData({ lat: 0, lon: 0, alt: 0 }))
          store.dispatch(setRebootData({}))
          store.dispatch(setAutoPilotRebootModalOpen(false))
          store.dispatch(setShouldFetchAllMissionsOnDashboard(true))
          store.dispatch(setShowMotorTestWarningModal(true))
          store.dispatch(resetGpsTrack())
          store.dispatch(resetFiles())
          store.dispatch(setIsReadingFile(false))
          store.dispatch(setReadFileData(null))
          store.dispatch(setTotalTimeFlying(0))
          store.dispatch(setHasEverHadGpsFix(false))
          store.dispatch(setIsFetchingDashboardMission(false))
        })

        socket.socket.on(ParamSpecificSocketEvents.onRebootAutopilot, (msg) => {
          store.dispatch(setRebootData(msg))
          if (msg.success) {
            store.dispatch(setAutoPilotRebootModalOpen(false))
            showSuccessNotification(msg.message)
            store.dispatch(setRebootData({}))
          } else {
            store.dispatch(setConnecting(false))
          }
        })

        // Simulation status messages
        socket.socket.on(SocketEvents.onSimulationLoading, (msg) => {
          const operationId = msg.operationId || "simulation-loading"
          const state = store.getState()
          const idsByOp =
            state.simulationParams.loadingNotificationIdsByOperation
          const existingId = idsByOp?.[operationId]

          if (msg.loading) {
            if (existingId != null) {
              closeLoadingNotification(
                existingId,
                "Cancelled",
                "Overwritten by new loading notification",
              )
            }

            const id = showLoadingNotification(msg.title, msg.message)
            store.dispatch(
              setSimulationLoadingNotificationId({
                operationId,
                notificationId: id,
              }),
            )
          } else {
            if (existingId != null) {
              closeLoadingNotification(
                existingId,
                msg.title,
                msg.message,
                msg.success === false ? { color: redColor } : {},
              )
              store.dispatch(
                clearSimulationLoadingNotificationId({ operationId }),
              )
            }
          }
        })

        // Simulation final messages
        socket.socket.on(SocketEvents.onSimulationResult, (msg) => {
          if (msg.running === true) {
            store.dispatch(setSimulationStatus(SimulationStatus.Running))
          } else if (msg.running === false) {
            store.dispatch(setSimulationStatus(SimulationStatus.Idle))
          }
          // Else result does not change the status

          msg.success
            ? showSuccessNotification(msg.message)
            : showErrorNotification(msg.message)

          if (msg.connect) {
            const storeState = store.getState()
            store.dispatch(setConnecting(true))
            store.dispatch(
              emitConnectToDrone({
                port: `tcp:127.0.0.1:${msg.port}`,
                baud: 115200,
                connectionType: ConnectionType.Network,
                forwardingAddress: storeState.droneConnection.forwardingAddress,
              }),
            )
            store.dispatch(setConnectedToSimulator(true))
          }
        })

        socket.socket.on("fetching_param", (msg) => {
          store.dispatch(setFetchingParam(msg.message))
        })

        // Link stats
        socket.socket.on(SocketEvents.linkDebugStats, (msg) => {
          window.ipcRenderer.invoke("app:update-link-stats", msg)
        })

        /*
          Telemetry Socket Connection Events
        */
        socket.telemetrySocket.on("connect", () => {
          console.log(
            `Connected to telemetry socket: ${socket.telemetrySocket.id}`,
          )
        })

        socket.telemetrySocket.on("disconnect", () => {
          console.log(
            `Disconnected from telemetry socket: ${socket.telemetrySocket.id}`,
          )
        })

        // I don't understand whatsoever why this doesn't work with the standard
        // on method.
        socket.telemetrySocket.onAny((eventName, ...args) => {
          if (eventName !== DroneSpecificSocketEvents.onIncomingMsg) {
            return
          }

          const msg = args[0]

          incomingMessageHandler(msg)

          // Data points on dashboard, the below code updates the value in the store when a new message
          // comes in in the type of specificData.
          const packetType = msg.mavpackettype
          const storeState = store.getState()
          if (storeState !== undefined) {
            const selectedDisplayTelemetry =
              storeState.droneInfo.selectedDisplayTelemetry
            let hasSelectedDisplayTelemetryChange = false

            const updatedSelectedDisplayTelemetry =
              selectedDisplayTelemetry.map((dataItem) => {
                if (
                  typeof dataItem.currently_selected === "string" &&
                  dataItem.currently_selected.startsWith(packetType)
                ) {
                  const specificData = dataItem.currently_selected.split(".")[1]
                  if (Object.prototype.hasOwnProperty.call(msg, specificData)) {
                    const nextValue = msg[specificData]
                    if (dataItem.value !== nextValue) {
                      hasSelectedDisplayTelemetryChange = true
                      return { ...dataItem, value: nextValue }
                    }
                  }
                }
                return dataItem
              })

            if (hasSelectedDisplayTelemetryChange) {
              store.dispatch(
                setSelectedDisplayTelemetry(updatedSelectedDisplayTelemetry),
              )
            }
          }

          // Handle graph messages
          function getGraphDataFromMessage(msg, targetMessageKey) {
            const returnDataArray = []

            // SAFETY: if storeState or selectedGraphs missing, bail cleanly
            const selectedGraphs = storeState?.droneInfo?.graphs?.selectedGraphs
            if (!selectedGraphs) return false

            for (const graphKey in selectedGraphs) {
              const messageKey = selectedGraphs[graphKey] // e.g. "ATTITUDE.yaw"
              if (!messageKey) continue

              // Safer than `includes` (prevents weird accidental matches)
              if (!messageKey.startsWith(`${targetMessageKey}.`)) continue

              const [, valueName] = messageKey.split(".")
              const raw = msg?.[valueName]

              // SAFETY: skip if value isn't present
              if (raw === undefined || raw === null) continue

              // Coerce to number if possible
              const rawNum = Number(raw)
              if (!Number.isFinite(rawNum)) continue

              let formatted_value = rawNum

              // Applying Data Formatters (guarded)
              if (messageKey in dataFormatters) {
                // formatter expects a string in your original code
                formatted_value = dataFormatters[messageKey](rawNum.toFixed(3))
              }

              returnDataArray.push({
                data: { x: Date.now(), y: formatted_value },
                graphKey,
              })
            }

            return returnDataArray.length ? returnDataArray : false
          }

          let graphData = false
          try {
            graphData = getGraphDataFromMessage(msg, msg.mavpackettype)
          } catch (e) {
            console.error("Graph extraction crashed:", e, {
              mavpackettype: msg?.mavpackettype,
            })
            graphData = false
          }

          // keep existing tab behaviour
          store.dispatch(setLastGraphMessage(graphData))

          // forward to any open graph windows
          if (graphData) {
            window.ipcRenderer
              .invoke("app:update-graph-windows", graphData)
              .catch((e) => console.error("update-graph-windows failed:", e))
          }

          // Handle Flight Mode incoming data
          if (
            msg.mavpackettype === "RC_CHANNELS" &&
            storeState.config.flightModeChannel !== "UNKNOWN"
          ) {
            store.dispatch(
              setCurrentPwmValue(
                msg[`chan${storeState.config.flightModeChannel}_raw`],
              ),
            )
          }
        })

        socket.socket.on(
          MissionSpecificSocketEvents.onImportMissionResult,
          (msg) => {
            if (msg.success) {
              const storeState = store.getState()

              if (msg.mission_type === "mission") {
                const missionItemsWithIds = []
                for (let missionItem of msg.items) {
                  missionItemsWithIds.push(addIdToItem(missionItem))
                }

                // Check if first item is a home location, then open modal to
                // select whether to update planned home position
                if (missionItemsWithIds.length > 0) {
                  const potentialHomeLocation = missionItemsWithIds[0]
                  const currentPlannedHomeLocation =
                    storeState.missionInfo.plannedHomePosition

                  // Check if the potential home location is different from the current planned home location
                  if (
                    isGlobalFrameHomeCommand(potentialHomeLocation) &&
                    (potentialHomeLocation.x !==
                      currentPlannedHomeLocation.lat ||
                      potentialHomeLocation.y !==
                        currentPlannedHomeLocation.lon ||
                      potentialHomeLocation.z !==
                        currentPlannedHomeLocation.alt)
                  ) {
                    store.dispatch(
                      setUpdatePlannedHomePositionFromLoadData({
                        lat: potentialHomeLocation.x,
                        lon: potentialHomeLocation.y,
                        alt: potentialHomeLocation.z,
                        from: "file",
                      }),
                    )
                    store.dispatch(
                      setUpdatePlannedHomePositionFromLoadModal(true),
                    )
                  }
                }
                store.dispatch(setDrawingMissionItems(missionItemsWithIds))
                store.dispatch(
                  setUnwrittenChanges({
                    ...storeState.missionInfo.unwrittenChanges,
                    mission: true,
                  }),
                )
              } else if (msg.mission_type === "fence") {
                const fenceItemsWithIds = []
                for (let fence of msg.items) {
                  fenceItemsWithIds.push(addIdToItem(fence))
                }
                store.dispatch(setDrawingFenceItems(fenceItemsWithIds))
                store.dispatch(
                  setUnwrittenChanges({
                    ...storeState.missionInfo.unwrittenChanges,
                    fence: true,
                  }),
                )
              } else if (msg.mission_type === "rally") {
                const rallyItemsWithIds = []
                for (let rallyItem of msg.items) {
                  rallyItemsWithIds.push(addIdToItem(rallyItem))
                }

                store.dispatch(setDrawingRallyItems(rallyItemsWithIds))
                store.dispatch(
                  setUnwrittenChanges({
                    ...storeState.missionInfo.unwrittenChanges,
                    rally: true,
                  }),
                )
              }

              showSuccessNotification(msg.message)
            } else {
              showErrorNotification(msg.message)
            }
          },
        )

        socket.socket.on(
          MissionSpecificSocketEvents.onExportMissionResult,
          (msg) => {
            msg.success
              ? showSuccessNotification(msg.message)
              : showErrorNotification(msg.message)
          },
        )
      }
    }

    if (setConnected.match(action)) {
      // Setup socket listeners on drone connection
      if (action.payload) {
        socket.socket.on(
          DroneSpecificSocketEvents.onForwardingStatus,
          (msg) => {
            if (msg.success) {
              showSuccessNotification(msg.message)
            } else {
              showErrorNotification(msg.message)
            }
          },
        )

        socket.socket.on(DroneSpecificSocketEvents.onDroneError, (msg) => {
          showErrorNotification(msg.message)
        })

        socket.socket.on(DroneSpecificSocketEvents.onArmDisarm, (msg) => {
          if (!msg.success) {
            const offerForce = msg.data?.offer_force === true

            // Check if this was a disarm attempt and was not a force disarm
            if (msg.data?.was_disarming && !msg.data?.was_force && offerForce) {
              store.dispatch(setForceDisarmModalOpened(true))
            } else if (
              !msg.data?.was_disarming &&
              !msg.data?.was_force &&
              offerForce
            ) {
              // Failed non-force arm attempt — offer force arm
              store.dispatch(setForceArmModalOpened(true))
            } else {
              showErrorNotification(msg.message)
            }
          }
        })

        socket.socket.on(
          DroneSpecificSocketEvents.onSetCurrentFlightMode,
          (msg) => {
            msg.success
              ? showSuccessNotification(msg.message)
              : showErrorNotification(msg.message)
          },
        )

        socket.socket.on(DroneSpecificSocketEvents.onNavResult, (msg) => {
          msg.success
            ? showSuccessNotification(msg.message)
            : showErrorNotification(msg.message)
        })

        socket.socket.on(
          DroneSpecificSocketEvents.onHomePositionResult,
          (msg) => {
            if (msg.success) {
              store.dispatch(setHomePosition(msg.data)) // use actual home position
            } else {
              // If home position could not be fetched because GPS fix has never
              // been acquired, we can ignore this message
              if (msg.data === "NEVER_HAD_GPS_FIX") {
                return
              }
              showErrorNotification(msg.message)
            }
          },
        )

        socket.socket.on(ParamSpecificSocketEvents.onGetParamsResult, (msg) => {
          if (msg.success) {
            store.dispatch(setParams(msg.data))
            store.dispatch(setShownParams(msg.data))
          }
          store.dispatch(setHasFetchedOnce(true))
          store.dispatch(setFetchingVars(false))
          store.dispatch(setFetchingVarsProgress({ progress: 0, param_id: "" }))
          store.dispatch(setParamSearchValue(""))
        })

        socket.socket.on(
          ParamSpecificSocketEvents.onParamRequestUpdate,
          (msg) => {
            store.dispatch(
              setFetchingVarsProgress({
                progress:
                  (msg.current_param_index / msg.total_number_of_params) * 100,
                param_id: msg.current_param_id,
              }),
            )
          },
        )

        socket.socket.on(ParamSpecificSocketEvents.onParamSetSuccess, (msg) => {
          const paramsSetSuccessfully = msg.data.params_set_successfully
          const paramsNotSet = msg.data.params_could_not_set
          if (paramsNotSet.length > 0 && paramsSetSuccessfully.length > 0) {
            showWarningNotification(msg.message)
          } else if (paramsNotSet.length > 0) {
            showErrorNotification(msg.message)
          } else {
            showSuccessNotification(msg.message)
          }

          const modifiedParams = store.getState().paramsSlice.modifiedParams

          // Only clear the params that got set successfully
          store.dispatch(
            setModifiedParams(
              modifiedParams.filter(
                (param) =>
                  !paramsSetSuccessfully.some(
                    (setParam) => setParam.param_id === param.param_id,
                  ),
              ),
            ),
          )

          // Update the param in the params list also
          for (let param of paramsSetSuccessfully) {
            store.dispatch(updateParamValue(param))
          }

          store.dispatch(resetParamsWriteProgressData())
          store.dispatch(setParamsWriteProgressModalOpen(false))

          if (paramsNotSet.length !== 0) {
            store.dispatch(setParamsFailedToWrite(paramsNotSet))
            store.dispatch(setParamsFailedToWriteModalOpen(true))
          }

          const rebootRequired = paramsSetSuccessfully.some(
            (param) => param.reboot_required === true,
          )

          if (rebootRequired) {
            store.dispatch(setRebootPromptModalOpen(true))
          }

          // Refresh params if an _ENABLE param has been changed
          const hasEnableParam = paramsSetSuccessfully.some((param) =>
            String(param?.param_id || "")
              .toUpperCase()
              .endsWith("_ENABLE"),
          )
          const isOnParamsPage =
            store.getState().droneConnection.currentPage === "params"
          const isAlreadyFetching = store.getState().paramsSlice.fetchingVars

          if (hasEnableParam && isOnParamsPage && !isAlreadyFetching) {
            store.dispatch(
              setFetchingVarsProgress({ progress: 0, param_id: "" }),
            )
            store.dispatch(setFetchingVars(true))
            store.dispatch(emitRefreshParams())
          }
        })

        socket.socket.on(ParamSpecificSocketEvents.onParamError, (msg) => {
          showErrorNotification(msg.message)
          store.dispatch(setFetchingVars(false))
          store.dispatch(resetParamsWriteProgressData())
          store.dispatch(setParamsWriteProgressModalOpen(false))
        })

        socket.socket.on(
          ParamSpecificSocketEvents.onExportParamsResult,
          (msg) => {
            if (msg.success) {
              showSuccessNotification(msg.message)
            } else {
              showErrorNotification(msg.message)
            }
          },
        )

        socket.socket.on(
          ParamSpecificSocketEvents.onSetMultipleParamsProgress,
          (msg) => {
            store.dispatch(
              setParamsWriteProgressData({
                message: msg.message,
                param_id: msg.param_id,
                current_index: msg.current_index,
                total_params: msg.total_params,
              }),
            )
          },
        )

        socket.socket.on(
          DroneSpecificSocketEvents.onNavRepositionResult,
          (msg) => {
            if (msg.success) {
              showSuccessNotification(msg.message)
              store.dispatch(setGuidedModePinData(msg.data))
            } else {
              showErrorNotification(msg.message)
            }
          },
        )

        socket.socket.on(
          DroneSpecificSocketEvents.onGetLoiterRadiusResult,
          (msg) => {
            if (msg.success) {
              store.dispatch(setLoiterRadius(msg.data))
            } else {
              showErrorNotification(msg.message)
            }
          },
        )

        socket.socket.on(
          DroneSpecificSocketEvents.onSetLoiterRadiusResult,
          (msg) => {
            msg.success
              ? showSuccessNotification(msg.message)
              : showErrorNotification(msg.message)
          },
        )

        /*
          Missions
        */
        socket.socket.on(
          MissionSpecificSocketEvents.onCurrentMissionAll,
          (msg) => {
            if (!msg.success) {
              showErrorNotification(msg.message)
            } else {
              store.dispatch(
                setCurrentMissionItems({
                  missionItems: msg.mission_items,
                  fenceItems: msg.fence_items,
                  rallyItems: msg.rally_items,
                }),
              )
              store.dispatch(setShouldFetchAllMissionsOnDashboard(false))
            }
            store.dispatch(closeDashboardMissionFetchingNotificationThunk())
            store.dispatch(setIsFetchingDashboardMission(false))
          },
        )

        socket.socket.on(
          MissionSpecificSocketEvents.onCurrentMission,
          (msg) => {
            // Close modal
            store.dispatch(setMissionProgressModal(false))

            if (msg.success) {
              // Handle each mission item
              const storeState = store.getState()
              if (msg.mission_type === "mission") {
                const missionItemsWithIds = []
                for (let missionItem of msg.items) {
                  missionItemsWithIds.push(addIdToItem(missionItem))
                }

                // Check if first item is a home location, then open modal to
                // select whether to update planned home position
                if (missionItemsWithIds.length > 0) {
                  const potentialHomeLocation = missionItemsWithIds[0]
                  const currentPlannedHomeLocation =
                    storeState.missionInfo.plannedHomePosition

                  // Check if the potential home location is different from the current planned home location
                  if (
                    isGlobalFrameHomeCommand(potentialHomeLocation) &&
                    (potentialHomeLocation.x !==
                      currentPlannedHomeLocation.lat ||
                      potentialHomeLocation.y !==
                        currentPlannedHomeLocation.lon ||
                      potentialHomeLocation.z !==
                        currentPlannedHomeLocation.alt)
                  ) {
                    store.dispatch(
                      setUpdatePlannedHomePositionFromLoadData({
                        lat: potentialHomeLocation.x,
                        lon: potentialHomeLocation.y,
                        alt: potentialHomeLocation.z,
                        from: "drone",
                      }),
                    )
                    store.dispatch(
                      setUpdatePlannedHomePositionFromLoadModal(true),
                    )
                  }
                }
                store.dispatch(setDrawingMissionItems(missionItemsWithIds))
                store.dispatch(
                  setUnwrittenChanges({
                    ...storeState.missionInfo.unwrittenChanges,
                    mission: false,
                  }),
                )
              } else if (msg.mission_type === "fence") {
                const fenceItemsWithIds = []
                for (let fence of msg.items) {
                  fenceItemsWithIds.push(addIdToItem(fence))
                }
                store.dispatch(setDrawingFenceItems(fenceItemsWithIds))
                store.dispatch(
                  setUnwrittenChanges({
                    ...storeState.missionInfo.unwrittenChanges,
                    fence: false,
                  }),
                )
              } else if (msg.mission_type === "rally") {
                const rallyItemsWithIds = []
                for (let rallyItem of msg.items) {
                  rallyItemsWithIds.push(addIdToItem(rallyItem))
                }
                store.dispatch(setDrawingRallyItems(rallyItemsWithIds))
                store.dispatch(
                  setUnwrittenChanges({
                    ...storeState.missionInfo.unwrittenChanges,
                    rally: false,
                  }),
                )
              }

              showSuccessNotification(`${msg.mission_type} read successfully`)
            } else {
              showErrorNotification(msg.message)
            }
          },
        )

        socket.socket.on(
          MissionSpecificSocketEvents.onWriteMissionResult,
          (msg) => {
            store.dispatch(setMissionProgressModal(false))

            const storeState = store.getState()
            if (msg.success) {
              showSuccessNotification(msg.message)
              store.dispatch(
                setUnwrittenChanges({
                  ...storeState.missionInfo.unwrittenChanges,
                  [storeState.missionInfo.activeTab]: false,
                }),
              )
            } else {
              showErrorNotification(msg.message)
            }
          },
        )

        socket.socket.on(
          MissionSpecificSocketEvents.onMissionControlResult,
          (msg) => {
            msg.success
              ? showSuccessNotification(msg.message)
              : showErrorNotification(msg.message)
          },
        )

        socket.socket.on(MissionSpecificSocketEvents.onTargetInfo, (msg) => {
          store.dispatch(setTargetInfo(msg))
        })

        socket.socket.on(
          MissionSpecificSocketEvents.onCurrentMissionProgress,
          (msg) => {
            store.dispatch(setMissionProgressData(msg))
          },
        )

        /*
          ==========
          = CONFIG =
          ==========
        */
        socket.socket.on(
          ConfigSpecificSocketEvents.onGripperEnabled,
          (enabled) => {
            store.dispatch(setGetGripperEnabled(enabled))
          },
        )

        socket.socket.on(
          ConfigSpecificSocketEvents.onSetGripperEnabledResult,
          (result) => {
            if (result.success) {
              store.dispatch(setGetGripperEnabled(true))
              store.dispatch(emitGetGripperConfig())
              showSuccessNotification(result.message)
            } else {
              showErrorNotification(result.message)
            }
          },
        )

        socket.socket.on(
          ConfigSpecificSocketEvents.onSetGripperDisabledResult,
          (result) => {
            if (result.success) {
              store.dispatch(setGetGripperEnabled(false))
              showSuccessNotification(result.message)
            } else {
              showErrorNotification(result.message)
            }
          },
        )

        socket.socket.on(
          ConfigSpecificSocketEvents.onSetGripperResult,
          (msg) => {
            if (msg.success) {
              showSuccessNotification(msg.message)
            } else {
              showErrorNotification(msg.message)
            }
          },
        )

        socket.socket.on(ConfigSpecificSocketEvents.onGripperConfig, (msg) => {
          store.dispatch(setGripperConfig(msg.params))
          store.dispatch(setRefreshingGripperConfigData(false))
        })

        socket.socket.on(
          ConfigSpecificSocketEvents.setGripperParamResult,
          (msg) => {
            if (msg.success) {
              showSuccessNotification(msg.message)
              store.dispatch(
                updateGripperConfigParam({
                  param_id: msg.param_id,
                  value: msg.value,
                }),
              )
              syncSingleParamInParamsSlice(msg.param_id, msg.value)
            } else {
              showErrorNotification(msg.message)
            }
          },
        )

        socket.socket.on(
          ConfigSpecificSocketEvents.onMotorTestResult,
          (msg) => {
            if (msg.success) {
              showSuccessNotification(msg.message)
            } else {
              showErrorNotification(msg.message)
            }
          },
        )

        socket.socket.on(
          ConfigSpecificSocketEvents.onFlightModeConfig,
          (msg) => {
            store.dispatch(setFlightModesList(msg.flight_modes))
            store.dispatch(setFlightModeChannel(msg.flight_mode_channel))
            store.dispatch(setRefreshingFlightModeData(false))
          },
        )

        socket.socket.on(
          ConfigSpecificSocketEvents.onSetFlightModeResult,
          (msg) => {
            if (msg.success) {
              showSuccessNotification(msg.message)
              syncSingleParamInParamsSlice(msg.data?.param_id, msg.data?.value)
            } else {
              showErrorNotification(msg.message)
            }

            store.dispatch(emitGetFlightModeConfig())
          },
        )

        socket.socket.on(
          ConfigSpecificSocketEvents.onSetFlightModeChannelResult,
          (msg) => {
            if (msg.success) {
              showSuccessNotification(msg.message)
              syncSingleParamInParamsSlice(msg.data?.param_id, msg.data?.value)
            } else {
              showErrorNotification(msg.message)
            }

            store.dispatch(emitGetFlightModeConfig())
          },
        )

        socket.socket.on(
          ConfigSpecificSocketEvents.onFrameTypeConfig,
          (msg) => {
            const currentFrameType = msg.frame_type
            const currentFrameClass = msg.frame_class

            // Checks if the frame class has any compatible frame types and if the current frame type param is compatible
            if (FRAME_CLASS_MAP[currentFrameClass].frametype) {
              if (
                Object.keys(
                  FRAME_CLASS_MAP[currentFrameClass].frametype,
                ).includes(currentFrameType.toString())
              ) {
                const frameInfo =
                  FRAME_CLASS_MAP[currentFrameClass].frametype[currentFrameType]
                store.dispatch(setFrameTypeDirection(frameInfo.direction))
                store.dispatch(setFrameTypeOrder(frameInfo.motorOrder))
                store.dispatch(setFrameTypeName(frameInfo.frametypename))
              }
            } else {
              store.dispatch(setFrameTypeDirection(null))
              store.dispatch(setFrameTypeOrder(null))
              store.dispatch(setFrameTypeName(currentFrameType))
            }
            store.dispatch(
              setFrameClass(FRAME_CLASS_MAP[currentFrameClass].name),
            )
            store.dispatch(
              setNumberOfMotors(
                FRAME_CLASS_MAP[currentFrameClass].numberOfMotors,
              ),
            )
          },
        )

        socket.socket.on(ConfigSpecificSocketEvents.onRcConfig, (msg) => {
          const config = {}

          for (let i = 1; i < 17; i++) {
            config[i] = msg[`RC_${i}`]
          }
          config[`${msg.pitch}`].map = "Pitch"
          config[`${msg.roll}`].map = "Roll"
          config[`${msg.throttle}`].map = "Throttle"
          config[`${msg.yaw}`].map = "Yaw"
          config[`${msg.flight_modes}`].map = "Flight modes"

          store.dispatch(setChannelsConfig(config))
        })

        socket.socket.on(
          ConfigSpecificSocketEvents.onSetRcConfigResult,
          (msg) => {
            if (msg.success) {
              showSuccessNotification(msg.message)
              store.dispatch(
                updateChannelsConfigParam({
                  param_id: msg.param_id,
                  value: msg.value,
                }),
              )
              syncSingleParamInParamsSlice(msg.param_id, msg.value)
            } else {
              showErrorNotification(msg.message)
            }
          },
        )

        socket.socket.on(
          ConfigSpecificSocketEvents.onBatchSetRcConfigResult,
          (msg) => {
            if (msg.success) {
              showSuccessNotification(msg.message)
            } else {
              showErrorNotification(msg.message)
            }

            // Even though the batch operation may fail, some params may get set
            // successfully
            if (msg.data?.length > 0) {
              for (const successfullySetParam of msg.data) {
                store.dispatch(
                  updateChannelsConfigParam({
                    param_id: successfullySetParam.param_id,
                    value: successfullySetParam.value,
                  }),
                )
              }
              syncBatchParamsInParamsSlice(msg.data)
            }
            store.dispatch(setRadioCalibrationModalOpen(false))
          },
        )

        socket.socket.on(ConfigSpecificSocketEvents.onServoConfig, (msg) => {
          const config = {}

          for (let i = 1; i < 17; i++) {
            config[i] = msg[`SERVO_${i}`]
          }

          store.dispatch(setServoConfig(config))
        })

        socket.socket.on(
          ConfigSpecificSocketEvents.onSetServoConfigResult,
          (msg) => {
            if (msg.success) {
              showSuccessNotification(msg.message)
              store.dispatch(
                updateServoConfigParam({
                  param_id: msg.param_id,
                  value: msg.value,
                }),
              )
              syncSingleParamInParamsSlice(msg.param_id, msg.value)
            } else {
              showErrorNotification(msg.message)
            }
          },
        )

        socket.socket.on(
          ConfigSpecificSocketEvents.onBatchSetServoConfigResult,
          (msg) => {
            if (msg.success) {
              showSuccessNotification(msg.message)
            } else {
              showErrorNotification(msg.message)
            }

            if (msg.data?.length > 0) {
              for (const successfullySetParam of msg.data) {
                store.dispatch(
                  updateServoConfigParam({
                    param_id: successfullySetParam.param_id,
                    value: successfullySetParam.value,
                  }),
                )
              }
              syncBatchParamsInParamsSlice(msg.data)
            }
          },
        )

        socket.socket.on(
          ConfigSpecificSocketEvents.onTestServoPwmResult,
          (msg) => {
            if (msg.success) {
              showSuccessNotification(msg.message)
            } else {
              showErrorNotification(msg.message)
            }
          },
        )

        socket.socket.on(
          ConfigSpecificSocketEvents.onSerialPortsConfig,
          (msg) => {
            store.dispatch(setSerialPortsConfig(msg))
          },
        )

        socket.socket.on(
          ConfigSpecificSocketEvents.onSetSerialPortConfigResult,
          (msg) => {
            if (msg.success) {
              showSuccessNotification(msg.message)
              store.dispatch(
                updateSerialPortConfigParam({
                  param_id: msg.param_id,
                  value: msg.value,
                }),
              )
              syncSingleParamInParamsSlice(msg.param_id, msg.value)
            } else {
              showErrorNotification(msg.message)
            }
          },
        )

        socket.socket.on(
          ConfigSpecificSocketEvents.onBatchSetSerialPortConfigResult,
          (msg) => {
            if (msg.success) {
              showSuccessNotification(msg.message)
            } else {
              showErrorNotification(msg.message)
            }

            if (msg.data?.length > 0) {
              for (const successfullySetParam of msg.data) {
                store.dispatch(
                  updateSerialPortConfigParam({
                    param_id: successfullySetParam.param_id,
                    value: successfullySetParam.value,
                  }),
                )
              }
              syncBatchParamsInParamsSlice(msg.data)
            }
          },
        )

        socket.socket.on(FtpSpecificSocketEvents.onListFilesResult, (msg) => {
          store.dispatch(setLoadingListFiles(false))
          if (msg.success) {
            store.dispatch(addFiles(msg.data))
          } else {
            showErrorNotification(msg.message)
          }
        })

        socket.socket.on(
          FtpSpecificSocketEvents.onListLogFilesResult,
          (msg) => {
            store.dispatch(setLoadingListFiles(false))
            if (msg.success) {
              const data = msg.data || {}
              const files = data.files || []
              const logPath = data.log_path || null

              store.dispatch(addFiles(files))
              store.dispatch(setLogPath(logPath))

              if (files.length === 0) {
                showErrorNotification(
                  msg.message || "No log files found on drone",
                )
              }
            } else {
              showErrorNotification(msg.message)
            }
          },
        )

        socket.socket.on(FtpSpecificSocketEvents.onReadFileResult, (msg) => {
          if (msg.success) {
            showSuccessNotification(msg.message)
            store.dispatch(setReadFileData(msg.data))
            store.dispatch(setIsReadingFile(false))
            store.dispatch(setReadFileProgress(null)) // Reset progress
          } else {
            showErrorNotification(msg.message)

            // If currently not reading a file, then reset states
            const storeState = store.getState()
            if (storeState !== undefined) {
              const isReadingFile = storeState.ftp.isReadingFile
              if (!isReadingFile) {
                store.dispatch(setIsReadingFile(false))
                store.dispatch(setReadFileProgress(null)) // Reset progress
              }
            }
          }
        })

        socket.socket.on(FtpSpecificSocketEvents.onReadFileProgress, (msg) => {
          store.dispatch(setReadFileProgress(msg))
        })
      } else {
        // Turn off socket events
        Object.values(DroneSpecificSocketEvents).map((event) =>
          socket.socket.off(event),
        )
        Object.values(ParamSpecificSocketEvents)
          .filter(
            (event) => event !== ParamSpecificSocketEvents.onRebootAutopilot,
          )
          .map((event) => socket.socket.off(event))
        Object.values(MissionSpecificSocketEvents)
          .filter(
            (event) =>
              event !== MissionSpecificSocketEvents.onImportMissionResult &&
              event !== MissionSpecificSocketEvents.onExportMissionResult,
          )
          .map((event) => socket.socket.off(event))
        Object.values(ConfigSpecificSocketEvents).map((event) =>
          socket.socket.off(event),
        )
        Object.values(FtpSpecificSocketEvents).map((event) =>
          socket.socket.off(event),
        )

        // Turn off telemetry socket events
        socket.telemetrySocket.off(DroneSpecificSocketEvents.onIncomingMsg)
      }
    }

    // these actions handle emitting based on UI events
    // for each action type, emit socket and pass onto reducer
    handleEmitters(socket, store, action)

    next(action)
  }
}

export default socketMiddleware
