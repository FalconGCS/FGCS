/*
  This table displays all the rally items.
*/
import { Table, Tooltip } from "@mantine/core"
import React from "react"
import { useSelector } from "react-redux"
import { selectDrawingRallyItems } from "../../redux/slices/missionSlice"
import RallyItemsTableRow from "./rallyItemsTableRow"

function RallyItemsTableNonMemo({ tableSectionHeight }) {
  const rallyItems = useSelector(selectDrawingRallyItems)
  const notInUse = "This param is not used in Rally."

  return (
    <Table.ScrollContainer maxHeight={tableSectionHeight}>
      <Table withColumnBorders stickyHeader>
        <Table.Thead>
          <Table.Tr>
            <Table.Th></Table.Th>
            <Tooltip label="RALLY_POINT is the only command available.">
              <Table.Th>Command</Table.Th>
            </Tooltip>
            <Tooltip label={notInUse}>
              <Table.Th></Table.Th>
            </Tooltip>
            <Tooltip label={notInUse}>
              <Table.Th></Table.Th>
            </Tooltip>
            <Tooltip label={notInUse}>
              <Table.Th></Table.Th>
            </Tooltip>
            <Tooltip label={notInUse}>
              <Table.Th></Table.Th>
            </Tooltip>
            <Table.Th>Lat</Table.Th>
            <Table.Th>Lng</Table.Th>
            <Table.Th>Alt</Table.Th>
            <Table.Th>Frame</Table.Th>
            <Table.Th></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rallyItems.map((rallyItem, idx) => {
            return (
              <RallyItemsTableRow key={rallyItem.id} rallyItemIndex={idx} />
            )
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )
}

function propsAreEqual(prev, next) {
  return JSON.stringify(prev) === JSON.stringify(next)
}
const RallyItemsTable = React.memo(RallyItemsTableNonMemo, propsAreEqual)

export default RallyItemsTable
