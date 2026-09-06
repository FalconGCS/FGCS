/*
  The main wrapper for the app
*/

import { useEffect, useMemo } from "react"
import { Route, Routes } from "react-router-dom"

import AutopilotRebootModal from "./params/autopilotRebootModal.jsx"
import SettingsModal from "./settingsModal"
import { Commands } from "./spotlight/commandHandler"
import Toolbar from "./toolbar/toolbar"

// Wrappers
import { useLoadStoredKmlLayers } from "../helpers/kmlLayers"
import { SettingsProvider } from "../helpers/settingsProvider"
import SingleRunWrapper from "./SingleRunWrapper"

// Routes
import Config from "../config"
import Dashboard from "../dashboard"
import FLA from "../fla"
import Missions from "../missions"
import Params from "../params"
import Navbar from "./navbar"

// Redux
import { ErrorBoundary } from "react-error-boundary"
import { useDispatch, useSelector } from "react-redux"
import { selectConnectedToDrone } from "../redux/slices/droneConnectionSlice"
import { selectIsArmed, selectIsFlying } from "../redux/slices/droneInfoSlice"
import { initSocket } from "../redux/slices/socketSlice"
import AlertProvider from "./dashboard/alerts/alertProvider"
import ErrorBoundaryFallback from "./error/errorBoundary"

export default function AppContent() {
  const dispatch = useDispatch()

  const connectedToDrone = useSelector(selectConnectedToDrone)
  const isArmed = useSelector(selectIsArmed)
  const isFlying = useSelector(selectIsFlying)

  // Setup sockets for redux
  useEffect(() => {
    dispatch(initSocket())
  }, [])

  // Load previously imported KML overlays for both maps
  useLoadStoredKmlLayers()

  // Send drone state to main for appropriate quit messages
  useEffect(() => {
    try {
      window.ipcRenderer.send("app:drone-state", {
        connectedToDrone,
        isArmed,
        isFlying,
      })
    } catch {
      console.log("IPC Call Failed: app:drone-state")
    }
  }, [connectedToDrone, isArmed, isFlying])

  // Avoid duplicating the same AlertProvider/Dashboard tree in multiple routes
  const dashboardElement = useMemo(
    () => (
      <AlertProvider>
        <Dashboard />
      </AlertProvider>
    ),
    [dispatch],
  )

  return (
    <SettingsProvider>
      <SingleRunWrapper>
        <Toolbar />
        <ErrorBoundary FallbackComponent={ErrorBoundaryFallback}>
          <SettingsModal />
          <Navbar className="no-drag" />
          <Routes>
            <Route path="/" element={dashboardElement} />
            <Route path="/dashboard" element={dashboardElement} />
            <Route path="/missions" element={<Missions />} />
            <Route path="/params" element={<Params />} />
            <Route path="/config" element={<Config />} />
            <Route path="/fla" element={<FLA />} />
          </Routes>
          <Commands />
          <AutopilotRebootModal />
        </ErrorBoundary>
      </SingleRunWrapper>
    </SettingsProvider>
  )
}
