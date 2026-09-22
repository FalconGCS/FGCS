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
import { calculateMissionTotalDistance } from "../../helpers/missionTraversal"
import { buildMissionWaypointLegMetrics } from "../../helpers/missionWaypointMetrics"

// Redux
import { useSelector } from "react-redux"
import { selectAircraftType } from "../../redux/slices/droneInfoSlice"
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
  const aircraftType = useSelector(selectAircraftType)

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
    setTotalDistance(
      calculateMissionTotalDistance(
        missionItems,
        aircraftType,
        plannedHomePosition,
      ),
    )
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
  }, [filteredMissionItems, plannedHomePosition, aircraftType])

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
