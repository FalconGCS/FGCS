/*
  The MissionStatistics component calculates and displays various statistics
  about the mission on the missions screen.
*/

import { Tooltip } from "@mantine/core"
import { distance } from "@turf/turf"
import { useEffect, useState } from "react"
import { intToCoord } from "../../helpers/dataFormatters"
import {
  filterMissionItems,
  isGlobalFrameHomeCommand,
} from "../../helpers/filterMissions"
import { buildMissionWaypointLegMetrics } from "../../helpers/missionWaypointMetrics"

// Redux
import { useSelector } from "react-redux"
import {
  selectDrawingMissionItems,
  selectPlannedHomePosition,
} from "../../redux/slices/missionSlice"

function calculateMaxAltitude(missionItems) {
  missionItems = missionItems.filter(
    (item) => isGlobalFrameHomeCommand(item) === false,
  )

  return Math.max(...missionItems.map((item) => item.z || 0), 0)
}

function calculateMaxDistanceBetweenWaypoints(missionItems, homePosition) {
  const legMetrics = buildMissionWaypointLegMetrics(missionItems, homePosition)
  let maxLeg = null

  for (const leg of legMetrics) {
    if (!leg || leg.distanceMeters === null) {
      continue
    }

    if (maxLeg === null || leg.distanceMeters > maxLeg.distanceMeters) {
      maxLeg = leg
    }
  }

  return {
    maxDistance: maxLeg ? Math.round(maxLeg.distanceMeters * 100) / 100 : 0,
    points: maxLeg ? [maxLeg.previousWaypoint, maxLeg.currentWaypoint] : [],
  }
}

function calculateMaxSlopeGradient(missionItems, homePosition) {
  const legMetrics = buildMissionWaypointLegMetrics(missionItems, homePosition)
  let maxLeg = null

  for (const leg of legMetrics) {
    if (!leg || leg.gradientPercent === null) {
      continue
    }

    if (
      maxLeg === null ||
      Math.abs(leg.gradientPercent) > Math.abs(maxLeg.gradientPercent)
    ) {
      maxLeg = leg
    }
  }

  return {
    maxGradient: maxLeg
      ? Math.round(Math.abs(maxLeg.gradientPercent) * 100) / 100
      : 0,
    points: maxLeg ? [maxLeg.previousWaypoint, maxLeg.currentWaypoint] : [],
  }
}

function calculateTotalDistance(missionItems, homePosition) {
  // This function should calculate the total distance of the waypoints,
  // ignoring any waypoints without coordinates. If the jump command (177) is present,
  // then the distance for all of the jump waypoints for the number of laps should
  // be calculated as well.
  let totalDistance = 0
  let lastPoint = null

  // Swap the coords of the first position with the home position if it exists
  if (
    missionItems.length > 1 &&
    isGlobalFrameHomeCommand(missionItems[0]) &&
    homePosition &&
    missionItems[1].command === 22
  ) {
    const newFirstPoint = {
      ...missionItems[1],
      x: homePosition.lat,
      y: homePosition.lon,
      z: homePosition.alt,
    }
    missionItems = [newFirstPoint, ...missionItems.slice(1)]
  }

  for (let i = 0; i < missionItems.length; i++) {
    const item = missionItems[i]

    if (item.command === 177) {
      const jumpTo = item.param1
      const jumpCount = item.param2

      // Find the waypoint with the seq value equal to jumpTo
      const jumpWaypoint = missionItems.find((wp) => wp.seq === jumpTo)

      if (jumpWaypoint) {
        // Calculate the distance from the jumpWaypoint to the current waypoint
        // times the number of jumps
        if (lastPoint) {
          totalDistance +=
            distance(
              [intToCoord(lastPoint.y), intToCoord(lastPoint.x)],
              [intToCoord(jumpWaypoint.y), intToCoord(jumpWaypoint.x)],
              { units: "meters" },
            ) * jumpCount
        }

        for (let j = 0; j < jumpCount; j++) {
          // Slice the missionItems list between the actual array index of jumpWaypoint and i
          const jumpStartIdx = missionItems.findIndex((wp) => wp.seq === jumpTo)
          const jumpItems = missionItems.slice(jumpStartIdx, i)
          totalDistance += calculateTotalDistance(jumpItems)
        }
      }
    }

    if (item.x === 0 || item.y === 0) continue // Skip waypoints without coordinates

    if (lastPoint) {
      totalDistance += distance(
        [intToCoord(lastPoint.y), intToCoord(lastPoint.x)],
        [intToCoord(item.y), intToCoord(item.x)],
        { units: "meters" },
      )
    }
    lastPoint = item
  }

  return Math.round(totalDistance * 100) / 100
}

function calculateMaxTelemDistance(missionItems, homePosition) {
  // Calculate the max distance from the home position
  if (missionItems.length === 0 || !homePosition)
    return { maxDistance: 0, point: null }

  let maxDistance = 0
  let maxDistancePoint = null

  // Remove any waypoints without coordinates and the home location
  missionItems = missionItems.filter(
    (item) => (item.x !== 0 && item.y !== 0) || isGlobalFrameHomeCommand(item),
  )

  for (const item of missionItems) {
    const distanceFromHome = distance(
      [intToCoord(homePosition.lon), intToCoord(homePosition.lat)],
      [intToCoord(item.y), intToCoord(item.x)],
      { units: "meters" },
    )

    if (distanceFromHome > maxDistance) {
      maxDistance = distanceFromHome
      maxDistancePoint = item
    }
  }

  maxDistance = Math.round(maxDistance * 100) / 100 // Round to two decimal places
  return { maxDistance: maxDistance, point: maxDistancePoint }
}

function StatisticItem({ label, value, units, tooltip = null }) {
  const displayString = `${label}: ${value}${units || ""}`
  return (
    <>
      {tooltip ? (
        <Tooltip label={tooltip}>
          <p>{displayString}</p>
        </Tooltip>
      ) : (
        <p>{displayString}</p>
      )}
    </>
  )
}

export default function MissionStatistics() {
  const missionItems = useSelector(selectDrawingMissionItems)
  const plannedHomePosition = useSelector(selectPlannedHomePosition)

  const [filteredMissionItems, setFilteredMissionItems] = useState([])
  const [totalDistance, setTotalDistance] = useState(0)
  const [maxDistanceBetweenWaypoints, setMaxDistanceBetweenWaypoints] =
    useState({ maxDistance: 0, points: null })
  const [maxAltitude, setMaxAltitude] = useState(0)
  const [maxSlopeGradient, setMaxSlopeGradient] = useState({
    maxGradient: 0,
    points: null,
  })
  const [maxTelemDistance, setMaxTelemDistance] = useState({
    maxDistance: 0,
    point: null,
  })

  useEffect(() => {
    setFilteredMissionItems(filterMissionItems(missionItems))
  }, [missionItems])

  useEffect(() => {
    if (filteredMissionItems.length === 0) {
      setTotalDistance(0)
      setMaxAltitude(0)
      setMaxDistanceBetweenWaypoints({ maxDistance: 0, points: null })
      setMaxSlopeGradient({ maxGradient: 0, points: null })
      setMaxTelemDistance({ maxDistance: 0, point: null })
      return
    }

    // Use unfiltered mission items
    setTotalDistance(calculateTotalDistance(missionItems, plannedHomePosition))
    setMaxAltitude(calculateMaxAltitude(filteredMissionItems))
    setMaxDistanceBetweenWaypoints(
      calculateMaxDistanceBetweenWaypoints(missionItems, plannedHomePosition),
    )
    setMaxSlopeGradient(
      calculateMaxSlopeGradient(missionItems, plannedHomePosition),
    )
    setMaxTelemDistance(
      calculateMaxTelemDistance(filteredMissionItems, plannedHomePosition),
    )
  }, [filteredMissionItems, plannedHomePosition])

  return (
    <>
      <StatisticItem label="Total distance" value={totalDistance} units="m" />
      <StatisticItem
        label="Max distance between waypoints"
        value={maxDistanceBetweenWaypoints.maxDistance}
        tooltip={
          maxDistanceBetweenWaypoints?.points?.length > 1 &&
          `Between ${maxDistanceBetweenWaypoints.points[0]?.seq} and ${maxDistanceBetweenWaypoints.points[1]?.seq}`
        }
        units="m"
      />
      <StatisticItem label="Max altitude" value={maxAltitude} units="m" />
      <StatisticItem
        label="Max slope gradient"
        value={maxSlopeGradient.maxGradient}
        tooltip={
          maxSlopeGradient?.points?.length > 1 &&
          `Between ${maxSlopeGradient.points[0]?.seq} and ${maxSlopeGradient.points[1]?.seq}`
        }
        units="%"
      />
      <StatisticItem
        label="Max telem distance"
        value={maxTelemDistance.maxDistance}
        tooltip={
          maxTelemDistance.point && `At waypoint ${maxTelemDistance.point.seq}`
        }
        units="m"
      />
    </>
  )
}
