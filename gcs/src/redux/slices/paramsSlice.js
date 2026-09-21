import { createSlice } from "@reduxjs/toolkit"

const paramsSlice = createSlice({
  name: "paramsSlice",
  initialState: {
    rebootData: {},
    autoPilotRebootModalOpen: false,
    params: [],
    shownParams: [],
    modifiedParams: [],
    showModifiedParams: false,
    fetchingVars: false,
    fetchingVarsProgress: { progress: 0, param_id: "" },
    fetchingParam: "",
    searchValue: "",
    hasFetchedOnce: false,
    loadParamsFileModalOpen: false,
    loadedFileName: "",
    loadedParams: [],
    paramsWriteProgressData: {
      param_id: "",
      current_index: 0,
      total_params: 0,
    },
    paramsWriteProgressModalOpen: false,
    paramsFailedToWrite: [],
    paramsFailedToWriteModalOpen: false,
    fetchParamsWarningModalOpen: false,
    rebootPromptModalOpen: false,
    pendingFetchAction: null,
  },
  reducers: {
    setRebootData: (state, action) => {
      if (action.payload === state.rebootData) return
      state.rebootData = action.payload
    },
    setAutoPilotRebootModalOpen: (state, action) => {
      if (action.payload === state.autoPilotRebootModalOpen) return
      state.autoPilotRebootModalOpen = action.payload
    },
    setParams: (state, action) => {
      if (action.payload === state.params) return
      state.params = action.payload
    },
    setShownParams: (state, action) => {
      if (action.payload === state.shownParams) return
      state.shownParams = action.payload
    },
    setModifiedParams: (state, action) => {
      if (action.payload === state.modifiedParams) return
      state.modifiedParams = action.payload
    },
    setFetchingVars: (state, action) => {
      if (action.payload === state.fetchingVars) return
      state.fetchingVars = action.payload
    },
    setFetchingVarsProgress: (state, action) => {
      if (action.payload === state.fetchingVarsProgress) return
      state.fetchingVarsProgress = action.payload
    },
    setFetchingParam: (state, action) => {
      if (action.payload === state.fetchingParam) return
      state.fetchingParam = action.payload
    },
    setParamSearchValue: (state, action) => {
      if (action.payload === state.searchValue) return
      state.searchValue = action.payload
    },
    toggleShowModifiedParams: (state) => {
      state.showModifiedParams = !state.showModifiedParams
    },
    setShowModifiedParams: (state, action) => {
      if (action.payload === state.showModifiedParams) return
      state.showModifiedParams = action.payload
    },
    appendModifiedParams: (state, action) => {
      for (let newParam of action.payload) {
        // If param already exists, update it instead of appending
        const existingIndex = state.modifiedParams.findIndex(
          (item) => item.param_id === newParam.param_id,
        )
        if (existingIndex !== -1) {
          state.modifiedParams[existingIndex] = {
            ...state.modifiedParams[existingIndex],
            param_value: newParam.param_value,
          }

          if (
            state.modifiedParams[existingIndex].initial_value ===
            newParam.param_value
          ) {
            // Remove if the new value is the same as the initial value
            state.modifiedParams.splice(existingIndex, 1)
          }
        } else {
          if (newParam.initial_value === newParam.param_value) {
            // Don't append if the new value is the same as the initial value
            continue
          }

          state.modifiedParams.push(newParam)
        }
      }
    },
    updateParamValue: (state, action) => {
      state.params = state.params.map((item) =>
        item.param_id === action.payload.param_id
          ? { ...item, param_value: action.payload.param_value }
          : item,
      )
    },
    updateModifiedParamValue: (state, action) => {
      // Update param_value
      state.modifiedParams = state.modifiedParams.map((item) =>
        item.param_id === action.payload.param_id
          ? { ...item, param_value: action.payload.param_value }
          : item,
      )

      // Delete where initial_value and param_value are the same
      state.modifiedParams = state.modifiedParams.filter(
        (item) => item.initial_value !== item.param_value,
      )
    },
    deleteModifiedParam: (state, action) => {
      state.modifiedParams = state.modifiedParams.filter(
        (item) => item.param_id !== action.payload.param_id,
      )
    },
    resetParamState: (state) => {
      state.fetchingVars = false
      state.fetchingVarsProgress = { progress: 0, param_id: "" }
      state.fetchingParam = ""
      state.params = []
      state.shownParams = []
      state.modifiedParams = []
      state.showModifiedParams = false
      state.rebootData = {}
      state.searchValue = ""
      state.rebootPromptModalOpen = false
    },
    setHasFetchedOnce: (state, action) => {
      state.hasFetchedOnce = action.payload
    },
    setLoadParamsFileModalOpen: (state, action) => {
      state.loadParamsFileModalOpen = action.payload
    },
    setLoadedFileName: (state, action) => {
      state.loadedFileName = action.payload
    },
    setLoadedParams: (state, action) => {
      state.loadedParams = action.payload
    },
    setParamsWriteProgressData: (state, action) => {
      state.paramsWriteProgressData = action.payload
    },
    resetParamsWriteProgressData: (state) => {
      state.paramsWriteProgressData = {
        param_id: "",
        current_index: 0,
        total_params: 0,
      }
    },
    setParamsWriteProgressModalOpen: (state, action) => {
      state.paramsWriteProgressModalOpen = action.payload
    },
    setParamsFailedToWrite: (state, action) => {
      state.paramsFailedToWrite = action.payload
    },
    setParamsFailedToWriteModalOpen: (state, action) => {
      state.paramsFailedToWriteModalOpen = action.payload
    },
    setFetchParamsWarningModalOpen: (state, action) => {
      state.fetchParamsWarningModalOpen = action.payload
    },
    setRebootPromptModalOpen: (state, action) => {
      state.rebootPromptModalOpen = action.payload
    },
    setPendingFetchAction: (state, action) => {
      state.pendingFetchAction = action.payload
    },

    // Emitters (empty objects to be captured in the middleware)
    emitRebootAutopilot: () => {},
    emitGetParams: () => {},
    emitRefreshParams: () => {},
    emitSetMultipleParams: () => {},
    emitExportParamsToFile: () => {},
  },
  selectors: {
    selectRebootData: (state) => state.rebootData,
    selectAutoPilotRebootModalOpen: (state) => state.autoPilotRebootModalOpen,
    selectParams: (state) => state.params,
    selectSingleParam(state, param_id) {
      return state.params.find((param) => param.param_id === param_id)
    },
    selectShownParams: (state) => state.shownParams,
    selectModifiedParams: (state) => state.modifiedParams,
    selectShowModifiedParams: (state) => state.showModifiedParams,
    selectFetchingVars: (state) => state.fetchingVars,
    selectFetchingVarsProgress: (state) => state.fetchingVarsProgress,
    selectFetchingParam: (state) => state.fetchingParam,
    selectParamSearchValue: (state) => state.searchValue,
    selectHasFetchedOnce: (state) => state.hasFetchedOnce,
    selectLoadParamsFileModalOpen: (state) => state.loadParamsFileModalOpen,
    selectLoadedFileName: (state) => state.loadedFileName,
    selectLoadedParams: (state) => state.loadedParams,
    selectParamsWriteProgressData: (state) => state.paramsWriteProgressData,
    selectParamsWriteProgressModalOpen: (state) =>
      state.paramsWriteProgressModalOpen,
    selectParamsFailedToWrite: (state) => state.paramsFailedToWrite,
    selectParamsFailedToWriteModalOpen: (state) =>
      state.paramsFailedToWriteModalOpen,
    selectFetchParamsWarningModalOpen: (state) =>
      state.fetchParamsWarningModalOpen,
    selectRebootPromptModalOpen: (state) => state.rebootPromptModalOpen,
    selectPendingFetchAction: (state) => state.pendingFetchAction,
  },
})

export const {
  setRebootData,
  setAutoPilotRebootModalOpen,
  setParams,
  setShownParams,
  setModifiedParams,
  setFetchingVars,
  setFetchingVarsProgress,
  setFetchingParam,
  setParamSearchValue,
  toggleShowModifiedParams,
  setShowModifiedParams,
  appendModifiedParams,
  updateParamValue,
  updateModifiedParamValue,
  deleteModifiedParam,
  resetParamState,
  setHasFetchedOnce,
  setLoadParamsFileModalOpen,
  setLoadedFileName,
  setLoadedParams,
  setParamsWriteProgressData,
  resetParamsWriteProgressData,
  setParamsWriteProgressModalOpen,
  setParamsFailedToWrite,
  setParamsFailedToWriteModalOpen,
  setFetchParamsWarningModalOpen,
  setRebootPromptModalOpen,
  setPendingFetchAction,
  emitRebootAutopilot,
  emitGetParams,
  emitRefreshParams,
  emitSetMultipleParams,
  emitExportParamsToFile,
} = paramsSlice.actions
export const {
  selectRebootData,
  selectAutoPilotRebootModalOpen,
  selectParams,
  selectSingleParam,
  selectShownParams,
  selectModifiedParams,
  selectFetchingVars,
  selectFetchingVarsProgress,
  selectFetchingParam,
  selectShowModifiedParams,
  selectParamSearchValue,
  selectHasFetchedOnce,
  selectLoadParamsFileModalOpen,
  selectLoadedFileName,
  selectLoadedParams,
  selectParamsWriteProgressData,
  selectParamsWriteProgressModalOpen,
  selectParamsFailedToWrite,
  selectParamsFailedToWriteModalOpen,
  selectFetchParamsWarningModalOpen,
  selectRebootPromptModalOpen,
  selectPendingFetchAction,
} = paramsSlice.selectors

export default paramsSlice
