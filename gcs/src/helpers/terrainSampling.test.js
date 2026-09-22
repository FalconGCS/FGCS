import { describe, expect, it } from "vitest"
import {
  MAX_TERRAIN_SAMPLES,
  attachElevations,
  buildTerrainSamplePoints,
  terrainRequestSignature,
} from "./terrainSampling"

function point(cumulativeDistance, lat, lon, extra = {}) {
  return { cumulativeDistance, lat, lon, ...extra }
}

describe("buildTerrainSamplePoints", () => {
  it("samples a leg at the requested spacing, inclusive of both ends", () => {
    const samples = buildTerrainSamplePoints(
      [point(0, 0, 0), point(1000, 0.01, 0)],
      { spacingMeters: 100 },
    )

    expect(samples).toHaveLength(11)
    expect(samples[0].cumulativeDistance).toBe(0)
    expect(samples[10].cumulativeDistance).toBe(1000)
  })

  it("interpolates positions between the leg endpoints", () => {
    const samples = buildTerrainSamplePoints(
      [point(0, 10, 20), point(1000, 10.1, 20.2)],
      { spacingMeters: 500 },
    )

    expect(samples).toHaveLength(3)
    expect(samples[1].lat).toBeCloseTo(10.05, 10)
    expect(samples[1].lon).toBeCloseTo(20.1, 10)
  })

  it("keeps distances strictly increasing", () => {
    const samples = buildTerrainSamplePoints(
      [point(0, 0, 0), point(500, 0.005, 0), point(1300, 0.005, 0.01)],
      { spacingMeters: 60 },
    )

    for (let i = 1; i < samples.length; i++) {
      expect(samples[i].cumulativeDistance).toBeGreaterThan(
        samples[i - 1].cumulativeDistance,
      )
    }
  })

  it("does not interpolate across a loiter, which sits in one place", () => {
    // A loiter emits a second point at the same position with the circling
    // distance added on
    const samples = buildTerrainSamplePoints(
      [
        point(0, 53.38, -1.48),
        point(500, 53.39, -1.48),
        point(900, 53.39, -1.48, { isLoiterExit: true }),
        point(1400, 53.4, -1.48),
      ],
      { spacingMeters: 100 },
    )

    const acrossLoiter = samples.filter(
      (sample) =>
        sample.cumulativeDistance > 500 && sample.cumulativeDistance < 900,
    )
    expect(acrossLoiter).toHaveLength(0)

    const loiterExit = samples.find(
      (sample) => sample.cumulativeDistance === 900,
    )
    expect(loiterExit).toMatchObject({ lat: 53.39, lon: -1.48 })
  })

  it("widens the spacing rather than exceeding the sample cap", () => {
    const samples = buildTerrainSamplePoints(
      [point(0, 0, 0), point(200000, 1.8, 0)],
      { spacingMeters: 30 },
    )

    expect(samples.length).toBeLessThanOrEqual(MAX_TERRAIN_SAMPLES + 1)
    expect(samples.length).toBeGreaterThan(1)
  })

  it("includes a sample directly under every waypoint", () => {
    const points = [
      point(0, 0, 0),
      point(430, 0.004, 0),
      point(915, 0.004, 0.006),
    ]
    const samples = buildTerrainSamplePoints(points, { spacingMeters: 100 })
    const distances = samples.map((sample) => sample.cumulativeDistance)

    for (const original of points) {
      expect(distances).toContain(original.cumulativeDistance)
    }
  })

  it("handles empty and single point missions", () => {
    expect(buildTerrainSamplePoints([])).toEqual([])
    expect(buildTerrainSamplePoints(null)).toEqual([])
    expect(buildTerrainSamplePoints([point(0, 1, 2)])).toEqual([
      { cumulativeDistance: 0, lat: 1, lon: 2 },
    ])
  })
})

describe("terrainRequestSignature", () => {
  it("ignores altitude, which does not change the ground below", () => {
    const base = [point(0, 53.38, -1.48), point(100, 53.381, -1.48)]
    const withAltitudes = base.map((sample) => ({ ...sample, altitude: 400 }))

    expect(terrainRequestSignature(withAltitudes)).toBe(
      terrainRequestSignature(base),
    )
  })

  it("changes when a position moves", () => {
    const before = [point(0, 53.38, -1.48)]
    const after = [point(0, 53.38001, -1.48)]

    expect(terrainRequestSignature(after)).not.toBe(
      terrainRequestSignature(before),
    )
  })

  it("is empty for no samples", () => {
    expect(terrainRequestSignature([])).toBe("")
  })
})

describe("attachElevations", () => {
  it("pairs elevations with their sample distance", () => {
    const samples = [point(0, 0, 0), point(60, 0.001, 0)]

    expect(attachElevations(samples, [120.5, 131])).toEqual([
      { cumulativeDistance: 0, elevation: 120.5 },
      { cumulativeDistance: 60, elevation: 131 },
    ])
  })

  it("passes gaps through as null", () => {
    const samples = [point(0, 0, 0), point(60, 0.001, 0), point(120, 0.002, 0)]

    expect(
      attachElevations(samples, [10, null, undefined]).map((p) => p.elevation),
    ).toEqual([10, null, null])
  })
})
