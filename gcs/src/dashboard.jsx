/*
  The dashboard screen. This is the first screen to be loaded in and is where the user will
  spend most of their time.

  This contains the map, live indicator, and GPS data. All of these are imported as components
  and are integrated in this file with logic linking them together.
*/

// Base imports
import { useEffect, useRef, useState } from "react"

// 3rd Party Imports
import { Divider } from "@mantine/core"
import {
  useLocalStorage,
  useSessionStorage,
  useViewportSize,
} from "@mantine/hooks"
import {
  IconAntenna,
  IconBattery2,
  IconGps,
  IconRadar,
  IconSatellite,
  IconStopwatch,
  IconTarget,
} from "@tabler/icons-react"

// Redux
import { useDispatch, useSelector } from "react-redux"
import {
  selectBatteryData,
  selectDroneCoords,
  selectFlightMode,
  selectGPS2RawInt,
  selectGPSRawInt,
  selectHasSecondaryGps,
  selectNotificationSound,
  selectRSSI,
  selectTotalTimeFlying,
  soundPlayed,
} from "./redux/slices/droneInfoSlice"
import { selectCurrentMission } from "./redux/slices/missionSlice"

import { useSettings } from "./helpers/settings"

// Helper javascript files

// Import components
import ForceArmModal from "./components/dashboard/ForceArmModal"
import ForceDisarmModal from "./components/dashboard/ForceDisarmModal"

// Custom component
import useSound from "use-sound"
import EscTelemetryWidget from "./components/dashboard/EscTelemetryWidget"
import FloatingToolbar from "./components/dashboard/floatingToolbar"
import MapSection from "./components/dashboard/map"
import ResizableInfoBox from "./components/dashboard/resizableInfoBox"
import StatusBar, { StatusSection } from "./components/dashboard/statusBar"
import StatusTextWidget from "./components/dashboard/statusTextWidget"
import TabsSection from "./components/dashboard/tabsSection"
import TelemetrySection from "./components/dashboard/telemetrySection/telemetry"
import VideoWidget from "./components/dashboard/videoWidget"
import Layout from "./components/layout"

// Sounds
import armSound from "./assets/sounds/armed.mp3"
import disarmSound from "./assets/sounds/disarmed.mp3"
import flightModeChangedSound from "./assets/sounds/flightmodechanged.mp3"
import lowBatterySound from "./assets/sounds/lowbattery.mp3"
import waypointReachedSound from "./assets/sounds/waypointreached.mp3"
import { formatDurationSecondsToMMSS } from "./helpers/dataFormatters"
import { GPS_FIX_TYPES } from "./helpers/mavlinkConstants.js"

export default function Dashboard() {
  const dispatch = useDispatch()
  const rssi = useSelector(selectRSSI)

  const currentFlightModeNumber = useSelector(selectFlightMode)

  const { lat, lon } = useSelector(selectDroneCoords)
  const batteryData = useSelector(selectBatteryData)
  const armedNotification = useSelector(selectNotificationSound)
  const { fixType, satellitesVisible, hdop } = useSelector(selectGPSRawInt)
  const totalTimeFlying = useSelector(selectTotalTimeFlying)

  const hdopDisplay = hdop != null ? hdop.toFixed(2) : "0.00"

  const currentMission = useSelector(selectCurrentMission)

  const { getSetting } = useSettings()
  const gps2 = useSelector(selectGPS2RawInt)
  const hasSecondaryGps = useSelector(selectHasSecondaryGps)

  // Telemetry panel sizing
  const [telemetryPanelSize, setTelemetryPanelSize] = useLocalStorage({
    key: "telemetryPanelSize",
    defaultValue: { width: 400, height: Infinity },
    deserialize: (value) => {
      const parsed = JSON.parse(value)
      if (parsed === null || parsed === undefined)
        return { width: 400, height: Infinity }
      return { ...parsed, width: Math.max(parsed["width"], 275) }
    },
  })
  const [telemetryFontSize, setTelemetryFontSize] = useState(
    calcBigTextFontSize(),
  )
  const sideBarRef = useRef()

  const { width: viewportWidth } = useViewportSize()

  // Following Drone
  const [followDrone, setFollowDrone] = useSessionStorage({
    key: "followDroneBool",
    defaultValue: false,
  })

  // Map and messages
  const mapRef = useRef()

  // Sounds
  const [playArmed] = useSound(armSound, { volume: 0.1 })
  const [playDisarmed] = useSound(disarmSound, { volume: 0.1 })
  const [playLowBattery] = useSound(lowBatterySound, { volume: 0.1 })
  const [playWaypointReached] = useSound(waypointReachedSound, { volume: 0.1 })
  const [playFlightModeChanged] = useSound(flightModeChangedSound, {
    volume: 0.1,
  })

  const currentMissionSeqRef = useRef(currentMission.seq)

  // Play queued arming sounds
  useEffect(() => {
    if (!getSetting("General.speechAnnouncements")) {
      return
    }
    switch (armedNotification) {
      case "armed":
        playArmed()
        break
      case "disarmed":
        playDisarmed()
        break
      case "mode_change":
        playFlightModeChanged()
        break
      case "low_battery":
        playLowBattery()
        break
      default:
        break
    }
    dispatch(soundPlayed())
  }, [
    armedNotification,
    playArmed,
    playDisarmed,
    playLowBattery,
    dispatch,
    getSetting("General.speechAnnouncements"),
  ])

  useEffect(() => {
    if (currentMission.seq > currentMissionSeqRef.current) {
      if (!getSetting("General.speechAnnouncements")) {
        return
      }
      playWaypointReached()
      dispatch(soundPlayed())
      currentMissionSeqRef.current = currentMission.seq
    }
  }, [
    currentMission.seq,
    playWaypointReached,
    dispatch,
    getSetting("General.speechAnnouncements"),
  ])

  // Following drone logic
  useEffect(() => {
    if (mapRef.current && followDrone && lon !== 0 && lat !== 0) {
      mapRef.current.setCenter({ lng: lon, lat: lat })
    }
  }, [followDrone, lon, lat])

  function centerMapOnDrone() {
    mapRef.current.getMap().flyTo({
      center: [lon, lat],
    })
  }

  function calcBigTextFontSize() {
    const BREAKPOINT_SM = 350.0
    const w = telemetryPanelSize.width

    if (w < BREAKPOINT_SM) {
      return 1.0 - (BREAKPOINT_SM - w) / BREAKPOINT_SM
    }

    return 1.0
  }

  function calcIndicatorSize() {
    const sideBarWidth = sideBarRef.current
      ? sideBarRef.current.clientWidth
      : 56
    return Math.min(telemetryPanelSize.width - (sideBarWidth + 24) * 2, 190)
  }

  function calcIndicatorPadding() {
    const sideBarHeight = sideBarRef.current
      ? sideBarRef.current.clientHeight
      : 164
    return (190 - Math.max(calcIndicatorSize(), sideBarHeight)) / 2
  }

  return (
    <Layout currentPage="dashboard">
      <div
        className="relative flex flex-auto w-full h-full overflow-hidden"
        data-testid="dashboard"
      >
        <div className="w-full">
          <MapSection
            passedRef={mapRef}
            onDragstart={() => {
              setFollowDrone(false)
            }}
            mapId="dashboard"
          />
        </div>

        <ResizableInfoBox
          telemetryPanelSize={telemetryPanelSize}
          viewportWidth={viewportWidth}
          setTelemetryPanelSize={setTelemetryPanelSize}
          setTelemetryFontSize={setTelemetryFontSize}
          calcBigTextFontSize={calcBigTextFontSize}
        >
          {/* Telemetry Information */}
          <TelemetrySection
            calcIndicatorSize={calcIndicatorSize}
            calcIndicatorPadding={calcIndicatorPadding}
            telemetryFontSize={telemetryFontSize}
            sideBarRef={sideBarRef}
          />

          <Divider className="my-2" />

          {/* Actions */}
          <TabsSection currentFlightModeNumber={currentFlightModeNumber} />
        </ResizableInfoBox>

        {/* Status Bar */}
        <StatusBar className="absolute top-0 right-0">
          <StatusSection
            icon={<IconStopwatch />}
            value={formatDurationSecondsToMMSS(totalTimeFlying)}
            tooltip="Total time flying"
          />
          <StatusSection
            icon={<IconRadar />}
            value={GPS_FIX_TYPES[fixType]}
            tooltip="GPS fix type"
          />
          {hasSecondaryGps && (
            <StatusSection
              icon={<IconRadar />}
              value={GPS_FIX_TYPES[gps2.fixType]}
              tooltip="GPS2 fix type"
            />
          )}
          {fixType !== 0 && (
            <>
              <StatusSection
                icon={<IconTarget />}
                value={hdopDisplay}
                tooltip="GPS HDoP"
              />
              <StatusSection
                icon={<IconGps />}
                value={`(${lat !== undefined ? lat.toFixed(7) : 0}, ${
                  lon !== undefined ? lon.toFixed(7) : 0
                })`}
                tooltip="GPS (lat, lon)"
              />
              <StatusSection
                icon={<IconSatellite />}
                value={satellitesVisible}
                tooltip="Satellites visible"
              />
            </>
          )}
          <StatusSection
            icon={<IconAntenna />}
            value={rssi}
            tooltip="RC RSSI"
          />
          <StatusSection
            icon={<IconBattery2 />}
            value={
              batteryData[0]?.battery_remaining
                ? `${batteryData[0].battery_remaining}%`
                : "0%"
            }
            tooltip="Battery remaining"
          />
        </StatusBar>

        {/* Right side floating toolbar */}
        <FloatingToolbar
          centerMapOnDrone={centerMapOnDrone}
          followDrone={followDrone}
          setFollowDrone={setFollowDrone}
          mapRef={mapRef}
        />

        {/* Bottom widgets row */}
        <div
          className="absolute bottom-2 z-10 flex flex-col gap-2 items-start"
          style={{ left: `${telemetryPanelSize.width + 8}px` }}
        >
          <EscTelemetryWidget />
          <VideoWidget />
        </div>

        {/* Bottom right status text widget */}
        <div className="absolute bottom-2 right-2 z-10">
          <StatusTextWidget />
        </div>
      </div>
      <ForceDisarmModal />
      <ForceArmModal />
    </Layout>
  )
}
