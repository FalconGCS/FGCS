/*
  This component displays the row for a fence item in a table.
*/

import {
  ActionIcon,
  NumberInput,
  Select,
  TableTd,
  TableTr,
} from "@mantine/core"
import { IconArrowDown, IconArrowUp, IconTrash } from "@tabler/icons-react"
import { useDispatch, useSelector } from "react-redux"
import { coordToInt, intToCoord } from "../../helpers/dataFormatters"
import {
  FENCE_ITEM_COMMANDS_LIST,
  MAV_FRAME_DROPDOWN_DATA,
} from "../../helpers/mavlinkConstants"
import {
  removeDrawingItem,
  reorderDrawingItem,
  selectDrawingFenceItemByIdx,
  updateDrawingItem,
} from "../../redux/slices/missionSlice"

const coordsFractionDigits = 9

function getDisplayCommandName(commandName) {
  if (commandName.startsWith("MAV_CMD_NAV_")) {
    commandName = commandName.replace("MAV_CMD_NAV_", "")
  } else if (commandName.startsWith("MAV_CMD_")) {
    commandName = commandName.replace("MAV_CMD_", "")
  }

  return commandName
}

function getAvailableCommands() {
  var commandsList = FENCE_ITEM_COMMANDS_LIST

  return Object.entries(commandsList).map(([key, value]) => ({
    value: key,
    label: getDisplayCommandName(value),
  }))
}

function parseNumericInput(value) {
  if (value === null || value === undefined || value === "") {
    return null
  }

  const numericValue = typeof value === "number" ? value : Number(value)
  return Number.isFinite(numericValue) ? numericValue : null
}

export default function FenceItemsTableRow({ fenceItemIndex }) {
  const dispatch = useDispatch()
  const fenceItem = useSelector(selectDrawingFenceItemByIdx(fenceItemIndex))

  function updateFenceItemData(key, newVal) {
    dispatch(
      updateDrawingItem({
        ...fenceItem,
        [key]: newVal,
      }),
    )
  }

  return (
    <TableTr>
      <TableTd>{fenceItem.seq}</TableTd>
      <TableTd>
        <Select
          data={getAvailableCommands()}
          value={fenceItem.command.toString()}
          onChange={(value) => updateFenceItemData("command", parseInt(value))}
          allowDeselect={false}
          classNames={{ dropdown: "!min-w-fit" }}
          comboboxProps={{ position: "top-start" }}
        />
      </TableTd>
      <TableTd>
        <NumberInput
          value={fenceItem.param1}
          onChange={(val) => {
            const numericValue = parseNumericInput(val)
            if (numericValue === null) return
            updateFenceItemData("param1", numericValue)
          }}
          hideControls
        />
      </TableTd>
      <TableTd>
        <NumberInput value={fenceItem.param2} hideControls disabled />
      </TableTd>
      <TableTd>
        <NumberInput value={fenceItem.param3} hideControls disabled />
      </TableTd>
      <TableTd>
        <NumberInput value={fenceItem.param4} hideControls disabled />
      </TableTd>
      <TableTd>
        <NumberInput
          value={intToCoord(fenceItem.x).toFixed(coordsFractionDigits)}
          onChange={(val) => {
            const numericValue = parseNumericInput(val)
            if (numericValue === null) return
            updateFenceItemData("x", coordToInt(numericValue))
          }}
          hideControls
        />
      </TableTd>
      <TableTd>
        <NumberInput
          value={intToCoord(fenceItem.y).toFixed(coordsFractionDigits)}
          onChange={(val) => {
            const numericValue = parseNumericInput(val)
            if (numericValue === null) return
            updateFenceItemData("y", coordToInt(numericValue))
          }}
          hideControls
        />
      </TableTd>
      <TableTd>
        <NumberInput
          value={fenceItem.z}
          onChange={(val) => {
            const numericValue = parseNumericInput(val)
            if (numericValue === null) return
            updateFenceItemData("z", numericValue)
          }}
          hideControls
        />
      </TableTd>
      <TableTd>
        <Select
          data={MAV_FRAME_DROPDOWN_DATA}
          value={fenceItem.frame.toString()}
          onChange={(value) => {
            if (value === null) {
              return
            }
            const parsedFrame = parseInt(value)
            if (Number.isNaN(parsedFrame)) {
              return
            }
            updateFenceItemData("frame", parsedFrame)
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
              dispatch(reorderDrawingItem({ id: fenceItem.id, increment: -1 }))
            }
          >
            <IconArrowUp size={20} />
          </ActionIcon>
          <ActionIcon
            onClick={() =>
              dispatch(reorderDrawingItem({ id: fenceItem.id, increment: 1 }))
            }
          >
            <IconArrowDown size={20} />
          </ActionIcon>
          <ActionIcon
            onClick={() => dispatch(removeDrawingItem(fenceItem.id))}
            color="red"
          >
            <IconTrash size={20} />
          </ActionIcon>
        </div>
      </TableTd>
    </TableTr>
  )
}
