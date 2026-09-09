import { distance } from "@turf/turf"
import { intToCoord } from "./dataFormatters"
import { isGlobalFrameHomeCommand } from "./filterMissions"

const STOP_COMMANDS = [20, 21, 189]
const RTL_COMMAND = 20

function toFiniteNumber(value) {
  const parsedValue = Number(value)
  return Number.isFinite(parsedValue) ? parsedValue : null
}

function buildHomeWaypoint(homePosition) {
  const homeLat = toFiniteNumber(homePosition?.lat)
  const homeLon = toFiniteNumber(homePosition?.lon)

  if (homeLat === null || homeLon === null) {
    return null
  }

  // TODO: Allow home waypoint altitude to be used for absolute altitude
  // calculations in the future.
  return {
    isHome: true,
    seq: "Home",
    x: homeLat,
    y: homeLon,
    z: 0,
    lat: intToCoord(homeLat),
    lon: intToCoord(homeLon),
    altitude: 0,
  }
}

function buildResolvedWaypoint(missionItem) {
  const x = toFiniteNumber(missionItem?.x)
  const y = toFiniteNumber(missionItem?.y)
  const z = toFiniteNumber(missionItem?.z)

  const hasPosition = x !== null && y !== null && x !== 0 && y !== 0

  return {
    seq: missionItem?.seq,
    isHome: false,
    x,
    y,
    z,
    lat: hasPosition ? intToCoord(x) : null,
    lon: hasPosition ? intToCoord(y) : null,
    altitude: hasPosition ? z : null,
  }
}

function getDisplayPointLabel(point) {
  if (!point) {
    return null
  }

  return point.isHome ? "Home" : point.seq
}

export function buildMissionWaypointLegMetrics(missionItems, homePosition) {
  if (!Array.isArray(missionItems) || missionItems.length === 0) {
    return []
  }

  const metricsByIndex = []
  const homeWaypoint = buildHomeWaypoint(homePosition)
  const stopCommandItem = [...missionItems]
    .filter((item) => STOP_COMMANDS.includes(item.command))
    .sort((a, b) => a.seq - b.seq)
    .at(0)

  let previousWaypoint = homeWaypoint
  let previousAltitude = homeWaypoint ? homeWaypoint.altitude : null

  for (let idx = 0; idx < missionItems.length; idx++) {
    const missionItem = missionItems[idx]

    if (stopCommandItem && missionItem.seq > stopCommandItem.seq) {
      continue
    }

    if (idx === 0 && isGlobalFrameHomeCommand(missionItem)) {
      continue
    }

    const resolvedWaypoint = buildResolvedWaypoint(missionItem)
    const isRtlCommand = missionItem.command === RTL_COMMAND
    const currentWaypoint =
      isRtlCommand && homeWaypoint
        ? homeWaypoint
        : resolvedWaypoint.lat !== null && resolvedWaypoint.lon !== null
          ? resolvedWaypoint
          : previousWaypoint
    const currentAltitude =
      isRtlCommand && homeWaypoint
        ? homeWaypoint.altitude
        : resolvedWaypoint.altitude !== null
          ? resolvedWaypoint.altitude
          : previousAltitude

    let distanceMeters = null
    let gradientPercent = null

    if (
      previousWaypoint?.lat !== null &&
      previousWaypoint?.lon !== null &&
      currentWaypoint?.lat !== null &&
      currentWaypoint?.lon !== null
    ) {
      distanceMeters = distance(
        [previousWaypoint.lon, previousWaypoint.lat],
        [currentWaypoint.lon, currentWaypoint.lat],
        { units: "meters" },
      )
    }

    if (
      previousWaypoint?.lat !== null &&
      previousWaypoint?.lon !== null &&
      previousAltitude !== null &&
      currentAltitude !== null
    ) {
      const horizontalDistanceMeters =
        distanceMeters ??
        distance(
          [previousWaypoint.lon, previousWaypoint.lat],
          [currentWaypoint.lon, currentWaypoint.lat],
          { units: "meters" },
        )

      if (horizontalDistanceMeters > 0) {
        gradientPercent =
          ((currentAltitude - previousAltitude) / horizontalDistanceMeters) *
          100
      }
    }

    metricsByIndex[idx] = {
      currentWaypoint,
      previousWaypoint,
      distanceMeters,
      gradientPercent,
      previousWaypointLabel: getDisplayPointLabel(previousWaypoint),
      currentWaypointLabel: getDisplayPointLabel(currentWaypoint),
    }

    if (resolvedWaypoint.lat !== null && resolvedWaypoint.lon !== null) {
      previousWaypoint = resolvedWaypoint
    }

    if (resolvedWaypoint.altitude !== null) {
      previousAltitude = resolvedWaypoint.altitude
    }
  }

  return metricsByIndex
}
