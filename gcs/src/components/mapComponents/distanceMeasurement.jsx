/**
 * Distance Measurement Components
 * Displays persistent markers, lines, and labels for distance measurement on maps
 */

import { midpoint } from "@turf/turf"
import { Fragment } from "react"
import { Marker } from "react-map-gl"
import resolveConfig from "tailwindcss/resolveConfig"
import tailwindConfig from "../../../tailwind.config"
import DrawLineCoordinates from "./drawLineCoordinates"
import MarkerPin from "./markerPin"

const tailwindColors = resolveConfig(tailwindConfig).theme.colors

export function DistanceMeasurementMarkers({
  measureDistanceStart,
  distanceMeasurements,
}) {
  const measurements = distanceMeasurements ?? []

  return (
    <>
      {measureDistanceStart !== null && (
        <MarkerPin
          lat={measureDistanceStart.lat}
          lon={measureDistanceStart.lng}
          colour={tailwindColors.green[500]}
          tooltipText="Distance measurement start (pending)"
        />
      )}

      {measurements.map((measurement) => {
        const midpointResult = midpoint(
          [measurement.start.lng, measurement.start.lat],
          [measurement.end.lng, measurement.end.lat],
        )
        const [midLng, midLat] = midpointResult.geometry.coordinates

        return (
          <Fragment key={measurement.id}>
            <MarkerPin
              id={`distance:${measurement.id}:start`}
              lat={measurement.start.lat}
              lon={measurement.start.lng}
              colour={tailwindColors.green[500]}
              tooltipText="Distance measurement start"
            />

            <MarkerPin
              id={`distance:${measurement.id}:end`}
              lat={measurement.end.lat}
              lon={measurement.end.lng}
              colour={tailwindColors.red[500]}
              tooltipText="Distance measurement end"
            />

            <DrawLineCoordinates
              coordinates={[
                [measurement.start.lng, measurement.start.lat],
                [measurement.end.lng, measurement.end.lat],
              ]}
              colour={tailwindColors.blue[500]}
              width={3}
            />

            <Marker latitude={midLat} longitude={midLng}>
              <div className="px-2 py-1 rounded-md bg-falcongrey-700/90 text-white text-xs">
                {measurement.distanceMeters.toFixed(2)} m
              </div>
            </Marker>
          </Fragment>
        )
      })}
    </>
  )
}
