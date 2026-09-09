/*
  Custom component for map
  In the top right of the map
*/

// Base imports
import moment from "moment"
import { cloneElement, useEffect, useRef, useState } from "react"

// Third party imports
import { Tooltip } from "@mantine/core"
import { IconClock, IconNetwork, IconNetworkOff } from "@tabler/icons-react"

// Redux
import { useSelector } from "react-redux"
import {
  selectAlt,
  selectBatteryData,
  selectHeartbeatLastReceivedAt,
} from "../../redux/slices/droneInfoSlice"
import { selectConnectedToDrone } from "../../redux/slices/droneConnectionSlice"
import { selectIsConnectedToSocket } from "../../redux/slices/socketSlice"

// Helper imports
import GetOutsideVisibilityColor from "../../helpers/outsideVisibility"
import { useSettings } from "../../helpers/settings"
import AlertSection from "./alerts/alert"
import { AlertCategory, AlertSeverity } from "./alerts/alertConstants"
import { useAlerts } from "./alerts/alertContext"

export function StatusSection({ icon, value, tooltip }) {
  return (
    <Tooltip label={tooltip}>
      <div className="flex flex-row items-center justify-center space-x-1">
        {cloneElement(icon, { size: 20 })}
        {value !== null && <p>{value}</p>}
      </div>
    </Tooltip>
  )
}

export default function StatusBar(props) {
  const isConnectedToSocket = useSelector(selectIsConnectedToSocket)
  const isConnectedToDrone = useSelector(selectConnectedToDrone)
  const [time, setTime] = useState(moment())
  const batteryData = useSelector(selectBatteryData)
  const alt = useSelector(selectAlt)
  const heartbeatLastReceivedAt = useSelector(selectHeartbeatLastReceivedAt)

  // Update clock every second
  useEffect(() => {
    const id = setInterval(() => setTime(moment()), 1000)
    return () => clearInterval(id)
  }, [])

  // Alerts
  const { getSetting } = useSettings()
  const { dispatchAlert, dismissAlert } = useAlerts()
  const highestAltitudeRef = useRef(0)
  const heartbeatAlertActiveRef = useRef(false)

  useEffect(() => {
    const maxAltitude = getSetting("Dashboard.maxAltitudeAlert")
    const relativeAlt = alt.relativeAlt

    if (relativeAlt > maxAltitude) {
      dispatchAlert({
        category: AlertCategory.Altitude,
        severity: AlertSeverity.Red,
        jsx: <>Caution! You've exceeded {maxAltitude}m</>,
      })
      return
    } else {
      dismissAlert(AlertCategory.Altitude)
    }

    if (relativeAlt > highestAltitudeRef.current) {
      highestAltitudeRef.current = relativeAlt
      return
    }

    const minAltitudes = (
      getSetting("Dashboard.minAltitudeAlerts") ?? []
    ).slice()
    minAltitudes.sort((a1, a2) => a1 - a2)

    for (const [i, altitude] of minAltitudes.entries()) {
      // This stops warnings being shown on takeoff
      if (highestAltitudeRef.current > altitude && relativeAlt < altitude) {
        dispatchAlert({
          category: AlertCategory.Altitude,
          severity:
            i == 0
              ? AlertSeverity.Red
              : i == minAltitudes.length - 1
                ? AlertSeverity.Yellow
                : AlertSeverity.Orange,
          jsx: <>Caution! You've fallen below {altitude}m</>,
        })
        return
      }
    }

    dismissAlert(AlertCategory.Altitude)
  }, [alt])

  useEffect(() => {
    const batteryAlertPercentages = getSetting("Dashboard.batteryAlert") ?? []
    batteryAlertPercentages.sort((a1, a2) => a1 - a2)

    batteryData.forEach((battery) => {
      for (const [
        i,
        batteryAlertPercentage,
      ] of batteryAlertPercentages.entries()) {
        if (battery.battery_remaining < batteryAlertPercentage) {
          dispatchAlert({
            category: AlertCategory.Battery,
            severity:
              i == 0
                ? AlertSeverity.Red
                : i == batteryAlertPercentages.length - 1
                  ? AlertSeverity.Yellow
                  : AlertSeverity.Orange,
            jsx: (
              <>
                Caution! You've dropped below {batteryAlertPercentage}% battery
              </>
            ),
          })
          return
        }
      }
    })
  }, [batteryData])

  useEffect(() => {
    const timeoutSeconds = Number(
      getSetting("Dashboard.heartbeatTimeoutSeconds") ?? 10,
    )
    const timeoutMs = Number.isFinite(timeoutSeconds)
      ? timeoutSeconds * 1000
      : 10000

    const checkHeartbeatTimeout = () => {
      if (!isConnectedToDrone) {
        if (heartbeatAlertActiveRef.current) {
          dismissAlert(AlertCategory.Heartbeat)
          heartbeatAlertActiveRef.current = false
        }
        return
      }

      if (heartbeatLastReceivedAt <= 0) {
        if (heartbeatAlertActiveRef.current) {
          dismissAlert(AlertCategory.Heartbeat)
          heartbeatAlertActiveRef.current = false
        }
        return
      }

      const elapsedSeconds = Math.max(
        0,
        Math.floor((Date.now() - heartbeatLastReceivedAt) / 1000),
      )
      const isHeartbeatStale = elapsedSeconds * 1000 > timeoutMs

      if (isHeartbeatStale) {
        dispatchAlert({
          category: AlertCategory.Heartbeat,
          severity: AlertSeverity.Red,
          dismissable: false,
          jsx: (
            <>
              Caution! It has been {elapsedSeconds}s since the last heartbeat.
            </>
          ),
        })
        heartbeatAlertActiveRef.current = true
        return
      }

      if (heartbeatAlertActiveRef.current) {
        dismissAlert(AlertCategory.Heartbeat)
        heartbeatAlertActiveRef.current = false
      }
    }

    checkHeartbeatTimeout()
    const id = setInterval(checkHeartbeatTimeout, 1000)
    return () => clearInterval(id)
  }, [
    dismissAlert,
    dispatchAlert,
    getSetting,
    heartbeatLastReceivedAt,
    isConnectedToDrone,
  ])

  return (
    <div className={`${props.className} flex flex-col items-end`}>
      <div
        className="flex flex-row space-x-3 p-1"
        style={{ backgroundColor: GetOutsideVisibilityColor() }}
      >
        {props.children}

        <StatusSection
          icon={isConnectedToSocket ? <IconNetwork /> : <IconNetworkOff />}
          value=""
          tooltip={
            isConnectedToSocket
              ? "Connected to socket"
              : "Disconnected from socket"
          }
        />
        <StatusSection
          icon={<IconClock />}
          value={time?.format("HH:mm:ss")}
          tooltip="Local time"
        />
      </div>
      <div
        className="flex flex-row space-x-3 p-1"
        style={{ backgroundColor: GetOutsideVisibilityColor() }}
      >
        <p className="text-sm text-blue-200">Current heading</p>
        <p className="text-sm text-red-200">Desired heading</p>
        <p className="text-sm text-green-200">GPS track heading</p>
      </div>
      <div className="m-2">
        <AlertSection />
      </div>
    </div>
  )
}
