import { createSlice } from "@reduxjs/toolkit"

const configSlice = createSlice({
  name: "config",
  initialState: {
    activeTab: null,
    failsafeConfig: {},
    refreshingFailsafeConfigData: false,
    getGripperEnabled: false,
    gripperConfig: {},
    refreshingGripperConfigData: false,
    flightModes: [
      "UNKNOWN",
      "UNKNOWN",
      "UNKNOWN",
      "UNKNOWN",
      "UNKNOWN",
      "UNKNOWN",
    ],
    flightModeChannel: "UNKNOWN",
    refreshingFlightModeData: false,
    pwmValue: 0,
    frameTypeOrder: null,
    frameTypeDirection: null,
    frameTypeName: null,
    frameClass: null,
    numberOfMotors: 4,
    showMotorTestWarningModal: true,
    radioPwmChannels: {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
      6: 0,
      7: 0,
      8: 0,
      9: 0,
      10: 0,
      11: 0,
      12: 0,
      13: 0,
      14: 0,
      15: 0,
      16: 0,
    },
    radioChannelsConfig: {},
    radioCalibrationModalOpen: false,
    servoPwmOutputs: {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
      6: 0,
      7: 0,
      8: 0,
      9: 0,
      10: 0,
      11: 0,
      12: 0,
      13: 0,
      14: 0,
      15: 0,
      16: 0,
    },
    servoConfig: {},
    serialPortsConfig: {},
  },
  reducers: {
    setActiveTab: (state, action) => {
      state.activeTab = action.payload
    },
    setGetGripperEnabled: (state, action) => {
      if (action.payload === state.getGripperEnabled) return
      state.getGripperEnabled = action.payload
    },
    setGripperConfig: (state, action) => {
      if (action.payload === state.gripperConfig) return
      state.gripperConfig = action.payload
    },
    updateGripperConfigParam: (state, action) => {
      const { param_id, value } = action.payload
      if (state.gripperConfig[param_id] === value) return
      state.gripperConfig[param_id] = value
    },
    setFailsafeConfig: (state, action) => {
      if (action.payload === state.failsafeConfig) return
      state.failsafeConfig = action.payload
    },
    updateFailsafeConfigParam: (state, action) => {
      const { param_id, value } = action.payload
      if (state.failsafeConfig[param_id] === value) return
      state.failsafeConfig[param_id] = value
    },
    setRefreshingFailsafeConfigData: (state, action) => {
      if (action.payload === state.refreshingFailsafeConfigData) return
      state.refreshingFailsafeConfigData = action.payload
    },
    setRefreshingGripperConfigData: (state, action) => {
      if (action.payload === state.refreshingGripperConfigData) return
      state.refreshingGripperConfigData = action.payload
    },
    setFlightModesList: (state, action) => {
      if (action.payload === state.flightModes) return
      state.flightModes = action.payload
    },
    setFlightModeChannel: (state, action) => {
      if (action.payload === state.flightModeChannel) return
      state.flightModeChannel = action.payload
    },
    setRefreshingFlightModeData: (state, action) => {
      if (action.payload === state.refreshingFlightModeData) return
      state.refreshingFlightModeData = action.payload
    },
    setCurrentPwmValue: (state, action) => {
      if (action.payload === state.pwmValue) return
      state.pwmValue = action.payload
    },
    setFrameTypeOrder: (state, action) => {
      if (action.payload === state.frameTypeOrder) return
      state.frameTypeOrder = action.payload
    },
    setFrameTypeDirection: (state, action) => {
      if (action.payload === state.frameTypeDirection) return
      state.frameTypeDirection = action.payload
    },
    setFrameTypeName: (state, action) => {
      if (action.payload === state.frameTypeName) return
      state.frameTypeName = action.payload
    },
    setFrameClass: (state, action) => {
      if (action.payload === state.frameClass) return
      state.frameClass = action.payload
    },
    setNumberOfMotors: (state, action) => {
      if (action.payload === state.numberOfMotors) return
      state.numberOfMotors = action.payload
    },
    setShowMotorTestWarningModal: (state, action) => {
      if (action.payload === state.showMotorTestWarningModal) return
      state.showMotorTestWarningModal = action.payload
    },
    setRadioPwmChannels: (state, action) => {
      if (action.payload === state.radioPwmChannels) return
      // Ensure that if the channel pwm is not different, then don't change
      const updatedChannels = {}
      for (const channel in action.payload) {
        if (action.payload[channel] !== state.radioPwmChannels[channel]) {
          updatedChannels[channel] = action.payload[channel]
        }
      }
      if (Object.keys(updatedChannels).length === 0) return
      state.radioPwmChannels = { ...state.radioPwmChannels, ...updatedChannels }
    },
    setChannelsConfig: (state, action) => {
      if (action.payload === state.radioChannelsConfig) return
      state.radioChannelsConfig = action.payload
    },
    updateChannelsConfigParam: (state, action) => {
      const { param_id, value } = action.payload
      // param_id is like "RC1_OPTION", "RC2_REVERSED", etc. so we need to separate out the channel number
      const match = param_id.match(/^RC(\d+)_(.+)$/)
      if (!match) return

      const channelNum = match[1]
      const paramType = match[2].toLowerCase() // "option", "reversed", "min", "max"

      if (!state.radioChannelsConfig[channelNum]) return

      // Check if this is a parameter type we track
      const validParamTypes = ["option", "reversed", "min", "max"]
      if (!validParamTypes.includes(paramType)) return

      // Check if value is different before updating
      if (state.radioChannelsConfig[channelNum][paramType] === value) return

      state.radioChannelsConfig[channelNum][paramType] = value
    },
    setRadioCalibrationModalOpen: (state, action) => {
      state.radioCalibrationModalOpen = action.payload
    },
    setServoPwmOutputs: (state, action) => {
      if (action.payload === state.servoPwmOutputs) return
      const updatedOutputs = {}
      for (const servo in action.payload) {
        if (action.payload[servo] !== state.servoPwmOutputs[servo]) {
          updatedOutputs[servo] = action.payload[servo]
        }
      }
      if (Object.keys(updatedOutputs).length === 0) return
      state.servoPwmOutputs = { ...state.servoPwmOutputs, ...updatedOutputs }
    },
    setServoConfig: (state, action) => {
      if (action.payload === state.servoConfig) return
      state.servoConfig = action.payload
    },
    updateServoConfigParam: (state, action) => {
      const { param_id, value } = action.payload
      const match = param_id.match(/^SERVO(\d+)_(.+)$/)
      if (!match) return
      const servoNum = match[1]
      const paramType = match[2].toLowerCase()
      if (!state.servoConfig[servoNum]) return
      const validParamTypes = ["function", "reversed", "min", "max", "trim"]
      if (!validParamTypes.includes(paramType)) return
      if (state.servoConfig[servoNum][paramType] === value) return
      state.servoConfig[servoNum][paramType] = value
    },
    setSerialPortsConfig: (state, action) => {
      if (action.payload === state.serialPortsConfig) return
      state.serialPortsConfig = action.payload
    },
    updateSerialPortConfigParam: (state, action) => {
      const { param_id, value } = action.payload
      // Handle SERIALn params
      const serialMatch = param_id.match(/^SERIAL(\d+)_(.+)$/)
      if (serialMatch) {
        const portKey = `SERIAL_${serialMatch[1]}`
        const paramType = serialMatch[2].toLowerCase()
        if (!state.serialPortsConfig[portKey]) {
          state.serialPortsConfig[portKey] = {}
        }
        const validParamTypes = ["protocol", "baud", "options"]
        if (!validParamTypes.includes(paramType)) return
        if (state.serialPortsConfig[portKey][paramType] === value) return
        state.serialPortsConfig[portKey][paramType] = value
      }
    },

    // Emits
    emitGetFailsafeConfig: () => {},
    emitGetGripperEnabled: () => {},
    emitSetGripperEnabled: () => {},
    emitSetGripperDisabled: () => {},
    emitGetGripperConfig: () => {},
    emitSetGripperConfigParam: () => {},
    emitSetFailsafeConfigParam: () => {},
    emitGetFlightModeConfig: () => {},
    emitSetFlightMode: () => {},
    emitSetFlightModeChannel: () => {},
    emitRefreshFlightModeData: () => {},
    emitSetGripper: () => {},
    emitGetFrameConfig: () => {},
    emitTestOneMotor: () => {},
    emitTestMotorSequence: () => {},
    emitTestAllMotors: () => {},
    emitGetRcConfig: () => {},
    emitSetRcConfigParam: () => {},
    emitBatchSetRcConfigParams: () => {},
    emitGetServoConfig: () => {},
    emitSetServoConfigParam: () => {},
    emitBatchSetServoConfigParams: () => {},
    emitTestServoPwm: () => {},
    emitGetSerialPortsConfig: () => {},
    emitSetSerialPortConfigParam: () => {},
    emitBatchSetSerialPortConfigParams: () => {},
  },
  selectors: {
    selectActiveTab: (state) => state.activeTab,
    selectFailsafeConfig: (state) => state.failsafeConfig,
    selectRefreshingFailsafeConfigData: (state) =>
      state.refreshingFailsafeConfigData,
    selectGetGripperEnabled: (state) => state.getGripperEnabled,
    selectGripperConfig: (state) => state.gripperConfig,
    selectRefreshingGripperConfigData: (state) =>
      state.refreshingGripperConfigData,
    selectFlightModesList: (state) => state.flightModes,
    selectFlightModeChannel: (state) => state.flightModeChannel,
    selectRefreshingFlightModeData: (state) => state.refreshingFlightModeData,
    selectPwmValue: (state) => state.pwmValue,
    selectFrameTypeOrder: (state) => state.frameTypeOrder,
    selectFrameTypeDirection: (state) => state.frameTypeDirection,
    selectFrameTypeName: (state) => state.frameTypeName,
    selectFrameClass: (state) => state.frameClass,
    selectNumberOfMotors: (state) => state.numberOfMotors,
    selectShowMotorTestWarningModal: (state) => state.showMotorTestWarningModal,
    selectRadioPwmChannels: (state) => state.radioPwmChannels,
    selectRadioChannelsConfig: (state) => state.radioChannelsConfig,
    selectRadioCalibrationModalOpen: (state) => state.radioCalibrationModalOpen,
    selectServoPwmOutputs: (state) => state.servoPwmOutputs,
    selectServoConfig: (state) => state.servoConfig,
    selectSerialPortsConfig: (state) => state.serialPortsConfig,
  },
})

export const {
  setActiveTab,
  setFailsafeConfig,
  setGetGripperEnabled,
  setGripperConfig,
  updateGripperConfigParam,
  updateFailsafeConfigParam,
  setRefreshingFailsafeConfigData,
  setRefreshingGripperConfigData,
  setFlightModesList,
  setFlightModeChannel,
  setRefreshingFlightModeData,
  setCurrentPwmValue,
  setFrameTypeOrder,
  setFrameTypeDirection,
  setFrameTypeName,
  setFrameClass,
  setNumberOfMotors,
  setShowMotorTestWarningModal,
  setRadioPwmChannels,
  setChannelsConfig,
  updateChannelsConfigParam,
  setRadioCalibrationModalOpen,
  setServoPwmOutputs,
  setServoConfig,
  updateServoConfigParam,
  setSerialPortsConfig,
  updateSerialPortConfigParam,

  emitGetFailsafeConfig,
  emitGetGripperEnabled,
  emitSetGripperEnabled,
  emitSetGripperDisabled,
  emitGetGripperConfig,
  emitSetGripperConfigParam,
  emitSetFailsafeConfigParam,
  emitGetFlightModeConfig,
  emitSetFlightMode,
  emitSetFlightModeChannel,
  emitRefreshFlightModeData,
  emitSetGripper,
  emitGetFrameConfig,
  emitTestOneMotor,
  emitTestMotorSequence,
  emitTestAllMotors,
  emitGetRcConfig,
  emitSetRcConfigParam,
  emitBatchSetRcConfigParams,
  emitGetServoConfig,
  emitSetServoConfigParam,
  emitBatchSetServoConfigParams,
  emitTestServoPwm,
  emitGetSerialPortsConfig,
  emitSetSerialPortConfigParam,
  emitBatchSetSerialPortConfigParams,
} = configSlice.actions

export const {
  selectActiveTab,
  selectFailsafeConfig,
  selectRefreshingFailsafeConfigData,
  selectGetGripperEnabled,
  selectGripperConfig,
  selectRefreshingGripperConfigData,
  selectFlightModesList,
  selectFlightModeChannel,
  selectRefreshingFlightModeData,
  selectPwmValue,
  selectFrameTypeOrder,
  selectFrameTypeDirection,
  selectFrameTypeName,
  selectFrameClass,
  selectNumberOfMotors,
  selectShowMotorTestWarningModal,
  selectRadioPwmChannels,
  selectRadioChannelsConfig,
  selectRadioCalibrationModalOpen,
  selectServoPwmOutputs,
  selectServoConfig,
  selectSerialPortsConfig,
} = configSlice.selectors

export default configSlice
