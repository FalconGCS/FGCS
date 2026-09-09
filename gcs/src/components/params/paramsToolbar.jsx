/*
Component containing the toolbar for the parameters page

Contains the search bar, as well as the buttons for toggling shown parameters, saving and refreshing parameters, and
rebooting the autopilot
*/

// 3rd party imports
import { Button, Chip, TextInput, Tooltip } from "@mantine/core"
import { IconEye, IconTool } from "@tabler/icons-react"

// Styling imports
import resolveConfig from "tailwindcss/resolveConfig"
import tailwindConfig from "../../../tailwind.config.js"
const tailwindColors = resolveConfig(tailwindConfig).theme.colors

// Redux
import { useDispatch, useSelector } from "react-redux"
import {
  selectModifiedParams,
  selectParamSearchValue,
  selectShowModifiedParams,
  setParamSearchValue,
  toggleShowModifiedParams,
} from "../../redux/slices/paramsSlice.js"

// Quick filter presets for common parameter groups
const PARAM_PRESETS = [
  { label: "Serial Ports", filter: "SERIAL" },
  { label: "Battery", filter: "BATT" },
  { label: "Failsafes", filter: "FS" },
  { label: "Waypoint", filter: "WP" },
  { label: "RC", filter: "RC" },
]

export default function ParamsToolbar() {
  const dispatch = useDispatch()
  const searchValue = useSelector(selectParamSearchValue)
  const modifiedParams = useSelector(selectModifiedParams)
  const showModifiedParams = useSelector(selectShowModifiedParams)

  // Check if current search matches a preset (for toggle behavior)
  const activePreset = PARAM_PRESETS.find(
    (p) => searchValue.toUpperCase() === p.filter,
  )

  function handlePresetClick(preset) {
    if (activePreset?.filter === preset.filter) {
      // Toggle off if already active
      dispatch(setParamSearchValue(""))
    } else {
      dispatch(setParamSearchValue(preset.filter))
    }
  }

  return (
    <div className="flex items-center gap-4 m-4">
      <Tooltip
        label={showModifiedParams ? "Show all params" : "Show modified params"}
        position="bottom"
      >
        <Button
          size="sm"
          onClick={() => dispatch(toggleShowModifiedParams())}
          color={tailwindColors.orange[600]}
          disabled={modifiedParams.length === 0}
        >
          {showModifiedParams ? <IconEye size={14} /> : <IconTool size={14} />}
        </Button>
      </Tooltip>
      <TextInput
        className="w-1/3"
        placeholder="Search by parameter name"
        value={searchValue}
        onChange={(event) =>
          dispatch(setParamSearchValue(event.currentTarget.value))
        }
      />
      <div className="flex items-center gap-2">
        <span className="text-xs text-neutral-400">Quick filters:</span>
        {PARAM_PRESETS.map((preset) => (
          <Chip
            key={preset.filter}
            variant="outline"
            checked={activePreset?.filter === preset.filter}
            onChange={() => handlePresetClick(preset)}
          >
            {preset.label}
          </Chip>
        ))}
      </div>
    </div>
  )
}
