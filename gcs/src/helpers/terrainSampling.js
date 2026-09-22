// Turns the mission traversal into a list of positions to look terrain up at

export const DEFAULT_TERRAIN_SPACING_M = 60
export const MAX_TERRAIN_SAMPLES = 400

function isSamePosition(a, b) {
  return a.lat === b.lat && a.lon === b.lon
}

// Sample positions along every leg, so the ground line follows the terrain
// rather than joining up the waypoints
export function buildTerrainSamplePoints(points, options = {}) {
  const {
    spacingMeters = DEFAULT_TERRAIN_SPACING_M,
    maxSamples = MAX_TERRAIN_SAMPLES,
  } = options

  if (!Array.isArray(points) || points.length === 0) return []

  const totalDistance =
    points[points.length - 1].cumulativeDistance - points[0].cumulativeDistance

  // Long missions widen the spacing instead of firing thousands of lookups
  const effectiveSpacing =
    totalDistance > 0
      ? Math.max(spacingMeters, totalDistance / maxSamples)
      : spacingMeters

  const samples = []
  let lastDistance = null

  const pushSample = (cumulativeDistance, lat, lon) => {
    // Each leg's end is the next leg's start, so skip the repeat
    if (lastDistance !== null && cumulativeDistance === lastDistance) return

    samples.push({ cumulativeDistance, lat, lon })
    lastDistance = cumulativeDistance
  }

  pushSample(points[0].cumulativeDistance, points[0].lat, points[0].lon)

  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i]
    const end = points[i + 1]
    const legDistance = end.cumulativeDistance - start.cumulativeDistance

    // A loiter adds a second point at the same place with the circling distance
    // added on. There is nothing to interpolate across, and the ground below it
    // does not change, so just carry the start position over
    if (isSamePosition(start, end)) {
      pushSample(end.cumulativeDistance, start.lat, start.lon)
      continue
    }

    const steps = Math.max(1, Math.ceil(legDistance / effectiveSpacing))

    for (let step = 1; step <= steps; step++) {
      const ratio = step / steps
      pushSample(
        start.cumulativeDistance + legDistance * ratio,
        start.lat + (end.lat - start.lat) * ratio,
        start.lon + (end.lon - start.lon) * ratio,
      )
    }
  }

  return samples
}

// Identifies a set of sample positions so the same terrain is not fetched
// twice
export function terrainRequestSignature(samples) {
  if (!Array.isArray(samples) || samples.length === 0) return ""

  return samples
    .map(
      (sample) =>
        `${sample.lat.toFixed(6)},${sample.lon.toFixed(6)}@${sample.cumulativeDistance.toFixed(1)}`,
    )
    .join(";")
}

export function attachElevations(samples, elevations) {
  return samples.map((sample, index) => {
    const elevation = elevations?.[index]
    return {
      cumulativeDistance: sample.cumulativeDistance,
      elevation: Number.isFinite(elevation) ? elevation : null,
    }
  })
}
