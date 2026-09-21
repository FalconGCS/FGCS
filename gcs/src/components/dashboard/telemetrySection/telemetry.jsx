/*
  Telemetry. This file holds all the telemetry indicators and is part of the resizable info box
  section, found in the top half.
*/

import { Text } from "@mantine/core"
import { distance } from "@turf/turf"
import { useEffect, useState } from "react"
import { useSelector } from "react-redux"
import { intToCoord } from "../../../helpers/dataFormatters"
import {
  selectAttitude,
  selectBatteryData,
  selectFlightModeString,
  selectGPS,
  selectHomePosition,
  selectIsArmed,
  selectNavController,
  selectReadyToArm,
  selectTelemetry,
} from "../../../redux/slices/droneInfoSlice"
import EkfDisplay from "./ekfDisplay"
import { AttitudeIndicator, HeadingIndicator } from "./indicator"
import TelemetryValueDisplay from "./telemetryValueDisplay"
import VibeDisplay from "./vibeDisplay"

export default function TelemetrySection({
  calcIndicatorSize,
  calcIndicatorPadding,
  telemetryFontSize,
  sideBarRef,
}) {
  const flightMode = useSelector(selectFlightModeString)
  const gpsData = useSelector(selectGPS)
  const isArmed = useSelector(selectIsArmed)
  const readyToArm = useSelector(selectReadyToArm)
  const telemetryData = useSelector(selectTelemetry)
  const attitudeData = useSelector(selectAttitude)
  const navControllerOutputData = useSelector(selectNavController)
  const batteryData = useSelector(selectBatteryData)
  const homePosition = useSelector(selectHomePosition)

  const [distToHome, setDistToHome] = useState(0)

  useEffect(() => {
    // Calculate distance from current pos to home pos
    if (gpsData.lat && gpsData.lon && homePosition.lat && homePosition.lon) {
      const distToHomeCalculated = distance(
        [intToCoord(gpsData.lon), intToCoord(gpsData.lat)],
        [intToCoord(homePosition.lon), intToCoord(homePosition.lat)],
        {
          units: "meters",
        },
      )
      setDistToHome(distToHomeCalculated)
    }
  }, [gpsData, homePosition])

  return (
    <div>
      {/* Information above indicators */}
      <div className="flex flex-col items-center gap-4 py-4 cursor-default">
        {!isArmed && (
          <Text
            size={`${telemetryFontSize * 1.5}rem`}
            c={readyToArm ? "green.6" : "red.6"}
          >
            {readyToArm ? "Ready to arm" : "Not ready to arm"}
          </Text>
        )}
        <Text
          fw={700}
          size={`${telemetryFontSize * 1.5}rem`}
          c={isArmed ? "red.6" : ""}
        >
          {isArmed ? "ARMED" : "DISARMED"}
        </Text>
        <Text fw={700} size={`${telemetryFontSize * 1.5}rem`}>
          {flightMode}
        </Text>
      </div>

      {/* Indicators */}
      <div className="flex items-center flex-col justify-evenly @2xl:flex-row">
        {/* Attitude Indicator */}
        <div
          className="grid items-center grid-cols-[8ch_auto_8ch]"
          style={{
            paddingTop: `${calcIndicatorPadding()}px`,
            paddingBottom: `${calcIndicatorPadding()}px`,
          }}
        >
          <div className="justify-self-end w-[8ch]">
            <div className="flex flex-col items-center justify-center space-y-4 text-center min-w-14">
              {/* AS and GS values */}
              <p className="text-center">ms&#8315;&#185;</p>
              <TelemetryValueDisplay
                title="AS"
                value={(telemetryData.airspeed
                  ? telemetryData.airspeed
                  : 0
                ).toFixed(2)}
                fs={telemetryFontSize}
                tooltipText="Airspeed"
              />
              <TelemetryValueDisplay
                title="GS"
                value={(telemetryData.groundspeed
                  ? telemetryData.groundspeed
                  : 0
                ).toFixed(2)}
                fs={telemetryFontSize}
                tooltipText="Ground Speed"
              />
            </div>
          </div>

          {/* Attitude indicator image */}
          <div className="justify-self-center flex-shrink-0">
            <AttitudeIndicator
              roll={attitudeData.roll * (180 / Math.PI)}
              pitch={attitudeData.pitch * (180 / Math.PI)}
              size={`${calcIndicatorSize()}px`}
            />
          </div>

          {/* AMSL and AREL values */}
          <div className="justify-self-start w-[8ch]">
            <div className="flex flex-col items-center justify-center space-y-4 text-center min-w-14">
              <p className="text-center">m</p>
              <TelemetryValueDisplay
                title="AMSL"
                value={(gpsData.alt ? gpsData.alt / 1000 : 0).toFixed(2)}
                fs={telemetryFontSize}
                tooltipText="Altitude Above Mean Sea Level"
              />
              <TelemetryValueDisplay
                title="AREL"
                value={(gpsData.relative_alt
                  ? gpsData.relative_alt / 1000
                  : 0
                ).toFixed(2)}
                fs={telemetryFontSize}
                tooltipText="Altitude Relative to Home"
              />
            </div>
          </div>
        </div>

        {/* Heading Indicator */}
        <div
          className="grid items-center grid-cols-[8ch_auto_8ch]"
          style={{
            paddingTop: `${calcIndicatorPadding()}px`,
            paddingBottom: `${calcIndicatorPadding()}px`,
          }}
        >
          <div className="justify-self-end w-[8ch]">
            <div className="flex flex-col items-center justify-center space-y-4 text-center min-w-14">
              {/* HDG and WP values */}
              <p className="text-center">deg &#176;</p>
              <TelemetryValueDisplay
                title="HDG"
                value={(gpsData.hdg ? gpsData.hdg / 100 : 0).toFixed(2)}
                fs={telemetryFontSize}
                tooltipText="Heading"
              />
              <TelemetryValueDisplay
                title="YAW"
                value={(attitudeData.yaw
                  ? attitudeData.yaw * (180 / Math.PI)
                  : 0
                ).toFixed(2)}
                fs={telemetryFontSize}
                tooltipText="Yaw"
              />
            </div>
          </div>

          {/* Heading indicator image */}
          <div className="justify-self-center flex-shrink-0">
            <HeadingIndicator
              heading={gpsData.hdg ? gpsData.hdg / 100 : 0}
              size={`${calcIndicatorSize()}px`}
            />
          </div>

          {/* YAW and HOME values */}
          <div className="justify-self-start w-[8ch]" ref={sideBarRef}>
            <div className="flex flex-col items-center justify-center space-y-4 text-center min-w-14">
              <p>m</p>
              <TelemetryValueDisplay
                title="WP"
                value={(navControllerOutputData.wpDist
                  ? navControllerOutputData.wpDist
                  : 0
                ).toFixed(2)}
                fs={telemetryFontSize}
                tooltipText="Distance to Waypoint"
              />
              <TelemetryValueDisplay
                title="HOME"
                value={distToHome.toFixed(2)}
                fs={telemetryFontSize}
                tooltipText="Distance to Home"
              />
            </div>
          </div>
        </div>
      </div>

      {/* EKF and VIBE labels */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center my-4">
        <div /> {/* left filler column */}
        <div className="flex justify-center gap-10">
          <EkfDisplay telemetryFontSize={telemetryFontSize} />
          <VibeDisplay telemetryFontSize={telemetryFontSize} />
        </div>
        <div /> {/* right filler column */}
      </div>

      {/* Battery information */}
      {batteryData.length > 0 && (
        <div className="flex flex-col items-center my-4 cursor-default">
          <table>
            <tbody>
              {batteryData.map((battery) => (
                <tr className="w-full" key={battery.id}>
                  <td
                    className="px-4"
                    style={{ fontSize: `${telemetryFontSize * 1.5}rem` }}
                  >
                    BATTERY{batteryData.length > 1 && battery.id}
                  </td>
                  <td
                    className="font-bold px-2 text-right"
                    style={{ fontSize: `${telemetryFontSize * 1.5}rem` }}
                  >
                    {(battery.voltages
                      ? battery.voltages[0] / 1000
                      : 0
                    ).toFixed(2)}
                    V
                  </td>
                  <td
                    className="font-bold px-2 text-right"
                    style={{ fontSize: `${telemetryFontSize * 1.5}rem` }}
                  >
                    {(battery.current_battery
                      ? battery.current_battery / 100
                      : 0
                    ).toFixed(2)}
                    A
                  </td>
                  <td
                    className="font-bold px-2 text-right"
                    style={{ fontSize: `${telemetryFontSize * 1.5}rem` }}
                  >
                    {battery.battery_remaining ? battery.battery_remaining : 0}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
