// Fetches MapTiler terrain-RGB tiles and reads ground elevations out of them

import {
  TERRAIN_TILE_SIZE,
  TERRAIN_TILE_ZOOM,
  decodeTerrainRgb,
  elevationAt,
  lngLatToTilePixel,
  terrainTileUrl,
} from "./terrainTiles"

// A 512x512 tile of floats is about 1MB, so keep the cache modest
const MAX_CACHED_TILES = 64

export class TerrainUnavailableError extends Error {
  constructor(message) {
    super(message)
    this.name = "TerrainUnavailableError"
  }
}

const tileCache = new Map()

export function clearTerrainTileCache() {
  tileCache.clear()
}

function rememberTile(key, tilePromise) {
  tileCache.set(key, tilePromise)

  while (tileCache.size > MAX_CACHED_TILES) {
    const oldestKey = tileCache.keys().next().value
    if (oldestKey === undefined) break
    tileCache.delete(oldestKey)
  }
}

async function fetchTileElevations(z, x, y, apiKey, signal) {
  const response = await fetch(terrainTileUrl(z, x, y, apiKey), { signal })

  // Tiles outside the dataset's coverage, such as open ocean
  if (response.status === 404 || response.status === 204) return null

  if (!response.ok) {
    throw new TerrainUnavailableError(
      `Terrain tile ${z}/${x}/${y} failed: ${response.status}`,
    )
  }

  const bitmap = await createImageBitmap(await response.blob())

  const { width, height } = bitmap

  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext("2d", { willReadFrequently: true })
  context.drawImage(bitmap, 0, 0)
  const { data } = context.getImageData(0, 0, width, height)
  bitmap.close()

  // Pixel positions are worked out against this size, so anything else would
  // silently read the wrong ground
  if (width !== TERRAIN_TILE_SIZE || height !== TERRAIN_TILE_SIZE) {
    throw new TerrainUnavailableError(
      `Terrain tile ${z}/${x}/${y} was ${width}x${height}, expected ${TERRAIN_TILE_SIZE}`,
    )
  }

  const elevations = new Float32Array(width * height)
  for (let i = 0; i < elevations.length; i++) {
    const offset = i * 4
    elevations[i] = decodeTerrainRgb(
      data[offset],
      data[offset + 1],
      data[offset + 2],
    )
  }

  return elevations
}

export function loadTerrainTile(z, x, y, apiKey, signal) {
  const key = `${z}/${x}/${y}`

  const cached = tileCache.get(key)
  if (cached) return cached

  const tilePromise = fetchTileElevations(z, x, y, apiKey, signal).catch(
    (err) => {
      // Do not cache the failure, so a later attempt can retry
      tileCache.delete(key)
      throw err
    },
  )

  rememberTile(key, tilePromise)
  return tilePromise
}

async function runWithConcurrency(tasks, concurrency) {
  const results = new Array(tasks.length)
  let next = 0

  const workers = Array.from(
    { length: Math.min(concurrency, tasks.length) },
    async () => {
      while (next < tasks.length) {
        const index = next++
        results[index] = await tasks[index]()
      }
    },
  )

  await Promise.all(workers)
  return results
}

// Ground elevation for each position, in the order they were given. Positions
// with no terrain coverage come back as null so the graph can break the line
export async function getElevationsForCoords(coords, options = {}) {
  const {
    apiKey,
    zoom = TERRAIN_TILE_ZOOM,
    signal,
    concurrency = 6,
    loadTile = loadTerrainTile,
  } = options

  if (!Array.isArray(coords) || coords.length === 0) return []

  if (!apiKey) {
    throw new TerrainUnavailableError("No MapTiler API key configured")
  }

  if (signal?.aborted) {
    throw new DOMException("Terrain request aborted", "AbortError")
  }

  const placements = coords.map((coord) =>
    lngLatToTilePixel(coord.lat, coord.lon, zoom),
  )

  const uniqueTiles = new Map()
  for (const placement of placements) {
    const key = `${placement.z}/${placement.x}/${placement.y}`
    if (!uniqueTiles.has(key)) uniqueTiles.set(key, placement)
  }

  const tileKeys = [...uniqueTiles.keys()]
  let failureCount = 0

  const tiles = await runWithConcurrency(
    tileKeys.map((key) => async () => {
      const { z, x, y } = uniqueTiles.get(key)
      try {
        return await loadTile(z, x, y, apiKey, signal)
      } catch (err) {
        if (err?.name === "AbortError") throw err
        // One missing tile should not lose the rest of the profile
        failureCount += 1
        return null
      }
    }),
    concurrency,
  )

  if (tileKeys.length > 0 && failureCount === tileKeys.length) {
    throw new TerrainUnavailableError("All terrain tile requests failed")
  }

  const tilesByKey = new Map(tileKeys.map((key, index) => [key, tiles[index]]))

  return placements.map((placement) => {
    const tile = tilesByKey.get(`${placement.z}/${placement.x}/${placement.y}`)
    return elevationAt(tile, placement.px, placement.py, TERRAIN_TILE_SIZE)
  })
}
