// Data grid helpers for the "Data" tab on the LH resizable section

export const DATA_GRID_LIMITS = {
  minRows: 1,
  maxRows: 10,
  minCols: 1,
  maxCols: 6,
}

export const DEFAULT_DATA_GRID_ROWS = 3
export const DEFAULT_DATA_GRID_COLS = 2

// Matches the tailwind `gap-1` on the grid wrapper
export const DATA_GRID_GAP_PX = 4
// Breathing room above and below a cell's two lines of text
export const DATA_GRID_CELL_PADDING_PX = 8
// Line box multipliers for the value and the label
export const DATA_GRID_VALUE_LINE_HEIGHT = 1.05
export const DATA_GRID_LABEL_LINE_HEIGHT = 1.4
// Used only until the grid has been measured, e.g. while the tab is hidden
export const DATA_GRID_FALLBACK_HEIGHT_PX = 276
export const DATA_GRID_MIN_ROW_HEIGHT_PX = 34
export const DATA_GRID_MAX_ROW_HEIGHT_PX = 600
export const DATA_GRID_MIN_VALUE_FONT_PX = 12
export const DATA_GRID_MAX_VALUE_FONT_PX = 72
export const DATA_GRID_MIN_LABEL_FONT_PX = 10
export const DATA_GRID_MAX_LABEL_FONT_PX = 18

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function clampDimension(value, min, max, fallback) {
  if (value === null || value === undefined || value === "") return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return clamp(Math.round(parsed), min, max)
}

export function clampDataGridSize(size) {
  return {
    rows: clampDimension(
      size?.rows,
      DATA_GRID_LIMITS.minRows,
      DATA_GRID_LIMITS.maxRows,
      DEFAULT_DATA_GRID_ROWS,
    ),
    cols: clampDimension(
      size?.cols,
      DATA_GRID_LIMITS.minCols,
      DATA_GRID_LIMITS.maxCols,
      DEFAULT_DATA_GRID_COLS,
    ),
  }
}

export function createEmptyDataMessage(boxId) {
  return {
    boxId,
    currently_selected: null,
    display_name: "",
    value: 0,
  }
}

export function normaliseSelectedDisplayTelemetry(items) {
  if (!Array.isArray(items)) return []

  return items.map((item, index) => ({
    ...createEmptyDataMessage(index),
    ...item,
    boxId: index,
  }))
}

export function resizeSelectedDisplayTelemetry(items, count) {
  const existing = Array.isArray(items) ? items : []
  const safeCount = Math.max(0, Math.floor(Number(count) || 0))

  return Array.from({ length: safeCount }, (_, index) => {
    const item = existing[index]
    if (!item) return createEmptyDataMessage(index)
    return { ...item, boxId: index }
  })
}

export function deriveDataGridSizeFromCount(count) {
  const parsed = Number(count)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { rows: DEFAULT_DATA_GRID_ROWS, cols: DEFAULT_DATA_GRID_COLS }
  }

  return clampDataGridSize({
    rows: Math.ceil(parsed / DEFAULT_DATA_GRID_COLS),
    cols: DEFAULT_DATA_GRID_COLS,
  })
}

export function calcDataGridMetrics({
  containerWidth,
  availableHeight,
  rows,
  cols,
}) {
  const size = clampDataGridSize({ rows, cols })
  const width = Number.isFinite(Number(containerWidth))
    ? Math.max(0, Number(containerWidth))
    : 0

  // Falls back until the panel has been measured
  const height =
    Number.isFinite(Number(availableHeight)) && Number(availableHeight) > 0
      ? Number(availableHeight)
      : DATA_GRID_FALLBACK_HEIGHT_PX

  const cellWidth = Math.max(
    0,
    (width - DATA_GRID_GAP_PX * (size.cols - 1)) / size.cols,
  )

  // Rows split the panel evenly and take all of it
  const rowHeight = clamp(
    (height - DATA_GRID_GAP_PX * (size.rows - 1)) / size.rows,
    DATA_GRID_MIN_ROW_HEIGHT_PX,
    DATA_GRID_MAX_ROW_HEIGHT_PX,
  )

  const heightBound = (rowHeight - DATA_GRID_CELL_PADDING_PX) * 0.62

  const valueFontSize = clamp(
    Math.floor(heightBound),
    DATA_GRID_MIN_VALUE_FONT_PX,
    DATA_GRID_MAX_VALUE_FONT_PX,
  )

  const labelFontSize = clamp(
    Math.round(valueFontSize * 0.42),
    DATA_GRID_MIN_LABEL_FONT_PX,
    DATA_GRID_MAX_LABEL_FONT_PX,
  )

  return { cellWidth, rowHeight, valueFontSize, labelFontSize }
}

// Approximate advance widths in Inter, as a fraction of the font size
const GLYPH_EM_WIDTHS = { ".": 0.27, ",": 0.27, "-": 0.33, " ": 0.28 }
const DEFAULT_GLYPH_EM_WIDTH = 0.58
export const DATA_GRID_EM_QUANTUM = 1
const CELL_WIDTH_USABLE = 0.94

export function estimateTextEmWidth(text) {
  const str = String(text ?? "")
  let em = 0
  for (const character of str) {
    em += GLYPH_EM_WIDTHS[character] ?? DEFAULT_GLYPH_EM_WIDTH
  }
  return em
}

export function calcValueFontSize({ cellWidth, maxFontSize, text }) {
  const max = Number.isFinite(Number(maxFontSize))
    ? Number(maxFontSize)
    : DATA_GRID_MAX_VALUE_FONT_PX
  const width = Number.isFinite(Number(cellWidth)) ? Number(cellWidth) : 0

  const em = estimateTextEmWidth(text)
  if (!(em > 0) || width <= 0) {
    return clamp(
      Math.floor(max),
      DATA_GRID_MIN_VALUE_FONT_PX,
      DATA_GRID_MAX_VALUE_FONT_PX,
    )
  }

  const budget =
    Math.ceil(em / DATA_GRID_EM_QUANTUM) * DATA_GRID_EM_QUANTUM ||
    DATA_GRID_EM_QUANTUM

  return clamp(
    Math.floor(Math.min((width * CELL_WIDTH_USABLE) / budget, max)),
    DATA_GRID_MIN_VALUE_FONT_PX,
    DATA_GRID_MAX_VALUE_FONT_PX,
  )
}

export function resolveSelectedValue(msg, currentlySelected) {
  if (
    typeof currentlySelected !== "string" ||
    msg === null ||
    msg === undefined
  )
    return undefined

  const dot = currentlySelected.indexOf(".")
  if (dot <= 0 || dot === currentlySelected.length - 1) return undefined

  if (currentlySelected.slice(0, dot) !== msg.mavpackettype) return undefined

  const field = currentlySelected.slice(dot + 1)
  return Object.prototype.hasOwnProperty.call(msg, field)
    ? msg[field]
    : undefined
}
