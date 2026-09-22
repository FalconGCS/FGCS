// Calculates the ordered list of points the aircraft passes through during a mission

import { distance } from "@turf/turf"
import { intToCoord } from "./dataFormatters"
import { filterMissionItems, isGlobalFrameHomeCommand } from "./filterMissions"
import { getLoiterDistanceMeters } from "./loiterCommands"
import {
  COPTER_MISSION_ITEM_COMMANDS_LIST,
  MAV_FRAME_LIST,
  PLANE_MISSION_ITEM_COMMANDS_LIST,
} from "./mavlinkConstants"

const MAV_CMD_DO_JUMP = 177

function getCommandName(command, aircraftType) {
  const primaryMap =
    aircraftType === 1
      ? PLANE_MISSION_ITEM_COMMANDS_LIST
      : COPTER_MISSION_ITEM_COMMANDS_LIST
  const secondaryMap =
    aircraftType === 1
      ? COPTER_MISSION_ITEM_COMMANDS_LIST
      : PLANE_MISSION_ITEM_COMMANDS_LIST

  return primaryMap[command] || secondaryMap[command] || ""
}

function isNavCommand(command, aircraftType) {
  const commandName = getCommandName(command, aircraftType)
  return commandName.startsWith("MAV_CMD_NAV_")
}

function toFiniteNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function buildHomePoint(homePosition, missionItems) {
  const homeLat = toFiniteNumber(homePosition?.lat)
  const homeLon = toFiniteNumber(homePosition?.lon)
  const homeAltitude = toFiniteNumber(homePosition?.alt)

  // 0,0 is the "no home set yet" placeholder, so fall back to the mission's
  // own home item when there is one
  if (homeLat !== null && homeLon !== null && homeLat !== 0 && homeLon !== 0) {
    return {
      seq: 0,
      altitude: homeAltitude === null ? 0 : homeAltitude,
      lat: intToCoord(homeLat),
      lon: intToCoord(homeLon),
      label: "Home",
      isHome: true,
    }
  }

  const firstItem = Array.isArray(missionItems) ? missionItems[0] : null
  if (firstItem && isGlobalFrameHomeCommand(firstItem)) {
    return {
      seq: 0,
      altitude: toFiniteNumber(firstItem.z) ?? 0,
      lat: intToCoord(firstItem.x),
      lon: intToCoord(firstItem.y),
      label: "Home",
      isHome: true,
    }
  }

  return null
}

function resolveAltitudeByFrame(waypoint, homeAltitude, warnings) {
  const rawAltitude = toFiniteNumber(waypoint?.z)
  if (rawAltitude === null) return null

  const frameId = Number(waypoint?.frame)
  const frameName = MAV_FRAME_LIST[frameId] || ""
  const hasHomeAltitude = Number.isFinite(homeAltitude)

  if (frameName === "GLOBAL" || frameName === "GLOBAL_INT") {
    return rawAltitude
  }

  if (
    frameName === "GLOBAL_RELATIVE_ALT" ||
    frameName === "GLOBAL_RELATIVE_ALT_INT"
  ) {
    if (!hasHomeAltitude) {
      warnings.push(
        `Waypoint ${waypoint.seq} uses relative altitude but home altitude is unavailable. Using raw waypoint altitude.`,
      )
      return rawAltitude
    }

    return homeAltitude + rawAltitude
  }

  if (
    frameName === "GLOBAL_TERRAIN_ALT" ||
    frameName === "GLOBAL_TERRAIN_ALT_INT"
  ) {
    // TODO: Use terrain elevation model/source instead of approximating via home altitude.
    if (!hasHomeAltitude) {
      warnings.push(
        `Waypoint ${waypoint.seq} uses terrain altitude but home altitude is unavailable. Using raw waypoint altitude.`,
      )
      return rawAltitude
    }

    return homeAltitude + rawAltitude
  }

  return rawAltitude
}

// Return the points in the order the aircraft flies them, with the distance
// flown up to each one. The first point is always the home position
export function buildMissionTraversal(
  missionItems,
  aircraftType,
  homePosition,
) {
  const homePoint = buildHomePoint(homePosition, missionItems)
  const homeAltitude = homePoint ? homePoint.altitude : null

  if (!Array.isArray(missionItems) || missionItems.length === 0) {
    return {
      points: homePoint ? [{ ...homePoint, cumulativeDistance: 0 }] : [],
      totalDistance: 0,
      warnings: [],
    }
  }

  const filteredMissionItems = filterMissionItems(missionItems)
  const filteredBySeq = new Map(
    filteredMissionItems.map((item) => [item.seq, item]),
  )

  const sortedMissionItems = [...missionItems].sort((a, b) => a.seq - b.seq)
  const seqToIndex = new Map(
    sortedMissionItems.map((item, idx) => [item.seq, idx]),
  )

  const warnings = []
  const traversalPoints = []
  const finiteJumpExecutions = new Map()
  const handledInfiniteJumps = new Set()

  let pointer = 0
  let steps = 0
  const maxSteps = Math.max(2000, sortedMissionItems.length * 200)

  while (
    pointer >= 0 &&
    pointer < sortedMissionItems.length &&
    steps < maxSteps
  ) {
    steps += 1
    const currentItem = sortedMissionItems[pointer]

    if (!currentItem) {
      pointer += 1
      continue
    }

    if (currentItem.command === MAV_CMD_DO_JUMP) {
      const jumpToSeq = toFiniteNumber(currentItem.param1)
      const jumpCount = toFiniteNumber(currentItem.param2)
      const jumpTargetIndex =
        jumpToSeq !== null ? seqToIndex.get(jumpToSeq) : undefined

      if (
        jumpTargetIndex !== undefined &&
        jumpTargetIndex !== pointer &&
        jumpTargetIndex >= 0
      ) {
        if (jumpCount === -1) {
          if (!handledInfiniteJumps.has(currentItem.seq)) {
            handledInfiniteJumps.add(currentItem.seq)
            warnings.push(
              `DO_JUMP at waypoint ${currentItem.seq} is infinite. Graph includes one repeated pass only.`,
            )
            pointer = jumpTargetIndex
            continue
          }
        } else if (jumpCount !== null && jumpCount > 0) {
          // The autopilot's repeat counter is per mission item and is not reset
          // by an enclosing loop, so neither is this one
          const executions = finiteJumpExecutions.get(currentItem.seq) || 0
          if (executions < jumpCount) {
            finiteJumpExecutions.set(currentItem.seq, executions + 1)
            pointer = jumpTargetIndex
            continue
          }
        }
      }

      pointer += 1
      continue
    }

    const waypoint = filteredBySeq.get(currentItem.seq)
    if (waypoint && isNavCommand(waypoint.command, aircraftType)) {
      const altitude = resolveAltitudeByFrame(waypoint, homeAltitude, warnings)
      if (altitude !== null) {
        traversalPoints.push({
          seq: waypoint.seq,
          altitude,
          lat: intToCoord(waypoint.x),
          lon: intToCoord(waypoint.y),
          // Circling at a loiter is flown on top of the legs either side of it
          loiterDistance: getLoiterDistanceMeters(waypoint),
        })
      }
    }

    pointer += 1
  }

  if (steps >= maxSteps) {
    warnings.push(
      "Mission expansion reached safety limit. Graph may be truncated.",
    )
  }

  const pointsWithHome = homePoint
    ? [{ ...homePoint, loiterDistance: 0 }, ...traversalPoints]
    : traversalPoints

  const points = []
  let cumulativeDistance = 0
  let previousPoint = null

  for (const point of pointsWithHome) {
    if (previousPoint) {
      cumulativeDistance += distance(
        [previousPoint.lon, previousPoint.lat],
        [point.lon, point.lat],
        { units: "meters" },
      )
    }

    const { loiterDistance, ...pointWithoutLoiter } = point
    points.push({
      ...pointWithoutLoiter,
      cumulativeDistance: Math.round(cumulativeDistance * 100) / 100,
    })

    if (loiterDistance > 0) {
      // A second point at the same place, so the circles show on the graph as
      // distance flown at a constant altitude
      cumulativeDistance += loiterDistance
      points.push({
        ...pointWithoutLoiter,
        label: "",
        isLoiterExit: true,
        cumulativeDistance: Math.round(cumulativeDistance * 100) / 100,
      })
    }

    previousPoint = point
  }

  return {
    points,
    totalDistance: Math.round(cumulativeDistance * 100) / 100,
    warnings,
  }
}

export function calculateMissionTotalDistance(
  missionItems,
  aircraftType,
  homePosition,
) {
  return buildMissionTraversal(missionItems, aircraftType, homePosition)
    .totalDistance
}
