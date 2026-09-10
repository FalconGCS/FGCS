import { showErrorNotification } from "../../helpers/notification"
import {
  emitBatchSetRcConfigParams,
  emitBatchSetServoConfigParams,
  emitGetFlightModeConfig,
  emitGetFrameConfig,
  emitGetGripperConfig,
  emitGetGripperEnabled,
  emitGetRcConfig,
  emitGetSerialPortsConfig,
  emitGetServoConfig,
  emitRefreshFlightModeData,
  emitSetFlightMode,
  emitSetFlightModeChannel,
  emitSetGripper,
  emitSetGripperConfigParam,
  emitSetGripperDisabled,
  emitSetGripperEnabled,
  emitSetRcConfigParam,
  emitSetSerialPortConfigParam,
  emitSetServoConfigParam,
  emitTestAllMotors,
  emitTestMotorSequence,
  emitTestOneMotor,
  emitTestServoPwm,
  setRefreshingGripperConfigData,
} from "../slices/configSlice"
import {
  emitArmDisarm,
  emitConnectToDrone,
  emitDisconnectFromDrone,
  emitGetComPorts,
  emitGetCurrentMissionAll,
  emitGetHomePosition,
  emitGetLoiterRadius,
  emitIsConnectedToDrone,
  emitLand,
  emitReposition,
  emitSetCurrentFlightMode,
  emitSetLoiterRadius,
  emitSetState,
  emitSetStreamRates,
  emitStartForwarding,
  emitStopForwarding,
  emitTakeoff,
  setCurrentPage,
  setIsForwarding,
} from "../slices/droneConnectionSlice"
import {
  emitListFiles,
  emitListLogFiles,
  emitReadFile,
  setIsReadingFile,
  setLoadingListFiles,
  setReadFileProgress,
} from "../slices/ftpSlice"
import {
  emitControlMission,
  emitExportMissionToFile,
  emitGetCurrentMission,
  emitGetTargetInfo,
  emitGetWaypointRadius,
  emitImportMissionFromFile,
  emitSetWaypointRadius,
  emitWriteCurrentMission,
  setIsFetchingDashboardMission,
  setShouldFetchAllMissionsOnDashboard,
  showDashboardMissionFetchingNotificationThunk,
} from "../slices/missionSlice"
import {
  emitExportParamsToFile,
  emitGetParams,
  emitRebootAutopilot,
  emitRefreshParams,
  emitSetMultipleParams,
  setParamsWriteProgressModalOpen,
} from "../slices/paramsSlice"
import {
  emitStartSimulation,
  emitStopSimulation,
  setSimulationStatus,
  SimulationStatus,
} from "../slices/simulationParamsSlice"
import { resetMessages } from "../slices/statusTextSlice"

export function handleEmitters(socket, store, action) {
  if (!socket) return
  const emitHandlers = [
    /*
      ====================
      = DRONE CONNECTION =
      ====================
    */
    {
      emitter: emitIsConnectedToDrone,
      callback: () => socket.socket.emit("is_connected_to_drone"),
    },
    {
      emitter: emitGetComPorts,
      callback: () => socket.socket.emit("get_com_ports"),
    },
    {
      emitter: emitDisconnectFromDrone,
      callback: () => {
        const storeState = store.getState()
        const isConnecting = storeState.droneConnection.connecting

        if (isConnecting) {
          socket.socket.emit("cancel_connect_to_drone")
          return
        }

        socket.socket.emit("disconnect_from_drone")
      },
    },
    {
      emitter: emitConnectToDrone,
      callback: () => {
        socket.socket.emit("connect_to_drone", action.payload)
        store.dispatch(resetMessages())
      },
    },
    {
      emitter: emitStartForwarding,
      callback: () => {
        const storeState = store.getState()
        const isDroneConnected = storeState.droneConnection.connected
        if (isDroneConnected) {
          const forwardingAddress = storeState.droneConnection.forwardingAddress

          if (!forwardingAddress || forwardingAddress.trim() === "") {
            showErrorNotification(
              "Forwarding address is empty",
              "Please enter a valid forwarding address before starting MAVLink forwarding.",
            )
            return
          }

          // Check if the forwarding address is in the format: "udpout:IP:PORT" or "tcpout:IP:PORT"
          if (
            !/^((udpout|tcpout):(([0-9]{1,3}\.){3}[0-9]{1,3}):([0-9]{1,5}))$/.test(
              forwardingAddress,
            )
          ) {
            showErrorNotification(
              "Invalid forwarding address format",
              'Please enter a valid forwarding address in the format "udpout:IP:PORT" or "tcpout:IP:PORT".',
            )
            return
          }

          socket.socket.emit("start_forwarding", { address: forwardingAddress })
        }
        store.dispatch(setIsForwarding(true))
      },
    },
    {
      emitter: emitStopForwarding,
      callback: () => {
        const storeState = store.getState()
        const isDroneConnected = storeState.droneConnection.connected
        if (isDroneConnected) {
          socket.socket.emit("stop_forwarding")
        }
        store.dispatch(setIsForwarding(false))
      },
    },
    {
      emitter: emitSetState,
      callback: () => {
        const newState = action.payload

        store.dispatch(setCurrentPage(newState))

        // Individual config pages handle setting state
        if (newState !== "config") {
          socket.socket.emit("set_state", { state: newState })
        }
      },
    },
    {
      emitter: emitGetHomePosition,
      callback: () => socket.socket.emit("get_home_position"),
    },
    {
      emitter: emitGetCurrentMissionAll,
      callback: () => {
        const storeState = store.getState()
        // Prevent duplicate fetches while one is already in progress
        if (storeState.missionInfo.isFetchingDashboardMission) {
          return
        }
        store.dispatch(setIsFetchingDashboardMission(true))
        socket.socket.emit("get_current_mission_all")
        store.dispatch(showDashboardMissionFetchingNotificationThunk())
      },
    },
    {
      emitter: emitSetLoiterRadius,
      callback: () =>
        socket.socket.emit("set_loiter_radius", {
          radius: action.payload,
        }),
    },
    {
      emitter: emitGetLoiterRadius,
      callback: () => socket.socket.emit("get_loiter_radius"),
    },
    {
      emitter: emitReposition,
      callback: () =>
        socket.socket.emit("reposition", {
          lat: action.payload.lat,
          lon: action.payload.lon,
          alt: action.payload.alt,
        }),
    },
    {
      emitter: emitArmDisarm,
      callback: () =>
        socket.socket.emit("arm_disarm", {
          arm: action.payload.arm,
          force: action.payload.force,
        }),
    },
    {
      emitter: emitTakeoff,
      callback: () =>
        socket.socket.emit("takeoff", { alt: action.payload.alt }),
    },
    {
      emitter: emitLand,
      callback: () => socket.socket.emit("land"),
    },
    {
      emitter: emitSetCurrentFlightMode,
      callback: () =>
        socket.socket.emit("set_current_flight_mode", {
          newFlightMode: action.payload.newFlightMode,
        }),
    },
    {
      emitter: emitSetStreamRates,
      callback: () =>
        socket.socket.emit("set_stream_rate", {
          stream: action.payload.stream,
          rate: action.payload.rate,
        }),
    },

    {
      emitter: emitStartSimulation,
      callback: () => {
        store.dispatch(setSimulationStatus(SimulationStatus.Starting))

        const storeState = store.getState()
        const simulationParams = storeState.simulationParams
        socket.socket.emit("start_docker_simulation", {
          ports: simulationParams.ports,
          vehicleType: simulationParams.vehicleType,
          connect: simulationParams.connectAfterStart,
        })
      },
    },

    {
      emitter: emitStopSimulation,
      callback: () => {
        store.dispatch(setSimulationStatus(SimulationStatus.Stopping))

        socket.socket.emit("stop_docker_simulation")
      },
    },

    /*
      ============
      = MISSIONS =
      ============
    */
    {
      emitter: emitGetTargetInfo,
      callback: () => socket.socket.emit("get_target_info"),
    },
    {
      emitter: emitGetCurrentMission,
      callback: () => {
        const storeState = store.getState()
        socket.socket.emit("get_current_mission", {
          type: storeState.missionInfo.activeTab,
        })
      },
    },
    {
      emitter: emitWriteCurrentMission,
      callback: () => {
        socket.socket.emit("write_current_mission", {
          type: action.payload.type,
          items: action.payload.items,
        })
        store.dispatch(setShouldFetchAllMissionsOnDashboard(true))
      },
    },
    {
      emitter: emitImportMissionFromFile,
      callback: () => {
        socket.socket.emit("import_mission_from_file", {
          type: action.payload.type,
          file_path: action.payload.file_path,
        })
      },
    },
    {
      emitter: emitExportMissionToFile,
      callback: () => {
        socket.socket.emit("export_mission_to_file", {
          type: action.payload.type,
          file_path: action.payload.file_path,
          items: action.payload.items,
        })
      },
    },
    {
      emitter: emitControlMission,
      callback: () => {
        const controlAction = action.payload.action
        if (!["start", "restart", "set_current"].includes(controlAction))
          if (!["start", "restart", "set_current"].includes(controlAction))
            return console.error(
              `Invalid control mission action, got ${controlAction}`,
            )

        socket.socket.emit("control_mission", {
          action: controlAction,
          ...(controlAction === "set_current" && { seq: action.payload.seq }),
        })
      },
    },
    {
      emitter: emitGetWaypointRadius,
      callback: () => socket.socket.emit("get_waypoint_radius"),
    },
    {
      emitter: emitSetWaypointRadius,
      callback: () => {
        socket.socket.emit("set_waypoint_radius", {
          radius: action.payload,
        })
      },
    },

    /*
      ==========
      = PARAMS =
      ==========
    */
    {
      emitter: emitRebootAutopilot,
      callback: () => socket.socket.emit("reboot_autopilot"),
    },
    {
      emitter: emitGetParams,
      callback: () => socket.socket.emit("get_params"),
    },
    {
      emitter: emitRefreshParams,
      callback: () => socket.socket.emit("refresh_params"),
    },
    {
      emitter: emitSetMultipleParams,
      callback: () => {
        socket.socket.emit("set_multiple_params", action.payload)
        store.dispatch(setParamsWriteProgressModalOpen(true))
      },
    },
    {
      emitter: emitExportParamsToFile,
      callback: () => {
        socket.socket.emit("export_params_to_file", {
          file_path: action.payload.filePath,
        })
      },
    },

    /*
      ==========
      = CONFIG =
      ==========
    */
    {
      emitter: emitGetGripperEnabled,
      callback: () => socket.socket.emit("get_gripper_enabled"),
    },
    {
      emitter: emitSetGripperEnabled,
      callback: () => socket.socket.emit("set_gripper_enabled"),
    },
    {
      emitter: emitSetGripperDisabled,
      callback: () => socket.socket.emit("set_gripper_disabled"),
    },
    {
      emitter: emitGetGripperConfig,
      callback: () => {
        socket.socket.emit("get_gripper_config")
        store.dispatch(setRefreshingGripperConfigData(true))
      },
    },
    {
      emitter: emitSetGripperConfigParam,
      callback: () => {
        socket.socket.emit("set_gripper_config_param", {
          param_id: action.payload.param_id,
          value: action.payload.value,
        })
      },
    },
    {
      emitter: emitGetFlightModeConfig,
      callback: () => socket.socket.emit("get_flight_mode_config"),
    },
    {
      emitter: emitSetFlightMode,
      callback: () =>
        socket.socket.emit("set_flight_mode", {
          mode_number: action.payload.mode_number,
          flight_mode: action.payload.flight_mode,
        }),
    },
    {
      emitter: emitSetFlightModeChannel,
      callback: () =>
        socket.socket.emit("set_flight_mode_channel", {
          channel: action.payload.channel,
        }),
    },
    {
      emitter: emitRefreshFlightModeData,
      callback: () => socket.socket.emit("refresh_flight_mode_data"),
    },
    {
      emitter: emitSetGripper,
      callback: () => socket.socket.emit("set_gripper", action.payload),
    },
    {
      emitter: emitGetFrameConfig,
      callback: () => socket.socket.emit("get_frame_config"),
    },
    {
      emitter: emitTestOneMotor,
      callback: () =>
        socket.socket.emit("test_one_motor", {
          motorInstance: action.payload.motorInstance,
          throttle: action.payload.throttle,
          duration: action.payload.duration,
        }),
    },
    {
      emitter: emitTestMotorSequence,
      callback: () =>
        socket.socket.emit("test_motor_sequence", {
          throttle: action.payload.throttle,
          duration: action.payload.duration,
          number_of_motors: action.payload.numberOfMotors,
        }),
    },
    {
      emitter: emitTestAllMotors,
      callback: () =>
        socket.socket.emit("test_all_motors", {
          throttle: action.payload.throttle,
          duration: action.payload.duration,
          number_of_motors: action.payload.numberOfMotors,
        }),
    },
    {
      emitter: emitGetRcConfig,
      callback: () => socket.socket.emit("get_rc_config"),
    },
    {
      emitter: emitSetRcConfigParam,
      callback: () => {
        socket.socket.emit("set_rc_config_param", {
          param_id: action.payload.param_id,
          value: action.payload.value,
        })
      },
    },
    {
      emitter: emitBatchSetRcConfigParams,
      callback: () => {
        socket.socket.emit("batch_set_rc_config_params", {
          params: action.payload.params,
        })
      },
    },
    {
      emitter: emitGetServoConfig,
      callback: () => socket.socket.emit("get_servo_config"),
    },
    {
      emitter: emitSetServoConfigParam,
      callback: () => {
        socket.socket.emit("set_servo_config_param", {
          param_id: action.payload.param_id,
          value: action.payload.value,
        })
      },
    },
    {
      emitter: emitBatchSetServoConfigParams,
      callback: () => {
        socket.socket.emit("batch_set_servo_config_params", {
          params: action.payload.params,
        })
      },
    },
    {
      emitter: emitTestServoPwm,
      callback: () => {
        socket.socket.emit("test_servo_pwm", {
          servo_instance: action.payload.servo_instance,
          pwm_value: action.payload.pwm_value,
        })
      },
    },
    {
      emitter: emitGetSerialPortsConfig,
      callback: () => socket.socket.emit("get_serial_ports_config"),
    },
    {
      emitter: emitSetSerialPortConfigParam,
      callback: () => {
        socket.socket.emit("set_serial_port_config_param", {
          param_id: action.payload.param_id,
          value: action.payload.value,
        })
      },
    },
    {
      emitter: emitListFiles,
      callback: () => {
        socket.socket.emit("list_files", {
          path: action.payload.path,
        })
        store.dispatch(setLoadingListFiles(true))
      },
    },
    {
      emitter: emitListLogFiles,
      callback: () => {
        socket.socket.emit("list_log_files")
        store.dispatch(setLoadingListFiles(true))
      },
    },
    {
      emitter: emitReadFile,
      callback: () => {
        socket.socket.emit("read_file", {
          path: action.payload.path,
          save_path: action.payload.savePath,
        })
        store.dispatch(setIsReadingFile(true))
        store.dispatch(setReadFileProgress(null)) // Reset progress when starting new download
      },
    },
  ]

  for (const { emitter, callback } of emitHandlers) {
    if (emitter.match(action)) {
      callback()
      break
    }
  }
}
