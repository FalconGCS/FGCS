import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  TerrainUnavailableError,
  clearTerrainTileCache,
  getElevationsForCoords,
  loadTerrainTile,
} from "./terrainElevation"
import {
  TERRAIN_TILE_SIZE,
  decodeTerrainRgb,
  lngLatToTilePixel,
} from "./terrainTiles"

const API_KEY = "test-key"

// Every pixel in a tile holds the same value, so a result identifies its tile
function flatTile(value) {
  return new Float32Array(TERRAIN_TILE_SIZE * TERRAIN_TILE_SIZE).fill(value)
}

beforeEach(() => {
  clearTerrainTileCache()
})

describe("getElevationsForCoords", () => {
  it("fetches each tile once however many samples fall inside it", async () => {
    // Far enough apart to be in different tiles at zoom 12
    const coords = [
      ...Array.from({ length: 20 }, (_, i) => ({
        lat: 53.38 + i * 0.0001,
        lon: -1.48,
      })),
      ...Array.from({ length: 20 }, (_, i) => ({
        lat: -33.87 + i * 0.0001,
        lon: 151.21,
      })),
    ]

    const tiles = new Map()
    const loadTile = vi.fn(async (z, x, y) => {
      const key = `${z}/${x}/${y}`
      if (!tiles.has(key)) tiles.set(key, flatTile(tiles.size + 1))
      return tiles.get(key)
    })

    const elevations = await getElevationsForCoords(coords, {
      apiKey: API_KEY,
      loadTile,
    })

    expect(loadTile).toHaveBeenCalledTimes(2)
    expect(elevations).toHaveLength(40)
    expect(new Set(elevations.slice(0, 20)).size).toBe(1)
    expect(elevations[0]).not.toBe(elevations[39])
  })

  it("reads the elevation at each sample's own pixel", async () => {
    const coord = { lat: 53.38, lon: -1.48 }
    const placement = lngLatToTilePixel(coord.lat, coord.lon)

    const tile = flatTile(0)
    tile[placement.py * TERRAIN_TILE_SIZE + placement.px] = 432.5

    const elevations = await getElevationsForCoords([coord], {
      apiKey: API_KEY,
      loadTile: async () => tile,
    })

    expect(elevations).toEqual([432.5])
  })

  it("returns null where a tile has no coverage, keeping the rest", async () => {
    const coords = [
      { lat: 53.38, lon: -1.48 },
      { lat: -33.87, lon: 151.21 },
    ]

    const elevations = await getElevationsForCoords(coords, {
      apiKey: API_KEY,
      // Ocean tiles come back as null rather than an error
      loadTile: async (_z, _x, _y) =>
        coords[0].lat === 53.38 && _y === lngLatToTilePixel(53.38, -1.48).y
          ? flatTile(215)
          : null,
    })

    expect(elevations[0]).toBe(215)
    expect(elevations[1]).toBeNull()
  })

  it("throws only when every tile fails", async () => {
    const coords = [
      { lat: 53.38, lon: -1.48 },
      { lat: -33.87, lon: 151.21 },
    ]

    await expect(
      getElevationsForCoords(coords, {
        apiKey: API_KEY,
        loadTile: async () => {
          throw new Error("network down")
        },
      }),
    ).rejects.toBeInstanceOf(TerrainUnavailableError)
  })

  it("survives a single tile failing", async () => {
    const target = lngLatToTilePixel(53.38, -1.48)
    const coords = [
      { lat: 53.38, lon: -1.48 },
      { lat: -33.87, lon: 151.21 },
    ]

    const elevations = await getElevationsForCoords(coords, {
      apiKey: API_KEY,
      loadTile: async (_z, x, y) => {
        if (x === target.x && y === target.y) return flatTile(215)
        throw new Error("network down")
      },
    })

    expect(elevations[0]).toBe(215)
    expect(elevations[1]).toBeNull()
  })

  it("refuses to fetch without an API key", async () => {
    const loadTile = vi.fn()

    await expect(
      getElevationsForCoords([{ lat: 53.38, lon: -1.48 }], {
        apiKey: "",
        loadTile,
      }),
    ).rejects.toBeInstanceOf(TerrainUnavailableError)
    expect(loadTile).not.toHaveBeenCalled()
  })

  it("does not start work for an already aborted request", async () => {
    const controller = new AbortController()
    controller.abort()
    const loadTile = vi.fn()

    await expect(
      getElevationsForCoords([{ lat: 53.38, lon: -1.48 }], {
        apiKey: API_KEY,
        signal: controller.signal,
        loadTile,
      }),
    ).rejects.toMatchObject({ name: "AbortError" })
    expect(loadTile).not.toHaveBeenCalled()
  })

  it("propagates an abort raised mid flight", async () => {
    await expect(
      getElevationsForCoords([{ lat: 53.38, lon: -1.48 }], {
        apiKey: API_KEY,
        loadTile: async () => {
          throw new DOMException("aborted", "AbortError")
        },
      }),
    ).rejects.toMatchObject({ name: "AbortError" })
  })

  it("does nothing for no coordinates", async () => {
    const loadTile = vi.fn()

    expect(
      await getElevationsForCoords([], { apiKey: API_KEY, loadTile }),
    ).toEqual([])
    expect(loadTile).not.toHaveBeenCalled()
  })
})

describe("loadTerrainTile", () => {
  function stubTileImage(pixels, size = TERRAIN_TILE_SIZE) {
    const data = new Uint8ClampedArray(size * size * 4)
    pixels.forEach(([r, g, b], i) => {
      data[i * 4] = r
      data[i * 4 + 1] = g
      data[i * 4 + 2] = b
      data[i * 4 + 3] = 255
    })

    vi.stubGlobal("createImageBitmap", async () => ({
      width: size,
      height: size,
      // The real close() resets the dimensions to zero, so anything reading
      // them afterwards silently gets an empty tile
      close() {
        this.width = 0
        this.height = 0
      },
    }))
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        getContext() {
          return {
            drawImage: () => {},
            getImageData: () => ({ data }),
          }
        }
      },
    )
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("decodes RGB pixels into elevations", async () => {
    stubTileImage([
      [0, 0, 0],
      [1, 134, 160],
      [0, 100, 0],
      [2, 0, 0],
    ])
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      status: 200,
      blob: async () => ({}),
    }))

    const tile = await loadTerrainTile(12, 1, 1, API_KEY)

    // A full tile, not an empty one left behind by closing the bitmap early
    expect(tile).toHaveLength(TERRAIN_TILE_SIZE * TERRAIN_TILE_SIZE)
    expect(tile[0]).toBeCloseTo(decodeTerrainRgb(0, 0, 0), 3)
    expect(tile[1]).toBeCloseTo(decodeTerrainRgb(1, 134, 160), 3)
    expect(tile[3]).toBeCloseTo(decodeTerrainRgb(2, 0, 0), 3)
  })

  it("rejects a tile that is not the expected size", async () => {
    stubTileImage([[0, 0, 0]], 8)
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      status: 200,
      blob: async () => ({}),
    }))

    await expect(loadTerrainTile(12, 9, 9, API_KEY)).rejects.toBeInstanceOf(
      TerrainUnavailableError,
    )
  })

  it("treats a missing tile as no coverage rather than an error", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 404 }))

    expect(await loadTerrainTile(12, 2, 2, API_KEY)).toBeNull()
  })

  it("raises other HTTP failures", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 403 }))

    await expect(loadTerrainTile(12, 3, 3, API_KEY)).rejects.toBeInstanceOf(
      TerrainUnavailableError,
    )
  })

  it("does not cache a failure, so a retry can succeed", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ ok: false, status: 404 })
    vi.stubGlobal("fetch", fetchMock)

    await expect(loadTerrainTile(12, 4, 4, API_KEY)).rejects.toThrow("offline")
    expect(await loadTerrainTile(12, 4, 4, API_KEY)).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("shares one request between callers wanting the same tile", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 404 }))
    vi.stubGlobal("fetch", fetchMock)

    const [a, b] = await Promise.all([
      loadTerrainTile(12, 5, 5, API_KEY),
      loadTerrainTile(12, 5, 5, API_KEY),
    ])

    expect(a).toBeNull()
    expect(b).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
