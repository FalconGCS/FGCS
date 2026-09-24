import { describe, expect, it } from "vitest"
import { defaultDataMessages } from "./dashboardDefaultDataMessages"
import {
  SELECTED_DISPLAY_TELEMETRY_CONFIG_VERSION,
  mergeSelectedDisplayTelemetryConfigWithDefaults,
  toSelectedDisplayTelemetryPersistedConfig,
} from "./selectedDisplayTelemetryConfig"

const persistedBox = (boxId, selection, name) => ({
  boxId,
  currently_selected: selection,
  display_name: name ?? selection,
})

// A handful of real selections from the catalogue, enough to fill a big grid
const KNOWN = [
  "VFR_HUD.alt",
  "VFR_HUD.climb",
  "VFR_HUD.airspeed",
  "VFR_HUD.groundspeed",
  "VFR_HUD.throttle",
  "VFR_HUD.heading",
  "ATTITUDE.roll",
  "ATTITUDE.pitch",
  "ATTITUDE.yaw",
  "SYS_STATUS.load",
]

const knownSelection = (index) => KNOWN[index % KNOWN.length]

describe("toSelectedDisplayTelemetryPersistedConfig", () => {
  it("stores the grid size alongside the boxes", () => {
    const config = toSelectedDisplayTelemetryPersistedConfig(
      defaultDataMessages,
      { rows: 4, cols: 3 },
    )
    expect(config.version).toBe(SELECTED_DISPLAY_TELEMETRY_CONFIG_VERSION)
    expect(config.rows).toBe(4)
    expect(config.cols).toBe(3)
    expect(config.boxes).toHaveLength(defaultDataMessages.length)
  })

  it("never persists the live value", () => {
    const config = toSelectedDisplayTelemetryPersistedConfig(
      [
        {
          boxId: 0,
          currently_selected: "VFR_HUD.alt",
          display_name: "Alt",
          value: 123,
        },
      ],
      { rows: 1, cols: 1 },
    )
    expect(config.boxes[0]).not.toHaveProperty("value")
    expect(JSON.stringify(config)).not.toContain("123")
  })

  it("clamps a nonsense grid size", () => {
    const config = toSelectedDisplayTelemetryPersistedConfig([], {
      rows: 99,
      cols: 0,
    })
    expect(config).toMatchObject({ rows: 10, cols: 1 })
  })
})

describe("mergeSelectedDisplayTelemetryConfigWithDefaults", () => {
  it("does not truncate a grid larger than the defaults", () => {
    // Regression: the previous implementation mapped over the 6 defaults, so
    // any saved grid came back as 6 boxes no matter how big it was
    const boxes = Array.from({ length: 24 }, (_, i) =>
      persistedBox(i, knownSelection(i)),
    )
    const merged = mergeSelectedDisplayTelemetryConfigWithDefaults({
      version: 2,
      rows: 6,
      cols: 4,
      boxes,
    })

    expect(merged.boxes).toHaveLength(24)
    expect(merged).toMatchObject({ rows: 6, cols: 4 })
    expect(merged.boxes[23].currently_selected).toBe(knownSelection(23))
  })

  it("reads a legacy plain array as the old 3x2 grid", () => {
    const legacy = defaultDataMessages.map(
      ({ boxId, currently_selected, display_name }) => ({
        boxId,
        currently_selected,
        display_name,
      }),
    )
    const merged = mergeSelectedDisplayTelemetryConfigWithDefaults(legacy)

    expect(merged).toMatchObject({ rows: 3, cols: 2 })
    expect(merged.boxes).toEqual(defaultDataMessages)
  })

  it("clamps and truncates an oversized legacy array", () => {
    const legacy = Array.from({ length: 40 }, (_, i) =>
      persistedBox(i, knownSelection(i)),
    )
    const merged = mergeSelectedDisplayTelemetryConfigWithDefaults(legacy)

    expect(merged).toMatchObject({ rows: 10, cols: 2 })
    expect(merged.boxes).toHaveLength(20)
  })

  it.each([
    [1, 1],
    [3, 2],
    [6, 10],
    [2, 5],
  ])("round trips a %ix%i grid", (cols, rows) => {
    const count = rows * cols
    const boxes = Array.from({ length: count }, (_, i) => ({
      boxId: i,
      currently_selected: knownSelection(i),
      display_name: knownSelection(i),
      value: 0,
    }))

    const merged = mergeSelectedDisplayTelemetryConfigWithDefaults(
      toSelectedDisplayTelemetryPersistedConfig(boxes, { rows, cols }),
    )

    expect(merged.rows).toBe(rows)
    expect(merged.cols).toBe(cols)
    expect(merged.boxes).toHaveLength(count)
    expect(merged.boxes.map((b) => b.currently_selected)).toEqual(
      boxes.map((b) => b.currently_selected),
    )
    expect(merged.boxes.every((b) => b.value === 0)).toBe(true)
  })

  it("always returns dense boxIds even when the stored ones are wrong", () => {
    const merged = mergeSelectedDisplayTelemetryConfigWithDefaults({
      version: 2,
      rows: 1,
      cols: 3,
      boxes: [
        persistedBox(9, "VFR_HUD.alt"),
        persistedBox(9, "VFR_HUD.climb"),
        persistedBox(9, "VFR_HUD.airspeed"),
      ],
    })
    expect(merged.boxes.map((b) => b.boxId)).toEqual([0, 1, 2])
  })

  it("pads a config whose boxes array is short", () => {
    const merged = mergeSelectedDisplayTelemetryConfigWithDefaults({
      version: 2,
      rows: 2,
      cols: 2,
      boxes: [persistedBox(0, "VFR_HUD.alt")],
    })
    expect(merged.boxes).toHaveLength(4)
    expect(merged.boxes[0].currently_selected).toBe("VFR_HUD.alt")
    // Positions the defaults cover fall back to them
    expect(merged.boxes[1].currently_selected).toBe(
      defaultDataMessages[1].currently_selected,
    )
  })

  it("falls back to the default when a selection left the catalogue", () => {
    const merged = mergeSelectedDisplayTelemetryConfigWithDefaults({
      version: 2,
      rows: 3,
      cols: 2,
      boxes: [
        persistedBox(0, "VFR_HUD.alt"),
        persistedBox(1, "VFR_HUD.climb"),
        persistedBox(2, "NOPE.gone"),
        persistedBox(3, "VFR_HUD.airspeed"),
        persistedBox(4, "VFR_HUD.throttle"),
        persistedBox(5, "VFR_HUD.heading"),
      ],
    })
    expect(merged.boxes[2].currently_selected).toBe(
      defaultDataMessages[2].currently_selected,
    )
  })

  it("leaves an unknown selection beyond the defaults as an empty box", () => {
    const boxes = Array.from({ length: 8 }, (_, i) =>
      persistedBox(i, i === 7 ? "NOPE.gone" : knownSelection(i)),
    )
    const merged = mergeSelectedDisplayTelemetryConfigWithDefaults({
      version: 2,
      rows: 4,
      cols: 2,
      boxes,
    })
    expect(merged.boxes[7].currently_selected).toBeNull()
  })

  it("keeps a deliberately cleared box cleared", () => {
    const merged = mergeSelectedDisplayTelemetryConfigWithDefaults({
      version: 2,
      rows: 1,
      cols: 2,
      boxes: [persistedBox(0, null), persistedBox(1, "VFR_HUD.alt")],
    })
    expect(merged.boxes[0].currently_selected).toBeNull()
    expect(merged.boxes[1].currently_selected).toBe("VFR_HUD.alt")
  })

  it("relabels a stale display name with the field name", () => {
    const merged = mergeSelectedDisplayTelemetryConfigWithDefaults({
      version: 2,
      rows: 1,
      cols: 1,
      boxes: [persistedBox(0, "VFR_HUD.alt", "a stale name")],
    })
    expect(merged.boxes[0].display_name).toBe("alt")
  })

  it("labels every box with the mavlink field name", () => {
    const merged = mergeSelectedDisplayTelemetryConfigWithDefaults({
      version: 2,
      rows: 2,
      cols: 2,
      boxes: [
        persistedBox(0, "BATTERY_STATUS.current_consumed"),
        persistedBox(1, "ATTITUDE.pitch"),
        persistedBox(2, "NAV_CONTROLLER_OUTPUT.wp_dist"),
        persistedBox(3, "SYS_STATUS.load"),
      ],
    })
    expect(merged.boxes.map((b) => b.display_name)).toEqual([
      "current_consumed",
      "pitch",
      "wp_dist",
      "load",
    ])
  })

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["an empty object", {}],
    ["an empty array", []],
    ["a non array boxes field", { boxes: "x" }],
    ["an empty boxes array", { boxes: [] }],
    ["a string", "nope"],
    ["a number", 7],
  ])("falls back to the defaults for %s", (_label, input) => {
    const merged = mergeSelectedDisplayTelemetryConfigWithDefaults(input)
    expect(merged).toMatchObject({ rows: 3, cols: 2 })
    expect(merged.boxes).toEqual(defaultDataMessages)
  })

  it("clamps an out of range stored grid size", () => {
    const merged = mergeSelectedDisplayTelemetryConfigWithDefaults({
      version: 2,
      rows: 99,
      cols: -1,
      boxes: [persistedBox(0, "VFR_HUD.alt")],
    })
    expect(merged).toMatchObject({ rows: 10, cols: 1 })
    expect(merged.boxes).toHaveLength(10)
  })
})
