/*
  This component displays the row for a mission item in a table.
*/

import {
  ActionIcon,
  NumberInput,
  Select,
  TableTd,
  TableTr,
} from "@mantine/core"
import { IconArrowDown, IconArrowUp, IconTrash } from "@tabler/icons-react"
import { coordToInt, intToCoord } from "../../helpers/dataFormatters"
import {
  COMMONLY_USED_MISSION_TABLE_LABELS,
  COPTER_MISSION_ITEM_COMMANDS_LIST,
  MAV_FRAME_DROPDOWN_DATA,
  PLANE_MISSION_ITEM_COMMANDS_LIST,
} from "../../helpers/mavlinkConstants"

// Redux
import { useDispatch, useSelector } from "react-redux"
import { selectAircraftType } from "../../redux/slices/droneInfoSlice"
import {
  removeDrawingItem,
  reorderDrawingItem,
  selectDrawingMissionItemByIdx,
  updateDrawingItem,
} from "../../redux/slices/missionSlice"

const coordsFractionDigits = 9

function formatMetric(value, suffix) {
  if (!Number.isFinite(value)) {
    return "-"
  }

  return `${value.toFixed(2)}${suffix}`
}

// TODO: Moved into shared helper file
function parseNumericInput(value) {
  if (value === null || value === undefined || value === "") {
    return null
  }

  const numericValue = typeof value === "number" ? value : Number(value)
  return Number.isFinite(numericValue) ? numericValue : null
}

function parseCoordinateInput(value) {
  if (value === null || value === undefined || value === "") {
    return 0
  }

  const numericValue = parseNumericInput(value)
  return numericValue === null ? 0 : numericValue
}

export default function MissionItemsTableRow({ missionItemIndex, rowMetrics }) {
  const dispatch = useDispatch()
  const aircraftType = useSelector(selectAircraftType)
  const missionItem = useSelector(
    selectDrawingMissionItemByIdx(missionItemIndex),
  )

  // Commonly used section
  const commonlyUsedTag = "-com-used"

  function getDisplayCommandName(commandName) {
    if (commandName.startsWith("MAV_CMD_NAV_")) {
      commandName = commandName.replace("MAV_CMD_NAV_", "")
    } else if (commandName.startsWith("MAV_CMD_")) {
      commandName = commandName.replace("MAV_CMD_", "")
    }

    return commandName
  }

  function getAvailableCommands() {
    var commandsList = COPTER_MISSION_ITEM_COMMANDS_LIST
    if (aircraftType === 1) {
      commandsList = PLANE_MISSION_ITEM_COMMANDS_LIST
    }

    const mappedList = Object.entries(commandsList).map(([key, value]) => ({
      value: key,
      label: getDisplayCommandName(value),
    }))
    const sorted = mappedList.sort((a, b) => (a.label < b.label ? -1 : 1))
    return sorted
  }

  function getCommonlyUsedCommands() {
    const commands = getAvailableCommands()
    const filteredCommands = commands.filter((a) =>
      COMMONLY_USED_MISSION_TABLE_LABELS.includes(a.label),
    )
    return filteredCommands.map((a) => ({
      value: a.value + commonlyUsedTag,
      label: a.label,
    }))
  }

  function getCommonlyUsedIds() {
    const commands = getCommonlyUsedCommands()
    return commands.map((a) => a.value)
  }

  function updateMissionItemData(key, newVal) {
    dispatch(
      updateDrawingItem({
        ...missionItem,
        [key]: newVal,
      }),
    )
  }

  return (
    <TableTr>
      <TableTd>{missionItem.seq}</TableTd>
      <TableTd>
        <Select
          data={[
            { group: "Commonly Used", items: getCommonlyUsedCommands() },
            { group: "All commands", items: getAvailableCommands() },
          ]}
          value={
            getCommonlyUsedIds().includes(
              missionItem.command.toString() + commonlyUsedTag,
            )
              ? missionItem.command.toString() + commonlyUsedTag
              : missionItem.command.toString()
          }
          onChange={(value) =>
            updateMissionItemData(
              "command",
              parseInt(value.replace(commonlyUsedTag, "")),
            )
          }
          allowDeselect={false}
          classNames={{ dropdown: "!min-w-fit" }}
          comboboxProps={{ position: "top-start" }}
          searchable
        />
      </TableTd>
      <TableTd>
        <NumberInput
          value={missionItem.param1}
          onChange={(val) => {
            const numericValue = parseNumericInput(val)
            if (numericValue === null) return
            updateMissionItemData("param1", numericValue)
          }}
          hideControls
        />
      </TableTd>
      <TableTd>
        <NumberInput
          value={missionItem.param2}
          onChange={(val) => {
            const numericValue = parseNumericInput(val)
            if (numericValue === null) return
            updateMissionItemData("param2", numericValue)
          }}
          hideControls
        />
      </TableTd>
      <TableTd>
        <NumberInput
          value={missionItem.param3}
          onChange={(val) => {
            const numericValue = parseNumericInput(val)
            if (numericValue === null) return
            updateMissionItemData("param3", numericValue)
          }}
          hideControls
        />
      </TableTd>
      <TableTd>
        <NumberInput
          value={missionItem.param4}
          onChange={(val) => {
            const numericValue = parseNumericInput(val)
            updateMissionItemData("param4", numericValue)
          }}
          hideControls
        />
      </TableTd>
      <TableTd>
        <NumberInput
          value={intToCoord(missionItem.x).toFixed(coordsFractionDigits)}
          onChange={(val) => {
            const numericValue = parseCoordinateInput(val)
            updateMissionItemData("x", coordToInt(numericValue))
          }}
          hideControls
        />
      </TableTd>
      <TableTd>
        <NumberInput
          value={intToCoord(missionItem.y).toFixed(coordsFractionDigits)}
          onChange={(val) => {
            const numericValue = parseCoordinateInput(val)
            updateMissionItemData("y", coordToInt(numericValue))
          }}
          hideControls
        />
      </TableTd>
      <TableTd>
        <NumberInput
          value={missionItem.z}
          onChange={(val) => {
            const numericValue = parseCoordinateInput(val)
            if (numericValue === null) return
            updateMissionItemData("z", numericValue)
          }}
          hideControls
        />
      </TableTd>
      <TableTd>{formatMetric(rowMetrics?.distanceMeters, "m")}</TableTd>
      <TableTd>{formatMetric(rowMetrics?.gradientPercent, "%")}</TableTd>
      <TableTd>
        <Select
          data={MAV_FRAME_DROPDOWN_DATA}
          value={missionItem.frame.toString()}
          onChange={(value) => {
            if (value === null) {
              return
            }
            const parsedFrame = parseInt(value)
            if (Number.isNaN(parsedFrame)) {
              return
            }
            updateMissionItemData("frame", parsedFrame)
          }}
          allowDeselect={false}
          classNames={{ dropdown: "!min-w-fit" }}
          comboboxProps={{ position: "top-start" }}
        />
      </TableTd>
      <TableTd className="h-full">
        <div className="flex flex-row gap-2">
          <ActionIcon
            onClick={() =>
              dispatch(
                reorderDrawingItem({ id: missionItem.id, increment: -1 }),
              )
            }
          >
            <IconArrowUp size={20} />
          </ActionIcon>
          <ActionIcon
            onClick={() =>
              dispatch(reorderDrawingItem({ id: missionItem.id, increment: 1 }))
            }
          >
            <IconArrowDown size={20} />
          </ActionIcon>
          <ActionIcon
            onClick={() => dispatch(removeDrawingItem(missionItem.id))}
            color="red"
          >
            <IconTrash size={20} />
          </ActionIcon>
        </div>
      </TableTd>
    </TableTr>
  )
}
