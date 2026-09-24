import { describe, expect, it } from "vitest"
import {
  DATA_GRID_FALLBACK_HEIGHT_PX,
  DATA_GRID_GAP_PX,
  DATA_GRID_LABEL_LINE_HEIGHT,
  DATA_GRID_MAX_LABEL_FONT_PX,
  DATA_GRID_VALUE_LINE_HEIGHT,
  DATA_GRID_MIN_ROW_HEIGHT_PX,
  DATA_GRID_MAX_VALUE_FONT_PX,
  DATA_GRID_MIN_LABEL_FONT_PX,
  DATA_GRID_MIN_VALUE_FONT_PX,
  DEFAULT_DATA_GRID_COLS,
  DEFAULT_DATA_GRID_ROWS,
  calcDataGridMetrics,
  calcValueFontSize,
  clampDataGridSize,
  estimateTextEmWidth,
  createEmptyDataMessage,
  deriveDataGridSizeFromCount,
  normaliseSelectedDisplayTelemetry,
  resizeSelectedDisplayTelemetry,
  resolveSelectedValue,
} from "./dashboardDataGrid"

const box = (boxId, selected) => ({
  boxId,
  currently_selected: selected,
  display_name: selected,
  value: 0,
})

describe("clampDataGridSize", () => {
  it("passes through an in-range size", () => {
    expect(clampDataGridSize({ rows: 4, cols: 3 })).toEqual({
      rows: 4,
      cols: 3,
    })
  })

  it("clamps to the limits", () => {
    expect(clampDataGridSize({ rows: 99, cols: 99 })).toEqual({
      rows: 10,
      cols: 6,
    })
    expect(clampDataGridSize({ rows: 0, cols: -1 })).toEqual({
      rows: 1,
      cols: 1,
    })
  })

  it("falls back to the defaults for non numeric values", () => {
    const expected = {
      rows: DEFAULT_DATA_GRID_ROWS,
      cols: DEFAULT_DATA_GRID_COLS,
    }
    expect(clampDataGridSize({})).toEqual(expected)
    expect(clampDataGridSize(undefined)).toEqual(expected)
    expect(clampDataGridSize({ rows: NaN, cols: null })).toEqual(expected)
    expect(clampDataGridSize({ rows: "abc", cols: {} })).toEqual(expected)
  })

  it("coerces numeric strings and rounds fractions", () => {
    expect(clampDataGridSize({ rows: "4", cols: "3" })).toEqual({
      rows: 4,
      cols: 3,
    })
    expect(clampDataGridSize({ rows: 4.7, cols: 2.2 })).toEqual({
      rows: 5,
      cols: 2,
    })
  })
})

describe("resizeSelectedDisplayTelemetry", () => {
  const items = [box(0, "A"), box(1, "B"), box(2, "C")]

  it("keeps the array unchanged at the same size", () => {
    expect(resizeSelectedDisplayTelemetry(items, 3)).toEqual(items)
  })

  it("appends empty boxes when growing", () => {
    const grown = resizeSelectedDisplayTelemetry(items, 5)
    expect(grown).toHaveLength(5)
    expect(grown.slice(0, 3)).toEqual(items)
    expect(grown[3]).toEqual(createEmptyDataMessage(3))
    expect(grown[4].currently_selected).toBeNull()
  })

  it("drops the tail when shrinking", () => {
    const shrunk = resizeSelectedDisplayTelemetry(items, 2)
    expect(shrunk).toEqual([box(0, "A"), box(1, "B")])
  })

  it("keeps boxId dense after any resize", () => {
    const resized = resizeSelectedDisplayTelemetry(
      [box(7, "A"), box(9, "B")],
      4,
    )
    expect(resized.map((item) => item.boxId)).toEqual([0, 1, 2, 3])
  })

  it("handles a missing array", () => {
    expect(resizeSelectedDisplayTelemetry(undefined, 2)).toEqual([
      createEmptyDataMessage(0),
      createEmptyDataMessage(1),
    ])
  })
})

describe("normaliseSelectedDisplayTelemetry", () => {
  it("reindexes boxId and fills in missing fields", () => {
    const result = normaliseSelectedDisplayTelemetry([
      { boxId: 5, currently_selected: "A" },
      {},
    ])
    expect(result).toEqual([
      { boxId: 0, currently_selected: "A", display_name: "", value: 0 },
      { boxId: 1, currently_selected: null, display_name: "", value: 0 },
    ])
  })

  it("returns an empty array for non arrays", () => {
    expect(normaliseSelectedDisplayTelemetry(null)).toEqual([])
  })
})

describe("deriveDataGridSizeFromCount", () => {
  it("reproduces the legacy 3x2 layout for six boxes", () => {
    expect(deriveDataGridSizeFromCount(6)).toEqual({ rows: 3, cols: 2 })
  })

  it("handles a single box", () => {
    expect(deriveDataGridSizeFromCount(1)).toEqual({ rows: 1, cols: 2 })
  })

  it("clamps an oversized count to the row limit", () => {
    expect(deriveDataGridSizeFromCount(60)).toEqual({ rows: 10, cols: 2 })
  })

  it("falls back to the defaults for zero or garbage", () => {
    const expected = {
      rows: DEFAULT_DATA_GRID_ROWS,
      cols: DEFAULT_DATA_GRID_COLS,
    }
    expect(deriveDataGridSizeFromCount(0)).toEqual(expected)
    expect(deriveDataGridSizeFromCount(-4)).toEqual(expected)
    expect(deriveDataGridSizeFromCount("nope")).toEqual(expected)
  })
})

describe("calcDataGridMetrics", () => {
  it("matches roughly today's text-5xl at the default size", () => {
    const { valueFontSize } = calcDataGridMetrics({
      containerWidth: 340,
      rows: 3,
      cols: 2,
    })
    expect(valueFontSize).toBeGreaterThanOrEqual(40)
    expect(valueFontSize).toBeLessThanOrEqual(DATA_GRID_MAX_VALUE_FONT_PX)
  })

  it("never grows the font beyond the maximum", () => {
    const { valueFontSize } = calcDataGridMetrics({
      containerWidth: 5000,
      availableHeight: 5000,
      rows: 1,
      cols: 1,
    })
    expect(valueFontSize).toBe(DATA_GRID_MAX_VALUE_FONT_PX)
  })

  it("grows the rows to use the height the panel actually has", () => {
    const short = calcDataGridMetrics({
      containerWidth: 340,
      availableHeight: 200,
      rows: 3,
      cols: 2,
    })
    const tall = calcDataGridMetrics({
      containerWidth: 340,
      availableHeight: 600,
      rows: 3,
      cols: 2,
    })
    expect(tall.rowHeight).toBeGreaterThan(short.rowHeight)
    expect(tall.valueFontSize).toBeGreaterThan(short.valueFontSize)
  })

  it.each([1, 2, 3, 5, 8])(
    "fills the available height with %i rows",
    (rows) => {
      const availableHeight = 600
      const { rowHeight } = calcDataGridMetrics({
        containerWidth: 340,
        availableHeight,
        rows,
        cols: 2,
      })
      const gridHeight = rowHeight * rows + DATA_GRID_GAP_PX * (rows - 1)
      expect(Math.round(gridHeight)).toBe(availableHeight)
    },
  )

  it("falls back to a sensible height before the panel is measured", () => {
    const unmeasured = calcDataGridMetrics({
      containerWidth: 340,
      availableHeight: 0,
      rows: 3,
      cols: 2,
    })
    const fallback = calcDataGridMetrics({
      containerWidth: 340,
      availableHeight: DATA_GRID_FALLBACK_HEIGHT_PX,
      rows: 3,
      cols: 2,
    })
    expect(unmeasured).toEqual(fallback)
    expect(unmeasured.valueFontSize).toBeGreaterThanOrEqual(40)
  })

  it("stops shrinking rows at the floor so a dense grid scrolls instead", () => {
    const { rowHeight } = calcDataGridMetrics({
      containerWidth: 340,
      availableHeight: 120,
      rows: 10,
      cols: 2,
    })
    expect(rowHeight).toBe(DATA_GRID_MIN_ROW_HEIGHT_PX)
  })

  it("keeps a long value inside its cell even when height is plentiful", () => {
    const { valueFontSize, cellWidth } = calcDataGridMetrics({
      containerWidth: 340,
      availableHeight: 2000,
      rows: 2,
      cols: 2,
    })
    const text = "12345.67"
    const fontSize = calcValueFontSize({
      cellWidth,
      maxFontSize: valueFontSize,
      text,
    })
    expect(estimateTextEmWidth(text) * fontSize).toBeLessThanOrEqual(cellWidth)
  })

  it("shrinks the font as rows are squeezed, down to the row floor", () => {
    const { rowHeight, valueFontSize } = calcDataGridMetrics({
      containerWidth: 220,
      availableHeight: 120,
      rows: 10,
      cols: 6,
    })
    // The row height bottoms out first, which pins the smallest font the grid
    // itself will ask for; a narrow cell shrinks it further per value
    expect(rowHeight).toBe(DATA_GRID_MIN_ROW_HEIGHT_PX)
    expect(valueFontSize).toBeLessThan(20)
    expect(valueFontSize).toBeGreaterThanOrEqual(DATA_GRID_MIN_VALUE_FONT_PX)
  })

  it("drives a value in a very narrow cell to the minimum font", () => {
    const { cellWidth, valueFontSize } = calcDataGridMetrics({
      containerWidth: 220,
      availableHeight: 400,
      rows: 3,
      cols: 6,
    })
    expect(
      calcValueFontSize({
        cellWidth,
        maxFontSize: valueFontSize,
        text: "12345.67",
      }),
    ).toBe(DATA_GRID_MIN_VALUE_FONT_PX)
  })

  it("does not grow the font as columns increase", () => {
    const sizes = [1, 2, 3, 4, 5, 6].map((cols) =>
      calcValueFontSize({
        cellWidth: calcDataGridMetrics({ containerWidth: 400, rows: 3, cols })
          .cellWidth,
        maxFontSize: calcDataGridMetrics({ containerWidth: 400, rows: 3, cols })
          .valueFontSize,
        text: "123.45",
      }),
    )
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]).toBeLessThanOrEqual(sizes[i - 1])
    }
  })

  it("does not grow the font as rows increase", () => {
    const sizes = [1, 2, 4, 6, 8, 10].map(
      (rows) =>
        calcDataGridMetrics({ containerWidth: 400, rows, cols: 2 })
          .valueFontSize,
    )
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]).toBeLessThanOrEqual(sizes[i - 1])
    }
  })

  it("gives the label a readable size at the default grid", () => {
    const { labelFontSize } = calcDataGridMetrics({
      containerWidth: 340,
      rows: 3,
      cols: 2,
    })
    expect(labelFontSize).toBe(DATA_GRID_MAX_LABEL_FONT_PX)
  })

  it("keeps the label above the floor even on the densest grid", () => {
    const { labelFontSize } = calcDataGridMetrics({
      containerWidth: 220,
      rows: 10,
      cols: 6,
    })
    expect(labelFontSize).toBe(DATA_GRID_MIN_LABEL_FONT_PX)
    expect(labelFontSize).toBeGreaterThanOrEqual(10)
  })

  it("keeps the label and value inside the row height", () => {
    const sizes = [
      { rows: 3, cols: 2, containerWidth: 340 },
      { rows: 10, cols: 6, containerWidth: 260 },
      { rows: 1, cols: 1, containerWidth: 600 },
      { rows: 8, cols: 3, containerWidth: 400 },
    ]
    sizes.forEach((size) => {
      const { rowHeight, valueFontSize, labelFontSize } =
        calcDataGridMetrics(size)
      // Rough line boxes for the two stacked lines in a cell
      const stacked =
        valueFontSize * DATA_GRID_VALUE_LINE_HEIGHT +
        labelFontSize * DATA_GRID_LABEL_LINE_HEIGHT
      expect(stacked).toBeLessThanOrEqual(rowHeight)
    })
  })

  it("produces finite, non negative numbers for a zero width container", () => {
    const metrics = calcDataGridMetrics({
      containerWidth: 0,
      rows: 3,
      cols: 2,
    })
    Object.values(metrics).forEach((value) => {
      expect(Number.isFinite(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(0)
    })
    expect(metrics.cellWidth).toBe(0)
    // Zero width means unmeasured rather than genuinely tiny, so the per value
    // size keeps the height driven maximum instead of flashing at the floor
    expect(
      calcValueFontSize({
        cellWidth: metrics.cellWidth,
        maxFontSize: metrics.valueFontSize,
        text: "123.45",
      }),
    ).toBe(metrics.valueFontSize)
  })

  it("survives a missing container width", () => {
    expect(() =>
      calcDataGridMetrics({ containerWidth: undefined, rows: 3, cols: 2 }),
    ).not.toThrow()
  })
})

describe("calcValueFontSize", () => {
  const cellWidth = 168
  const maxFontSize = 67

  it("makes a short value larger than a long one", () => {
    const short = calcValueFontSize({ cellWidth, maxFontSize, text: "45" })
    const long = calcValueFontSize({ cellWidth, maxFontSize, text: "12345.67" })
    expect(short).toBeGreaterThan(long)
  })

  it("never exceeds the height driven maximum", () => {
    const fontSize = calcValueFontSize({ cellWidth, maxFontSize, text: "4" })
    expect(fontSize).toBe(maxFontSize)
  })

  it.each(["1", "45", "123", "18.4", "123.45", "1234.56", "-12345.67"])(
    "keeps %s inside its cell",
    (text) => {
      const fontSize = calcValueFontSize({
        cellWidth,
        maxFontSize: DATA_GRID_MAX_VALUE_FONT_PX,
        text,
      })
      expect(estimateTextEmWidth(text) * fontSize).toBeLessThanOrEqual(
        cellWidth,
      )
    },
  )

  it("does not resize across a digit boundary within a bucket", () => {
    // The quantised budget is what stops a climb rate flickering as it crosses 10
    expect(calcValueFontSize({ cellWidth, maxFontSize, text: "9.99" })).toBe(
      calcValueFontSize({ cellWidth, maxFontSize, text: "10.00" }),
    )
  })

  it("falls back to the maximum when there is nothing to measure", () => {
    expect(calcValueFontSize({ cellWidth: 0, maxFontSize, text: "45" })).toBe(
      maxFontSize,
    )
    expect(calcValueFontSize({ cellWidth, maxFontSize, text: "" })).toBe(
      maxFontSize,
    )
  })

  it("stays within the global font bounds", () => {
    expect(
      calcValueFontSize({ cellWidth: 4, maxFontSize, text: "12345.67" }),
    ).toBe(DATA_GRID_MIN_VALUE_FONT_PX)
    expect(
      calcValueFontSize({ cellWidth: 9000, maxFontSize: 9000, text: "4" }),
    ).toBe(DATA_GRID_MAX_VALUE_FONT_PX)
  })
})

describe("estimateTextEmWidth", () => {
  it("counts a period as narrower than a digit", () => {
    expect(estimateTextEmWidth(".")).toBeLessThan(estimateTextEmWidth("4"))
  })

  it("grows with the number of characters", () => {
    expect(estimateTextEmWidth("123")).toBeGreaterThan(
      estimateTextEmWidth("12"),
    )
  })

  it("returns zero for empty and non string input", () => {
    expect(estimateTextEmWidth("")).toBe(0)
    expect(estimateTextEmWidth(null)).toBe(0)
    expect(estimateTextEmWidth(undefined)).toBe(0)
  })
})

describe("resolveSelectedValue", () => {
  it("reads the field off a matching message", () => {
    const msg = { mavpackettype: "VFR_HUD", alt: 123.4 }
    expect(resolveSelectedValue(msg, "VFR_HUD.alt")).toBe(123.4)
  })

  it("returns undefined when the message does not carry the field", () => {
    const msg = { mavpackettype: "VFR_HUD", alt: 123.4 }
    expect(resolveSelectedValue(msg, "VFR_HUD.climb")).toBeUndefined()
  })

  it("does not let ATTITUDE hijack ATTITUDE_QUATERNION", () => {
    const msg = { mavpackettype: "ATTITUDE", rollspeed: 0.5 }
    expect(
      resolveSelectedValue(msg, "ATTITUDE_QUATERNION.rollspeed"),
    ).toBeUndefined()
    expect(resolveSelectedValue(msg, "ATTITUDE.rollspeed")).toBe(0.5)
  })

  it("does not let RC_CHANNELS hijack RC_CHANNELS_RAW", () => {
    const msg = { mavpackettype: "RC_CHANNELS", chan1_raw: 1500 }
    expect(
      resolveSelectedValue(msg, "RC_CHANNELS_RAW.chan1_raw"),
    ).toBeUndefined()
  })

  it("does not let SCALED_PRESSURE hijack SCALED_PRESSURE2", () => {
    const msg = { mavpackettype: "SCALED_PRESSURE", press_abs: 1013 }
    expect(
      resolveSelectedValue(msg, "SCALED_PRESSURE2.press_abs"),
    ).toBeUndefined()
  })

  it("returns undefined for malformed selections", () => {
    const msg = { mavpackettype: "VFR_HUD", alt: 1 }
    expect(resolveSelectedValue(msg, "")).toBeUndefined()
    expect(resolveSelectedValue(msg, "VFR_HUD")).toBeUndefined()
    expect(resolveSelectedValue(msg, ".alt")).toBeUndefined()
    expect(resolveSelectedValue(msg, "VFR_HUD.")).toBeUndefined()
    expect(resolveSelectedValue(msg, null)).toBeUndefined()
    expect(resolveSelectedValue(msg, undefined)).toBeUndefined()
    expect(resolveSelectedValue(null, "VFR_HUD.alt")).toBeUndefined()
  })

  it("does not pick up inherited object properties", () => {
    const msg = { mavpackettype: "VFR_HUD" }
    expect(resolveSelectedValue(msg, "VFR_HUD.toString")).toBeUndefined()
  })
})
