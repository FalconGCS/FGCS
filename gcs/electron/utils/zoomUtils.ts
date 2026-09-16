import { BrowserWindow, screen } from "electron"

export const DEFAULT_ZOOM = 1.0
export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 3.0
export const ZOOM_STEP = 0.1

function sanitise(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback
  }
  return value
}

export function clampZoom(zoom: unknown): number {
  const value = sanitise(zoom, DEFAULT_ZOOM)
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

export function getDisplayId(win: BrowserWindow | null): number | null {
  if (!win || win.isDestroyed()) return null

  try {
    return screen.getDisplayMatching(win.getBounds()).id
  } catch (error) {
    console.error("Failed to read display id", error)
    return null
  }
}
