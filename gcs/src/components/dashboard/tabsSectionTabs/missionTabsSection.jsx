/**
 * MissionTabsSection
 * This file contains all relevant components to display and modify mission status and information within the mission section
 * in tabsSection.
 */

// Mantine
import { Button, NumberInput, Tabs } from "@mantine/core"

// Mavlink
import { getFlightModeMap } from "../../../helpers/mavlinkConstants"
import { mavlinkDef } from "../../../helpers/mavlinkDef"

import { useMemo, useState } from "react"
import { useDispatch, useSelector } from "react-redux"
import { showWarningNotification } from "../../../helpers/notification"
import {
  emitGetCurrentMissionAll,
  emitSetCurrentFlightMode,
} from "../../../redux/slices/droneConnectionSlice"
import {
  emitControlMission,
  selectCurrentMission,
  selectIsFetchingDashboardMission,
} from "../../../redux/slices/missionSlice"
import { NoConnectionMsg } from "../tabsSection"

export default function MissionTabsSection({
  connected,
  tabPadding,
  navControllerOutputData,
  currentFlightModeNumber,
  aircraftType,
}) {
  return (
    <Tabs.Panel value="mission">
      <div className={tabPadding}>
        {!connected ? (
          <NoConnectionMsg message="No mission actions are available right now. Connect a drone to begin" />
        ) : (
          <div className="flex flex-col gap-4">
            {/** Mission Information */}
            <MissionInfo navControllerOutputData={navControllerOutputData} />

            {/** Auto, Start and Restart Mission */}
            <AutoStartRestartMission
              aircraftType={aircraftType}
              currentFlightModeNumber={currentFlightModeNumber}
            />

            {/** Direct the aircraft to a specific mission item */}
            <GoToMissionItem
              aircraftType={aircraftType}
              currentFlightModeNumber={currentFlightModeNumber}
            />
          </div>
        )}
      </div>
    </Tabs.Panel>
  )
}

const MissionInfo = () => {
  const currentMission = useSelector(selectCurrentMission)
  return (
    <>
      {/** Mission Information */}
      <div className="text-lg">
        <p>
          <span className="font-bold"> Mission State:</span>{" "}
          {mavlinkDef.MissionState[currentMission.mission_state]}
        </p>
        <p>
          <span className="font-bold"> Waypoint: </span> {currentMission.seq}/
          {currentMission.total}
        </p>
      </div>
    </>
  )
}

// Looks up the flight mode number that corresponds to AUTO
const useAutoFlightModeNumber = (aircraftType) =>
  useMemo(() => {
    const flightModeMap = getFlightModeMap(aircraftType)
    const key = Object.keys(flightModeMap).find(
      (key) => flightModeMap[key] === "AUTO",
    )
    return key !== undefined ? parseInt(key) : null
  }, [aircraftType])

const AutoStartRestartMission = ({ aircraftType, currentFlightModeNumber }) => {
  const dispatch = useDispatch()
  const isFetchingDashboardMission = useSelector(
    selectIsFetchingDashboardMission,
  )
  // this is repeated code, will be updated after socket functionality is changed
  function setNewFlightMode(modeNumber) {
    if (modeNumber === null || modeNumber === currentFlightModeNumber) {
      return
    }
    dispatch(emitSetCurrentFlightMode({ newFlightMode: modeNumber }))
  }

  const autoFlightModeNumber = useAutoFlightModeNumber(aircraftType)

  return (
    <>
      <div className="flex flex-wrap flex-cols gap-2">
        {/** Auto Mode */}
        <Button
          onClick={() => {
            setNewFlightMode(autoFlightModeNumber)
          }}
          className="grow"
          disabled={autoFlightModeNumber === null}
        >
          Auto mode
        </Button>

        {/** Start Mission */}
        <Button
          onClick={() => {
            dispatch(emitControlMission({ action: "start" }))
          }}
          className="grow"
        >
          Start Mission
        </Button>

        {/** Restart Mission */}
        <Button
          onClick={() => {
            dispatch(emitControlMission({ action: "restart" }))
          }}
          className="grow"
        >
          Restart Mission
        </Button>

        <Button
          onClick={() => {
            dispatch(emitGetCurrentMissionAll())
          }}
          className="grow"
          loading={isFetchingDashboardMission}
        >
          Read mission
        </Button>
      </div>
    </>
  )
}

const GoToMissionItem = ({ aircraftType, currentFlightModeNumber }) => {
  const dispatch = useDispatch()
  const currentMission = useSelector(selectCurrentMission)
  const autoFlightModeNumber = useAutoFlightModeNumber(aircraftType)

  const [targetSeq, setTargetSeq] = useState(1)

  const maxSeq = currentMission.total > 0 ? currentMission.total - 1 : undefined

  const seqIsValid =
    typeof targetSeq === "number" &&
    Number.isInteger(targetSeq) &&
    targetSeq >= 0 &&
    (maxSeq === undefined || targetSeq <= maxSeq)

  function goToMissionItem() {
    if (!seqIsValid) return

    dispatch(emitControlMission({ action: "set_current", seq: targetSeq }))

    // DO_SET_MISSION_CURRENT only makes the aircraft divert while it is already
    // in AUTO, otherwise it just stages the item for when AUTO is set
    if (
      autoFlightModeNumber !== null &&
      currentFlightModeNumber !== autoFlightModeNumber
    ) {
      showWarningNotification(
        "Not in AUTO mode, the aircraft will only fly to this item once AUTO is engaged",
      )
    }
  }

  return (
    <div className="flex flex-row items-end gap-2">
      <NumberInput
        label="Go to mission item"
        className="grow"
        value={targetSeq}
        onChange={setTargetSeq}
        min={0}
        max={maxSeq}
        step={1}
        allowDecimal={false}
        allowNegative={false}
        clampBehavior="strict"
      />
      <Button onClick={goToMissionItem} disabled={!seqIsValid}>
        Go
      </Button>
    </div>
  )
}
