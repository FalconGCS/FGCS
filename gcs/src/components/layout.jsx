/*
  Custom component to control the layout of each page. This is where the navbar is loaded, all pages use this.
*/

// Base imports
import { useEffect } from "react"

// 3rd Party Imports
import { Notifications } from "@mantine/notifications"

// Helpers and custom component imports

// Redux
import { useDispatch, useSelector } from "react-redux"
import {
  emitGetCurrentMissionAll,
  emitGetHomePosition,
  emitGetLoiterRadius,
  emitSetState,
  selectConnectedToDrone,
} from "../redux/slices/droneConnectionSlice"
import {
  selectAircraftTypeString,
  selectHasEverHadGpsFix,
} from "../redux/slices/droneInfoSlice"
import {
  emitGetWaypointRadius,
  selectShouldFetchAllMissionsOnDashboard,
} from "../redux/slices/missionSlice"

export default function Layout({ children, currentPage }) {
  const dispatch = useDispatch()
  const connectedToDrone = useSelector(selectConnectedToDrone)
  const aircraftTypeString = useSelector(selectAircraftTypeString)
  const shouldFetchAllMissionsOnDashboard = useSelector(
    selectShouldFetchAllMissionsOnDashboard,
  )
  const hasEverHadGpsFix = useSelector(selectHasEverHadGpsFix)

  // Handle switching to states
  useEffect(() => {
    const currentPageLowerCase = currentPage.toLowerCase()
    dispatch(emitSetState(currentPageLowerCase))

    if (!connectedToDrone) return

    if (currentPageLowerCase == "dashboard") {
      if (hasEverHadGpsFix) {
        dispatch(emitGetHomePosition()) // use actual home position
      }

      if (shouldFetchAllMissionsOnDashboard) {
        dispatch(emitGetCurrentMissionAll())
      }

      if (aircraftTypeString === "Plane") {
        dispatch(emitGetLoiterRadius())
      }
    }

    if (currentPageLowerCase == "missions") {
      dispatch(emitGetWaypointRadius())
    }
  }, [currentPage, connectedToDrone, hasEverHadGpsFix])

  return (
    <>
      <Notifications limit={5} position="bottom-center" />
      {children}
    </>
  )
}
