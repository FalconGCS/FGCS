import { describe, expect, it } from "vitest"
import {
  TERRAIN_TILE_SIZE,
  decodeTerrainRgb,
  elevationAt,
  lngLatToTilePixel,
  terrainTileUrl,
} from "./terrainTiles"

describe("lngLatToTilePixel", () => {
  it("puts null island in the middle of the single zoom 0 tile", () => {
    expect(lngLatToTilePixel(0, 0, 0)).toMatchObject({
      z: 0,
      x: 0,
      y: 0,
      px: 256,
      py: 256,
    })
  })

  it("wraps both ends of the antimeridian onto a real tile", () => {
    expect(lngLatToTilePixel(0, -180, 0)).toMatchObject({ x: 0, px: 0 })

    // 180 would otherwise land on tile index 2^zoom, which does not exist
    const east = lngLatToTilePixel(0, 180, 2)
    expect(east.x).toBe(0)
    expect(east.px).toBe(0)
  })

  it("clamps latitudes beyond the Mercator limit instead of returning NaN", () => {
    const northPole = lngLatToTilePixel(90, 0, 4)
    const beyondLimit = lngLatToTilePixel(85.0511, 0, 4)

    expect(Number.isFinite(northPole.py)).toBe(true)
    expect(northPole.y).toBe(beyondLimit.y)
    expect(northPole.py).toBe(beyondLimit.py)
  })

  it("keeps pixel coordinates inside the tile", () => {
    for (const [lat, lon] of [
      [53.38, -1.48],
      [-33.87, 151.21],
      [0, 0],
      [-85, -179.99],
    ]) {
      const { px, py } = lngLatToTilePixel(lat, lon, 12)
      expect(px).toBeGreaterThanOrEqual(0)
      expect(px).toBeLessThan(TERRAIN_TILE_SIZE)
      expect(py).toBeGreaterThanOrEqual(0)
      expect(py).toBeLessThan(TERRAIN_TILE_SIZE)
    }
  })

  it("moves east with longitude and north with latitude", () => {
    const zoom = 8
    const worldX = (lon) => {
      const p = lngLatToTilePixel(0, lon, zoom)
      return p.x * TERRAIN_TILE_SIZE + p.px
    }
    const worldY = (lat) => {
      const p = lngLatToTilePixel(lat, 0, zoom)
      return p.y * TERRAIN_TILE_SIZE + p.py
    }

    expect(worldX(10)).toBeGreaterThan(worldX(-10))
    // Screen y grows downwards, so a higher latitude is a smaller value
    expect(worldY(40)).toBeLessThan(worldY(10))
  })
})

describe("decodeTerrainRgb", () => {
  it("decodes the bottom of the encoding range", () => {
    expect(decodeTerrainRgb(0, 0, 0)).toBe(-10000)
  })

  it("decodes each channel at its documented weight", () => {
    // (1*65536 + 134*256 + 160) * 0.1 is exactly the 10000 offset, so sea level
    expect(decodeTerrainRgb(1, 134, 160)).toBeCloseTo(0, 4)
    expect(decodeTerrainRgb(0, 100, 0)).toBeCloseTo(-7440, 4)
    expect(decodeTerrainRgb(1, 134, 170)).toBeCloseTo(1, 4)
  })
})

describe("elevationAt", () => {
  const tileSize = 4
  const tile = new Float32Array(tileSize * tileSize)
  tile[0] = 100
  tile[tileSize * 2 + 3] = 250

  it("indexes row by row", () => {
    expect(elevationAt(tile, 0, 0, tileSize)).toBe(100)
    expect(elevationAt(tile, 3, 2, tileSize)).toBe(250)
  })

  it("returns null for a missing tile or an out of range pixel", () => {
    expect(elevationAt(null, 0, 0, tileSize)).toBeNull()
    expect(elevationAt(tile, 0, tileSize, tileSize)).toBeNull()
    expect(elevationAt(tile, -1, 0, tileSize)).toBeNull()
  })
})

describe("terrainTileUrl", () => {
  it("builds a keyed webp tile url", () => {
    expect(terrainTileUrl(12, 2048, 1361, "abc123")).toBe(
      "https://api.maptiler.com/tiles/terrain-rgb-v2/12/2048/1361.webp?key=abc123",
    )
  })
})
