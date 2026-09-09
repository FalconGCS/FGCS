import { distance } from "@turf/turf"
import { intToCoord } from "./dataFormatters"
import { filterMissionItems } from "./filterMissions"
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

function buildHomePoint(homePosition) {
  if (!homePosition || typeof homePosition !== "object") return null

  const homeLat = toFiniteNumber(homePosition.lat)
  const homeLon = toFiniteNumber(homePosition.lon)
  const homeAltitude = toFiniteNumber(homePosition.alt)

  if (homeLat === null || homeLon === null || homeAltitude === null) {
    return null
  }

  return {
    seq: 0,
    altitude: homeAltitude,
    lat: intToCoord(homeLat),
    lon: intToCoord(homeLon),
    label: "Home",
    isHome: true,
  }
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

export function buildMissionElevationProfile(
  missionItems,
  aircraftType,
  homePosition,
) {
  const homePoint = buildHomePoint(homePosition)
  const homeAltitude = toFiniteNumber(homePosition?.alt)

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
    ? [homePoint, ...traversalPoints]
    : traversalPoints

  let cumulativeDistance = 0
  const points = pointsWithHome.map((point, idx) => {
    if (idx > 0) {
      const prev = pointsWithHome[idx - 1]
      cumulativeDistance += distance(
        [prev.lon, prev.lat],
        [point.lon, point.lat],
        {
          units: "meters",
        },
      )
    }

    return {
      ...point,
      cumulativeDistance: Math.round(cumulativeDistance * 100) / 100,
    }
  })

  return {
    points,
    totalDistance: Math.round(cumulativeDistance * 100) / 100,
    warnings,
  }
}
