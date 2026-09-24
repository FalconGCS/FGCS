import { Button, Divider, NumberInput } from "@mantine/core"
import { useState } from "react"
import {
  DATA_GRID_LIMITS,
  DEFAULT_DATA_GRID_COLS,
  DEFAULT_DATA_GRID_ROWS,
} from "../../../helpers/dashboardDataGrid"
import ContextMenuItem from "../../mapComponents/contextMenuItem"

function SizeInput({ label, value, min, max, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 px-4">
      <p className="text-sm">{label}</p>
      <NumberInput
        size="xs"
        className="w-20"
        value={value}
        min={min}
        max={max}
        step={1}
        allowDecimal={false}
        allowNegative={false}
        clampBehavior="blur"
        onChange={onChange}
        aria-label={label}
      />
    </div>
  )
}

export default function DataGridContextMenu({
  passedRef,
  position,
  rows,
  cols,
  onChange,
  onClose,
}) {
  const [draft, setDraft] = useState({ rows, cols })

  const isDefaultSize =
    rows === DEFAULT_DATA_GRID_ROWS && cols === DEFAULT_DATA_GRID_COLS

  const nextSize = {
    rows: draft.rows === "" ? rows : draft.rows,
    cols: draft.cols === "" ? cols : draft.cols,
  }
  const isUnchanged = nextSize.rows === rows && nextSize.cols === cols

  function applyDraft() {
    if (isUnchanged) return
    onChange(nextSize)
    onClose()
  }

  return (
    <div
      ref={passedRef}
      data-testid="data-grid-context-menu"
      className="absolute bg-falcongrey-700 rounded-md p-1 z-20 shadow-lg"
      style={{ top: position.y, left: position.x }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      <p className="text-xs text-gray-400 py-1 px-4">Grid size</p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          applyDraft()
        }}
      >
        <SizeInput
          label="Columns"
          value={draft.cols}
          min={DATA_GRID_LIMITS.minCols}
          max={DATA_GRID_LIMITS.maxCols}
          onChange={(value) =>
            setDraft((current) => ({ ...current, cols: value }))
          }
        />
        <SizeInput
          label="Rows"
          value={draft.rows}
          min={DATA_GRID_LIMITS.minRows}
          max={DATA_GRID_LIMITS.maxRows}
          onChange={(value) =>
            setDraft((current) => ({ ...current, rows: value }))
          }
        />

        <div className="px-4 py-1">
          <Button type="submit" size="xs" fullWidth disabled={isUnchanged}>
            Apply
          </Button>
        </div>
      </form>

      <Divider className="my-1" />

      <ContextMenuItem
        disabled={isDefaultSize}
        onClick={() => {
          onChange({
            rows: DEFAULT_DATA_GRID_ROWS,
            cols: DEFAULT_DATA_GRID_COLS,
          })
          onClose()
        }}
      >
        <p className="text-sm">
          Reset to {DEFAULT_DATA_GRID_ROWS} x {DEFAULT_DATA_GRID_COLS}
        </p>
      </ContextMenuItem>
    </div>
  )
}
