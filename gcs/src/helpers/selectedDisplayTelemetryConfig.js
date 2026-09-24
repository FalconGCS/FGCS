// Persisted config for the selected display telemetry grid

import {
  DEFAULT_DATA_GRID_COLS,
  DEFAULT_DATA_GRID_ROWS,
  clampDataGridSize,
  createEmptyDataMessage,
  deriveDataGridSizeFromCount,
  normaliseSelectedDisplayTelemetry,
} from "./dashboardDataGrid"
import { defaultDataMessages } from "./dashboardDefaultDataMessages"
import { mavlinkMsgParams } from "./mavllinkDataStreams"

export const SELECTED_DISPLAY_TELEMETRY_SETTING = "selectedDisplayTelemetry"
export const SELECTED_DISPLAY_TELEMETRY_CONFIG_VERSION = 2

function splitSelection(selection) {
  if (typeof selection !== "string") return null
  const dot = selection.indexOf(".")
  if (dot <= 0 || dot === selection.length - 1) return null
  return [selection.slice(0, dot), selection.slice(dot + 1)]
}

function displayNameFor(selection) {
  const parts = splitSelection(selection)
  return parts === null ? undefined : parts[1]
}

function isKnownTelemetryField(selection) {
  const parts = splitSelection(selection)
  if (parts === null) return false
  return mavlinkMsgParams[parts[0]]?.[parts[1]] !== undefined
}

function defaultConfig() {
  return {
    rows: DEFAULT_DATA_GRID_ROWS,
    cols: DEFAULT_DATA_GRID_COLS,
    boxes: normaliseSelectedDisplayTelemetry(defaultDataMessages),
  }
}

export function toSelectedDisplayTelemetryPersistedConfig(
  selectedDisplayTelemetry,
  dataGridSize,
) {
  const { rows, cols } = clampDataGridSize(dataGridSize)

  return {
    version: SELECTED_DISPLAY_TELEMETRY_CONFIG_VERSION,
    rows,
    cols,
    boxes: (selectedDisplayTelemetry ?? []).map(
      ({ boxId, currently_selected, display_name }) => ({
        boxId,
        currently_selected,
        display_name,
      }),
    ),
  }
}

export function mergeSelectedDisplayTelemetryConfigWithDefaults(
  persistedConfig,
) {
  let rawBoxes
  let size

  if (Array.isArray(persistedConfig)) {
    if (persistedConfig.length === 0) return defaultConfig()
    rawBoxes = persistedConfig
    size = deriveDataGridSizeFromCount(persistedConfig.length)
  } else if (
    persistedConfig &&
    Array.isArray(persistedConfig.boxes) &&
    persistedConfig.boxes.length > 0
  ) {
    rawBoxes = persistedConfig.boxes
    size = clampDataGridSize(persistedConfig)
  } else {
    return defaultConfig()
  }

  const count = size.rows * size.cols

  const boxes = Array.from({ length: count }, (_, index) => {
    const persisted = rawBoxes[index]

    if (!persisted) {
      const fallback = defaultDataMessages[index]
      return fallback
        ? { ...fallback, boxId: index, value: 0 }
        : createEmptyDataMessage(index)
    }

    // A box the user deliberately cleared must not resurrect a default
    if (
      persisted.currently_selected === null ||
      persisted.currently_selected === ""
    ) {
      return createEmptyDataMessage(index)
    }

    if (!isKnownTelemetryField(persisted.currently_selected)) {
      const fallback = defaultDataMessages[index]
      return fallback
        ? { ...fallback, boxId: index, value: 0 }
        : createEmptyDataMessage(index)
    }

    return {
      boxId: index,
      currently_selected: persisted.currently_selected,
      // Prefer the catalogue name so renamed fields pick up the new label
      display_name:
        displayNameFor(persisted.currently_selected) ??
        persisted.display_name ??
        "",
      value: 0,
    }
  })

  return { ...size, boxes }
}
