import { kml } from "@tmcw/togeojson"
import { bbox, flatten } from "@turf/turf"

import resolveConfig from "tailwindcss/resolveConfig"
import tailwindConfig from "../../tailwind.config"
const tailwindColors = resolveConfig(tailwindConfig).theme.colors

// Used for features whose KML carries no styling of its own
export const DEFAULT_KML_COLOUR = tailwindColors.orange[400]

export const KML_PRESENTATION_STORAGE_KEY = "kmlLayerPresentation"

export function getPersistedKmlPresentation() {
  const stored = localStorage.getItem(KML_PRESENTATION_STORAGE_KEY)
  if (stored === null) return {}

  try {
    const parsed = JSON.parse(stored)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed
    }
  } catch {
    console.log("Failed to parse KML layer presentation from local storage.")
  }

  // Drop anything unusable so a corrupt value doesn't keep being read back on
  // every startup
  localStorage.removeItem(KML_PRESENTATION_STORAGE_KEY)

  return {}
}

export function toKmlPresentationConfig(layers) {
  return Object.fromEntries(
    layers.map((layer) => [
      layer.id,
      { visible: layer.visible, colourOverride: layer.colourOverride },
    ]),
  )
}

export function parseKmlToLayer(file) {
  const document = new DOMParser().parseFromString(file.contents, "text/xml")

  if (document.querySelector("parsererror")) {
    throw new Error("File is not valid XML")
  }

  if (document.documentElement?.nodeName !== "kml") {
    throw new Error("File is not a KML document")
  }

  const geojson = flatten(kml(document))

  if (geojson.features.length === 0) {
    throw new Error("KML contains no features to display")
  }

  return {
    id: file.id,
    name: file.name,
    originalPath: file.originalPath,
    storedFileName: file.storedFileName,
    featureCount: geojson.features.length,
    bbox: bbox(geojson),
    geojson,
    visible: true,
    colourOverride: null,
  }
}
