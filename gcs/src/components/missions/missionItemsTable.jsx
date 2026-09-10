/*
  This table displays all the mission items.
*/

import { Table, Tooltip } from "@mantine/core"
import React, { useMemo } from "react"
import { isGlobalFrameHomeCommand } from "../../helpers/filterMissions"
import { getMissionCommandParamTooltip } from "../../helpers/missionCommandParams"
import { buildMissionWaypointLegMetrics } from "../../helpers/missionWaypointMetrics"
import MissionItemsTableRow from "./missionItemsTableRow"

// Redux
import { useSelector } from "react-redux"
import {
  selectDrawingMissionItems,
  selectPlannedHomePosition,
  selectSelectedMissionItemId,
} from "../../redux/slices/missionSlice"

function ParamColumnHeader({ command, paramIndex }) {
  const fallback = `Param ${paramIndex}`
  const tooltip =
    command === null ? null : getMissionCommandParamTooltip(command, paramIndex)
  const title = tooltip?.title ?? fallback

  return (
    <Table.Th>
      <Tooltip
        disabled={!tooltip}
        label={
          tooltip && (
            <div>
              <p className="font-bold">{tooltip.title}</p>
              {tooltip.description && <p>{tooltip.description}</p>}
            </div>
          )
        }
        multiline
        w={280}
        openDelay={400}
        position="bottom"
        withArrow
      >
        <div className="relative w-full">
          <span className="invisible">{fallback}</span>
          <span className="absolute inset-0 truncate">{title}</span>
        </div>
      </Tooltip>
    </Table.Th>
  )
}

function MissionItemsTableNonMemo({ tableSectionHeight }) {
  const missionItems = useSelector(selectDrawingMissionItems)
  const plannedHomePosition = useSelector(selectPlannedHomePosition)
  const selectedMissionItemId = useSelector(selectSelectedMissionItemId)

  const rowMetricsByIdx = useMemo(
    () => buildMissionWaypointLegMetrics(missionItems, plannedHomePosition),
    [missionItems, plannedHomePosition],
  )

  const selectedCommand =
    missionItems.find((missionItem) => missionItem.id === selectedMissionItemId)
      ?.command ?? null

  return (
    <Table.ScrollContainer maxHeight={tableSectionHeight}>
      <Table withColumnBorders stickyHeader>
        <Table.Thead>
          <Table.Tr>
            <Table.Th></Table.Th>
            <Table.Th>Command</Table.Th>
            {[1, 2, 3, 4].map((paramIndex) => (
              <ParamColumnHeader
                key={paramIndex}
                command={selectedCommand}
                paramIndex={paramIndex}
              />
            ))}
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
