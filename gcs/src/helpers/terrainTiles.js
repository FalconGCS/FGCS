// Web Mercator tile maths and elevation decoding for MapTiler's terrain-RGB
// tileset, used to draw the ground profile on the mission elevation graph

const TERRAIN_TILESET = "terrain-rgb-v2"

export const TERRAIN_TILE_SIZE = 512

// The tileset goes up to zoom 14, but the underlying DEM is SRTM at ~30m. At
// zoom 12 a 512px tile is already ~19m/px
export const TERRAIN_TILE_ZOOM = 12
export const TERRAIN_TILE_MAX_ZOOM = 14

// Beyond this latitude the Mercator projection runs off to infinity
const MAX_MERCATOR_LATITUDE = 85.0511

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export function terrainTileUrl(z, x, y, apiKey) {
  return `https://api.maptiler.com/tiles/${TERRAIN_TILESET}/${z}/${x}/${y}.webp?key=${apiKey}`
}

// Returns the tile holding this position along with the pixel within it, plus
// the sub-pixel remainder so that a caller could interpolate between
// neighbouring pixels later on
export function lngLatToTilePixel(
  lat,
  lon,
  zoom = TERRAIN_TILE_ZOOM,
  tileSize = TERRAIN_TILE_SIZE,
) {
  const tileCount = 2 ** zoom
  const worldSize = tileCount * tileSize

  const clampedLat = clamp(lat, -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE)
  const latRad = (clampedLat * Math.PI) / 180

  const worldX = ((lon + 180) / 360) * worldSize
  const worldY =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
    worldSize

  // Longitude wraps around the antimeridian, latitude is clamped at the poles
  const pixelX = ((worldX % worldSize) + worldSize) % worldSize
  const pixelY = clamp(worldY, 0, worldSize - 1)

  const x = Math.floor(pixelX / tileSize)
  const y = Math.floor(pixelY / tileSize)

  return {
    z: zoom,
    x,
    y,
    px: Math.floor(pixelX) - x * tileSize,
    py: Math.floor(pixelY) - y * tileSize,
    fx: pixelX - Math.floor(pixelX),
    fy: pixelY - Math.floor(pixelY),
  }
}

// Mapbox terrain-RGB encoding, which MapTiler's tileset also uses
export function decodeTerrainRgb(r, g, b) {
  return -10000 + (r * 65536 + g * 256 + b) * 0.1
}

export function elevationAt(
  tileElevations,
  px,
  py,
  tileSize = TERRAIN_TILE_SIZE,
) {
  if (!tileElevations) return null

  const index = py * tileSize + px
  if (index < 0 || index >= tileElevations.length) return null

  const elevation = tileElevations[index]
  return Number.isFinite(elevation) ? elevation : null
}
