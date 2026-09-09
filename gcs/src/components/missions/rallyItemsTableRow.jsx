/*
  This component displays the row for a rally item in a table.
*/

import {
  ActionIcon,
  NumberInput,
  Select,
  TableTd,
  TableTr,
} from "@mantine/core"
import { IconTrash } from "@tabler/icons-react"
import { useDispatch, useSelector } from "react-redux"
import { coordToInt, intToCoord } from "../../helpers/dataFormatters"
import { MAV_FRAME_DROPDOWN_DATA } from "../../helpers/mavlinkConstants"
import {
  removeDrawingItem,
  selectDrawingRallyItemByIdx,
  updateDrawingItem,
} from "../../redux/slices/missionSlice"
const coordsFractionDigits = 9

function parseNumericInput(value) {
  if (value === null || value === undefined || value === "") {
    return null
  }

  const numericValue = typeof value === "number" ? value : Number(value)
  return Number.isFinite(numericValue) ? numericValue : null
}

export default function RallyItemsTableRow({ rallyItemIndex }) {
  const dispatch = useDispatch()
  const rallyItem = useSelector(selectDrawingRallyItemByIdx(rallyItemIndex))

  function updateRallyItemData(key, newVal) {
    dispatch(
      updateDrawingItem({
        ...rallyItem,
        [key]: newVal,
      }),
    )
  }

  return (
    <TableTr>
      <TableTd>{rallyItem.seq}</TableTd>
      <TableTd>
        <Select
          data={[{ value: "5100", label: "RALLY_POINT" }]}
          value={"5100"}
          allowDeselect={false}
          disabled
        />
      </TableTd>
      <TableTd>
        <NumberInput value={rallyItem.param1} hideControls disabled />
      </TableTd>
      <TableTd>
        <NumberInput value={rallyItem.param2} hideControls disabled />
      </TableTd>
      <TableTd>
        <NumberInput value={rallyItem.param3} hideControls disabled />
      </TableTd>
      <TableTd>
        <NumberInput value={rallyItem.param4} hideControls disabled />
      </TableTd>
      <TableTd>
        <NumberInput
          value={intToCoord(rallyItem.x).toFixed(coordsFractionDigits)}
          onChange={(val) => {
            const numericValue = parseNumericInput(val)
            if (numericValue === null) return
            updateRallyItemData("x", coordToInt(numericValue))
          }}
          hideControls
        />
      </TableTd>
      <TableTd>
        <NumberInput
          value={intToCoord(rallyItem.y).toFixed(coordsFractionDigits)}
          onChange={(val) => {
            const numericValue = parseNumericInput(val)
            if (numericValue === null) return
            updateRallyItemData("y", coordToInt(numericValue))
          }}
          hideControls
        />
      </TableTd>
      <TableTd>
        <NumberInput
          value={rallyItem.z}
          onChange={(val) => {
            const numericValue = parseNumericInput(val)
            if (numericValue === null) return
            updateRallyItemData("z", numericValue)
          }}
          hideControls
        />
      </TableTd>
      <TableTd>
        <Select
          data={MAV_FRAME_DROPDOWN_DATA}
          value={rallyItem.frame.toString()}
          onChange={(value) => {
            if (value === null) {
              return
            }
            const parsedFrame = parseInt(value)
            if (Number.isNaN(parsedFrame)) {
              return
            }
            updateRallyItemData("frame", parsedFrame)
          }}
          allowDeselect={false}
          classNames={{ dropdown: "!min-w-fit" }}
          comboboxProps={{ position: "top-start" }}
        />
      </TableTd>
      <TableTd>
        <ActionIcon
          onClick={() => dispatch(removeDrawingItem(rallyItem.id))}
          color="red"
        >
          <IconTrash size={20} />
        </ActionIcon>
      </TableTd>
    </TableTr>
  )
}
