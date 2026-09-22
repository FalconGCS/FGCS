// Looks up the ground elevation beneath a mission, without making the mission
// profile itself wait on the network

import { useEffect, useMemo, useRef, useState } from "react"

import {
  TerrainUnavailableError,
  getElevationsForCoords,
} from "./terrainElevation"
import {
  attachElevations,
  buildTerrainSamplePoints,
  terrainRequestSignature,
} from "./terrainSampling"

// Delay before re-fetching terrain data
const TERRAIN_FETCH_DEBOUNCE_MS = 300

export default function useMissionTerrainProfile(
  traversalPoints,
  { apiKey, enabled } = {},
) {
  const [terrainPoints, setTerrainPoints] = useState([])
  const [terrainStatus, setTerrainStatus] = useState("disabled")

  const samples = useMemo(
    () => buildTerrainSamplePoints(traversalPoints),
    [traversalPoints],
  )

  const signature = useMemo(() => terrainRequestSignature(samples), [samples])

  const samplesRef = useRef(samples)
  samplesRef.current = samples

  useEffect(() => {
    if (!enabled) {
      setTerrainStatus("disabled")
      return undefined
    }

    if (!apiKey) {
      setTerrainStatus("no-api-key")
      return undefined
    }

    if (signature === "") {
      setTerrainPoints([])
      setTerrainStatus("ready")
      return undefined
    }

    const controller = new AbortController()
    setTerrainStatus("loading")

    const timer = setTimeout(async () => {
      const currentSamples = samplesRef.current
      try {
        const elevations = await getElevationsForCoords(currentSamples, {
          apiKey,
          signal: controller.signal,
        })
        setTerrainPoints(attachElevations(currentSamples, elevations))
        setTerrainStatus("ready")
      } catch (err) {
        if (err?.name === "AbortError") return

        if (!(err instanceof TerrainUnavailableError)) {
          console.error("Failed to load terrain elevation:", err)
        }
        setTerrainStatus("error")
      }
    }, TERRAIN_FETCH_DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [signature, apiKey, enabled])

  return { terrainPoints, terrainStatus }
}
