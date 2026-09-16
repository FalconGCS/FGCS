/*
  Floating ESC telemetry widget (row-positioned like VideoWidget)
*/
import { ActionIcon, NumberInput, Popover, Stack, Text } from "@mantine/core"
import {
  IconBolt,
  IconMaximize,
  IconMinus,
  IconSettings,
} from "@tabler/icons-react"
import { useMemo, useState } from "react"
import { useDispatch, useSelector } from "react-redux"
import GetOutsideVisibilityColor from "../../helpers/outsideVisibility"
import {
  selectEscTelemetryMaximised,
  selectEscTelemetryThresholds,
  selectOutsideVisibility,
  setEscTelemetryMaximised,
  setEscTelemetryThresholds,
} from "../../redux/slices/droneConnectionSlice"
import { selectEscTelemetry } from "../../redux/slices/droneInfoSlice"

const DEFAULT_ESC_THRESHOLDS = {
  temperature: {
    warning: 90,
    danger: 120,
    higherIsBetter: false,
  },
}

const OUTSIDE_VISIBILITY_SCALE = 1.5

// Base (scale = 1) sizes in pixels, everything in a tile scales from these
const BASE_FONT_SIZE = 14
const BASE_ICON_SIZE = 16
const BASE_TILE_WIDTH = 104
const MAX_COLUMNS = 4
const MAX_VISIBLE_ROWS = 4
const TILE_GAP = 8

function fmt(value, decimals = 0) {
  if (value === null || value === undefined) return "—"
  const n = Number(value)
  if (!Number.isFinite(n)) return "—"
  return n.toFixed(decimals)
}

function fmtTemp(value) {
  if (value === null || value === undefined) return "—"

  const n = Number(value)
  if (!Number.isFinite(n)) return "—"

  // Some MAVLink ESC telemetry implementations report temperature in
  // centi-degrees Celsius rather than degrees Celsius. If the value is
  // unrealistically high for an ESC temperature, assume centi-degrees
  // and convert to °C.
  const degC = n > 200 ? n / 100.0 : n
  return degC.toFixed(0)
}

function getTemperatureThresholdColor(value, config) {
  if (value === null || value === undefined) return "text-slate-200"

  const n = Number(value)
  if (!Number.isFinite(n)) return "text-slate-200"

  if (config.higherIsBetter) {
    if (n <= config.danger) return "text-red-400"
    if (n <= config.warning) return "text-yellow-400"
    return "text-green-400"
  }

  if (n >= config.danger) return "text-red-400"
  if (n >= config.warning) return "text-yellow-400"
  return "text-green-400"
}

function EscTile({ esc, thresholds, fontSize }) {
  const temperatureClass = getTemperatureThresholdColor(
    esc.temperature,
    thresholds.temperature,
  )

  return (
    <div
      className="rounded-md border border-falcongrey-700 bg-falcongrey-900 p-2"
      style={{ fontSize: `${fontSize}px`, lineHeight: 1.35 }}
    >
      <div className="flex flex-row items-center justify-between mb-1">
        <div className="text-slate-200 font-semibold">ESC {esc.escId}</div>
      </div>

      <div className="flex flex-col gap-y-0.5">
        <div className="flex flex-row items-center justify-between gap-x-2">
          <div className="text-slate-500">RPM</div>
          <div className="text-slate-200 tabular-nums">{fmt(esc.rpm, 0)}</div>
        </div>

        <div className="flex flex-row items-center justify-between gap-x-2">
          <div className="text-slate-500">A</div>
          <div className="text-slate-200 tabular-nums">
            {fmt(esc.current, 2)}
          </div>
        </div>

        <div className="flex flex-row items-center justify-between gap-x-2">
          <div className="text-slate-500">°C</div>
          <div className={`tabular-nums ${temperatureClass}`}>
            {fmtTemp(esc.temperature)}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function EscTelemetryWidget() {
  const dispatch = useDispatch()

  const escs = useSelector(selectEscTelemetry)

  const isMaximised = useSelector(selectEscTelemetryMaximised)
  const [settingsOpened, setSettingsOpened] = useState(false)

  const thresholds = useSelector(selectEscTelemetryThresholds)
  const outsideVisibility = useSelector(selectOutsideVisibility)

  const scale = outsideVisibility ? OUTSIDE_VISIBILITY_SCALE : 1

  const hasAnyData = Array.isArray(escs) && escs.length > 0

  const fontSize = Math.round(BASE_FONT_SIZE * scale)
  const iconSize = Math.round(BASE_ICON_SIZE * scale)

  const dimensions = useMemo(() => {
    const count = Array.isArray(escs) ? escs.length : 0

    const cols = Math.min(MAX_COLUMNS, Math.max(1, count))
    const rows = Math.max(1, Math.ceil(count / cols))
    const visibleRows = Math.min(rows, MAX_VISIBLE_ROWS)

    // Header row plus the three metric rows, tile padding and borders
    const tileH = Math.round(4 * fontSize * 1.35 + 4 + 16 + 2)
    const tileW = Math.round(BASE_TILE_WIDTH * scale)

    const paddingH = 32

    return {
      cols,
      tileW,
      width: Math.max(350, cols * tileW + (cols - 1) * TILE_GAP + 16),
      height: Math.round(
        visibleRows * tileH + (visibleRows - 1) * TILE_GAP + paddingH,
      ),
    }
  }, [escs, fontSize, scale])

  function updateThreshold(metric, field, value) {
    const numericValue = Number(value)

    dispatch(
      setEscTelemetryThresholds({
        ...thresholds,
        [metric]: {
          ...thresholds[metric],
          [field]: Number.isFinite(numericValue)
            ? numericValue
            : thresholds[metric][field],
        },
      }),
    )
  }

  function resetThresholds() {
    dispatch(setEscTelemetryThresholds(DEFAULT_ESC_THRESHOLDS))
  }

  if (!isMaximised) {
    return (
      <div
        className="rounded-md"
        style={{ background: GetOutsideVisibilityColor() }}
      >
        <div className="p-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconBolt
              size={iconSize}
              className={hasAnyData ? "text-slate-200" : "text-slate-500"}
            />
            <Text
              className="truncate"
              style={{
                fontSize: `${fontSize}px`,
                maxWidth: `${150 * scale}px`,
              }}
            >
              {hasAnyData ? "ESC telemetry" : "No ESC telemetry"}
            </Text>
          </div>

          <ActionIcon
            size={outsideVisibility ? "lg" : "sm"}
            variant="subtle"
            onClick={() => dispatch(setEscTelemetryMaximised(true))}
            className="text-slate-400 hover:text-slate-200"
            title="Maximise ESC widget"
          >
            <IconMaximize size={iconSize} />
          </ActionIcon>
        </div>
      </div>
    )
  }

  return (
    <div
      className="rounded-md flex flex-col"
      style={{
        background: GetOutsideVisibilityColor(),
        minWidth: `${dimensions.width + 16}px`,
      }}
    >
      <div className="p-2 h-full flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <Text style={{ fontSize: `${fontSize}px` }}>ESC telemetry</Text>

          <div className="flex items-center gap-1">
            <ActionIcon
              size={outsideVisibility ? "lg" : "sm"}
              variant="subtle"
              onClick={() => dispatch(setEscTelemetryMaximised(false))}
              className="text-slate-400 hover:text-slate-200"
              title="Minimise ESC widget"
            >
              <IconMinus size={iconSize} />
            </ActionIcon>

            <Popover
              opened={settingsOpened}
              onChange={setSettingsOpened}
              position="top"
              withArrow
              shadow="md"
              width={260}
            >
              <Popover.Target>
                <ActionIcon
                  size={outsideVisibility ? "lg" : "sm"}
                  variant="subtle"
                  onClick={() => setSettingsOpened((o) => !o)}
                  className="text-slate-400 hover:text-slate-200"
                  title="ESC threshold settings"
                >
                  <IconSettings size={iconSize} />
                </ActionIcon>
              </Popover.Target>

              <Popover.Dropdown>
                <Stack gap="xs">
                  <Text size="sm" fw={600}>
                    ESC Thresholds
                  </Text>

                  <Text size="xs" fw={600}>
                    Temperature (°C)
                  </Text>
                  <NumberInput
                    label="Warning"
                    value={thresholds.temperature.warning}
                    onChange={(value) =>
                      updateThreshold("temperature", "warning", value)
                    }
                    allowDecimal={false}
                  />
                  <NumberInput
                    label="Danger"
                    value={thresholds.temperature.danger}
                    onChange={(value) =>
                      updateThreshold("temperature", "danger", value)
                    }
                    allowDecimal={false}
                  />

                  <Text
                    size="xs"
                    c="blue"
                    className="cursor-pointer text-center w-full"
                    onClick={resetThresholds}
                  >
                    Reset thresholds
                  </Text>
                </Stack>
              </Popover.Dropdown>
            </Popover>
          </div>
        </div>

        <div
          className="rounded overflow-hidden mx-auto flex-1"
          style={{
            width: `${dimensions.width}px`,
            height: `${dimensions.height}px`,
            minHeight: "128px",
          }}
        >
          {!hasAnyData ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-center">
              <IconBolt
                size={Math.round(24 * scale)}
                className="text-slate-500 mb-1"
              />
              <Text style={{ fontSize: `${fontSize}px` }}>
                Waiting for ESC telemetry
              </Text>
            </div>
          ) : (
            <div className="w-full h-full overflow-auto p-2">
              <div
                className="grid gap-2"
                style={{
                  gridTemplateColumns: `repeat(${dimensions.cols}, minmax(${dimensions.tileW}px, 1fr))`,
                }}
              >
                {escs.map((esc) => (
                  <EscTile
                    key={esc.escId}
                    esc={esc}
                    thresholds={thresholds}
                    fontSize={fontSize}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
