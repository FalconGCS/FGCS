/*
  Right hand side floating toolbar. This holds toggles like outside visibility mode and anchoring.
*/

// 3rd Party Imports
import { ActionIcon, Tooltip } from "@mantine/core"
import {
  IconAnchor,
  IconAnchorOff,
  IconCrosshair,
  IconSun,
  IconSunOff,
} from "@tabler/icons-react"

// Redux
import { useDispatch, useSelector } from "react-redux"
import { selectGPS } from "../../redux/slices/droneInfoSlice"

// Helper Functions
import GetOutsideVisibilityColor from "../../helpers/outsideVisibility"
import {
  selectOutsideVisibility,
  setOutsideVisibility,
} from "../../redux/slices/droneConnectionSlice"
import KmlLayersControl from "../mapComponents/kmlLayersControl"

export default function FloatingToolbar({
  centerMapOnDrone,
  followDrone,
  setFollowDrone,
  mapRef,
}) {
  const dispatch = useDispatch()
  const gpsData = useSelector(selectGPS)
  const outsideVisibility = useSelector(selectOutsideVisibility)

  function updateFollowDroneAction() {
    setFollowDrone(
      followDrone
        ? false
        : (() => {
            if (mapRef.current && gpsData?.lon !== 0 && gpsData?.lat !== 0) {
              let lat = parseFloat(gpsData.lat * 1e-7)
              let lon = parseFloat(gpsData.lon * 1e-7)
              mapRef.current.setCenter({ lng: lon, lat: lat })
            }
            return true
          })(),
    )
  }

  return (
    <div
      className="absolute -translate-y-1/2 right-0 top-1/2 py-4 px-2 rounded-tl-md rounded-bl-md flex flex-col gap-2 z-30"
      style={{ backgroundColor: GetOutsideVisibilityColor() }}
    >
      {/* Follow Drone */}
      <Tooltip
        label={
          !gpsData.lon && !gpsData.lat
            ? "No GPS data"
            : followDrone
              ? "Stop following"
              : "Follow drone"
        }
      >
        <ActionIcon
          disabled={!gpsData.lon && !gpsData.lat}
          onClick={() => {
            updateFollowDroneAction()
          }}
        >
          {followDrone ? <IconAnchorOff /> : <IconAnchor />}
        </ActionIcon>
      </Tooltip>

      {/* Center Map on Drone */}
      <Tooltip
        label={!gpsData.lon && !gpsData.lat ? "No GPS data" : "Center on drone"}
      >
        <ActionIcon
          disabled={!gpsData.lon && !gpsData.lat}
          onClick={centerMapOnDrone}
        >
          <IconCrosshair />
        </ActionIcon>
      </Tooltip>

      {/* Set outside visibility */}
      <Tooltip
        label={
          outsideVisibility
            ? "Turn off outside text mode"
            : "Turn on outside text mode"
        }
      >
        <ActionIcon
          onClick={() => {
            dispatch(setOutsideVisibility(!outsideVisibility))
          }}
        >
          {outsideVisibility ? <IconSun /> : <IconSunOff />}
        </ActionIcon>
      </Tooltip>

      <KmlLayersControl mapRef={mapRef} />
    </div>
  )
}
