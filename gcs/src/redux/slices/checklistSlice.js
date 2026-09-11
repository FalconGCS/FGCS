import { createSelector, createSlice } from "@reduxjs/toolkit"
import { v4 as uuidv4 } from "uuid"
import { CHECKLIST_AUTO_BINDINGS } from "../../helpers/checklistAutoBindings"
import { setConnected } from "./droneConnectionSlice"
import { setEkfStatusReportData, setGpsRawIntData } from "./droneInfoSlice"
import { EKF_STATUS_WARNING_LEVEL } from "../../helpers/mavlinkConstants"

const checklistSlice = createSlice({
  name: "checklist",
  initialState: { items: [] },
  reducers: {
    pushChecklist: (state, action) => {
      if (!doesItemExistByName(state, action.payload.name)) {
        state.items.push({
          id: uuidv4(),
          name: action.payload.name,
          value: action.payload.value,
        }) // Surely there won't be a uuid collision right!
      }
    },
    deleteChecklistById: (state, action) => {
      state.items = state.items.filter(
        (element) => element.id !== action.payload,
      )
    },
    setChecklistItems: (state, action) => {
      if (action.payload === state.items) return
      state.items = action.payload
    },
    setNewChecklistName: (state, action) => {
      if (
        doesItemExistById(state, action.payload.id) &&
        !doesItemExistByName(state, action.payload.newName)
      ) {
        state.items = state.items.map((item) =>
          item.id === action.payload.id
            ? { ...item, name: action.payload.newName }
            : item,
        )
      }
    },
    setChecklistValueById: (state, action) => {
      if (doesItemExistById(state, action.payload.id)) {
        state.items = state.items.map((item) =>
          item.id === action.payload.id
            ? { ...item, value: action.payload.value }
            : item,
        )
      }
    },
    setChecklistItemStateBinding: (state, action) => {
      const { checklistId, itemName, stateBinding } = action.payload
      const binding =
        typeof stateBinding === "string" ? stateBinding.trim() : null

      state.items = state.items.map((checklist) => {
        if (checklist.id !== checklistId) {
          return checklist
        }

        if (!Array.isArray(checklist.value)) {
          return checklist
        }

        return {
          ...checklist,
          value: checklist.value.map((valueItem) => {
            if (valueItem.name !== itemName) {
              return valueItem
            }

            if (binding) {
              return { ...valueItem, stateBinding: binding }
            }

            const rest = { ...valueItem }
            delete rest.stateBinding
            return rest
          }),
        }
      })
    },
    setChecklistAutoBindingChecked: (state, action) => {
      const { bindingKey, checked } = action.payload
      applyAutoBinding(state, bindingKey, Boolean(checked))
    },
  },
  extraReducers: (builder) => {
    builder.addCase(setConnected, (state, action) => {
      applyAutoBinding(
        state,
        CHECKLIST_AUTO_BINDINGS.DroneConnected.key,
        action.payload,
      )
    })
    builder.addCase(setGpsRawIntData, (state, action) => {
      applyAutoBinding(
        state,
        CHECKLIST_AUTO_BINDINGS.GpsSatsGt10.key,
        Boolean(action.payload.satellites_visible > 10),
      )

      applyAutoBinding(
        state,
        CHECKLIST_AUTO_BINDINGS.GpsHdopLt1.key,
        Boolean(action.payload.hdop != null && action.payload.hdop < 1),
      )

      applyAutoBinding(
        state,
        CHECKLIST_AUTO_BINDINGS.GpsFixGte3.key,
        Boolean(action.payload.fix_type >= 3),
      )
    })
    builder.addCase(setEkfStatusReportData, (state, action) => {
      applyAutoBinding(
        state,
        CHECKLIST_AUTO_BINDINGS.CompassHealthy.key,
        Boolean(action.payload.compass_variance <= EKF_STATUS_WARNING_LEVEL),
      )
    })
  },
  selectors: {
    selectChecklists: (state) => {
      return state.items
    },
  },
})

function applyAutoBinding(state, bindingKey, checked) {
  state.items.forEach((checklist) => {
    if (!Array.isArray(checklist.value)) {
      return
    }

    checklist.value.forEach((valueItem) => {
      if (valueItem.stateBinding === bindingKey) {
        valueItem.checked = checked
      }
    })
  })
}

function doesItemExistById(state, id) {
  return state.items.find((element) => element.id === id)
}

function doesItemExistByName(state, name) {
  return (
    state.items.find(
      (element) => element.name.toLowerCase() === name.toLowerCase(),
    ) !== undefined
  )
}

export const selectChecklistById = (id) =>
  createSelector([checklistSlice.selectors.selectChecklists], (items) =>
    items.find((element) => element.id === id),
  )

export const {
  pushChecklist,
  deleteChecklistById,
  setChecklistItems,
  setNewChecklistName,
  setChecklistValueById,
  setChecklistItemStateBinding,
  setChecklistAutoBindingChecked,
} = checklistSlice.actions
export const { selectChecklists } = checklistSlice.selectors

export default checklistSlice
