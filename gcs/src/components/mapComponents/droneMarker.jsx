/*
  The marker to display the drones current position on a map
*/

// Map based imports
import { destination, point } from "@turf/turf"
import { Marker } from "react-map-gl"

// Component imports
import DrawLineCoordinates from "./drawLineCoordinates"

// Asset imports
import arrow from "../../assets/arrow.svg"

// Tailwind styling
import { useSelector } from "react-redux"
import resolveConfig from "tailwindcss/resolveConfig"
import tailwindConfig from "../../../tailwind.config"
import {
  selectDesiredBearing,
  selectGpsTrackHeading,
  selectHeading,
} from "../../redux/slices/droneInfoSlice"
const tailwindColors = resolveConfig(tailwindConfig).theme.colors

export default function DroneMarker({ lat, lon, zoom = null, stale = false }) {
  const heading = useSelector(selectHeading)
  const desiredBearing = useSelector(selectDesiredBearing)
  const gpsTrackHeading = useSelector(selectGpsTrackHeading)

  function calculateBearingLineEnd(bearing) {
    return [
      [lon, lat],
      destination(point([lon, lat]), zoom ? 25000 / 2 ** zoom : 1, bearing)
        .geometry.coordinates,
    ]
  }

  return (
    <>
      <Marker latitude={lat} longitude={lon} scale={0.1}>
        <img
          src={arrow}
          className={`w-6 h-6 ${stale ? "opacity-40 grayscale" : ""}`}
          style={{ transform: `rotate(${heading}deg)` }}
        />
      </Marker>

      {!stale && heading !== null && (
        <DrawLineCoordinates
          coordinates={calculateBearingLineEnd(heading)}
          colour={tailwindColors.blue[200]}
          width={3}
        />
      )}

      {!stale && desiredBearing !== null && (
        <DrawLineCoordinates
          coordinates={calculateBearingLineEnd(desiredBearing)}
          colour={tailwindColors.red[200]}
          width={3}
        />
      )}

      {!stale && gpsTrackHeading !== null && (
        <DrawLineCoordinates
          coordinates={calculateBearingLineEnd(gpsTrackHeading)}
          colour={tailwindColors.green[200]}
          width={3}
        />
      )}
    </>
  )
}
