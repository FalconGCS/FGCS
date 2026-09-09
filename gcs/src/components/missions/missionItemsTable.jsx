/*
  This table displays all the mission items.
*/

import { Table } from "@mantine/core"
import React, { useMemo } from "react"
import { isGlobalFrameHomeCommand } from "../../helpers/filterMissions"
import { buildMissionWaypointLegMetrics } from "../../helpers/missionWaypointMetrics"
import MissionItemsTableRow from "./missionItemsTableRow"

// Redux
import { useSelector } from "react-redux"
import {
  selectDrawingMissionItems,
  selectPlannedHomePosition,
} from "../../redux/slices/missionSlice"

function MissionItemsTableNonMemo({ tableSectionHeight }) {
  const missionItems = useSelector(selectDrawingMissionItems)
  const plannedHomePosition = useSelector(selectPlannedHomePosition)

  const rowMetricsByIdx = useMemo(
    () => buildMissionWaypointLegMetrics(missionItems, plannedHomePosition),
    [missionItems, plannedHomePosition],
  )

  return (
    <Table.ScrollContainer maxHeight={tableSectionHeight}>
      <Table striped withColumnBorders stickyHeader>
        <Table.Thead>
          <Table.Tr>
            <Table.Th></Table.Th>
            <Table.Th>Command</Table.Th>
            <Table.Th>Param 1</Table.Th>
            <Table.Th>Param 2</Table.Th>
            <Table.Th>Param 3</Table.Th>
            <Table.Th>Param 4</Table.Th>
            <Table.Th>Lat</Table.Th>
            <Table.Th>Lng</Table.Th>
            <Table.Th>Alt</Table.Th>
            <Table.Th>Distance</Table.Th>
            <Table.Th>Gradient</Table.Th>
            <Table.Th>Frame</Table.Th>
            <Table.Th></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {missionItems.map((missionItem, idx) => {
            if (idx === 0 && isGlobalFrameHomeCommand(missionItem)) {
              return null
            }

            return (
              <MissionItemsTableRow
                key={missionItem.id}
                missionItemIndex={idx}
                rowMetrics={rowMetricsByIdx[idx]}
              />
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

const MissionItemsTable = React.memo(MissionItemsTableNonMemo, propsAreEqual)

export default MissionItemsTable
