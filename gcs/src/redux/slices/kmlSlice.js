import { createSlice } from "@reduxjs/toolkit"

const initialState = {
  layers: [],
  loading: false,
}

const kmlSlice = createSlice({
  name: "kml",
  initialState,
  reducers: {
    setKmlLoading: (state, action) => {
      state.loading = action.payload
    },
    setKmlLayers: (state, action) => {
      state.layers = action.payload
    },
    addKmlLayers: (state, action) => {
      action.payload.forEach((layer) => {
        // Re-importing the same file updates the existing layer rather than
        // adding a duplicate
        const existingIndex = state.layers.findIndex(
          (item) => item.originalPath === layer.originalPath,
        )

        if (existingIndex === -1) {
          state.layers.push(layer)
        } else {
          state.layers[existingIndex] = layer
        }
      })
    },
    removeKmlLayer: (state, action) => {
      state.layers = state.layers.filter((layer) => layer.id !== action.payload)
    },
    setKmlLayerVisibility: (state, action) => {
      const layer = state.layers.find((item) => item.id === action.payload.id)
      if (layer) layer.visible = action.payload.visible
    },
    toggleKmlLayerVisibility: (state, action) => {
      const layer = state.layers.find((item) => item.id === action.payload)
      if (layer) layer.visible = !layer.visible
    },
    setKmlLayerColourOverride: (state, action) => {
      const layer = state.layers.find((item) => item.id === action.payload.id)
      // A null colour resets the layer back to the styling within the KML
      if (layer) layer.colourOverride = action.payload.colour
    },
  },
  selectors: {
    selectKmlLayers: (state) => state.layers,
    selectKmlLoading: (state) => state.loading,
  },
})

export const {
  setKmlLoading,
  setKmlLayers,
  addKmlLayers,
  removeKmlLayer,
  setKmlLayerVisibility,
  toggleKmlLayerVisibility,
  setKmlLayerColourOverride,
} = kmlSlice.actions

export const { selectKmlLayers, selectKmlLoading } = kmlSlice.selectors

export default kmlSlice
