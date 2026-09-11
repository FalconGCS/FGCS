/*
  The missions screen.
*/

// Base imports
import { useCallback, useEffect, useRef, useState } from "react"

// 3rd Party Imports
import { ResizableBox } from "react-resizable"
import { v4 as uuidv4 } from "uuid"

// Custom component and helpers
import {
  Button,
  Divider,
  Modal,
  NumberInput,
  Progress,
  Select,
  Tabs,
  Tooltip,
} from "@mantine/core"
import { IconInfoCircle } from "@tabler/icons-react"
import Layout from "./components/layout"
import FenceItemsTable from "./components/missions/fenceItemsTable"
import MissionItemsTable from "./components/missions/missionItemsTable"
import MissionStatistics from "./components/missions/missionStatistics"
import MissionsMapSection from "./components/missions/missionsMap"
import RallyItemsTable from "./components/missions/rallyItemsTable"
import { coordToInt, intToCoord } from "./helpers/dataFormatters"
import { buildMissionElevationProfile } from "./helpers/missionElevationProfile"

// Redux
import { useDispatch, useSelector } from "react-redux"
import {
  selectConnectedToDrone,
  selectCurrentPage,
} from "./redux/slices/droneConnectionSlice"

// Tailwind styling
import resolveConfig from "tailwindcss/resolveConfig"
import tailwindConfig from "../tailwind.config"
import UpdatePlannedHomePositionModal from "./components/missions/updatePlannedHomePositionModal"
import { showErrorNotification } from "./helpers/notification"
import {
  selectAircraftType,
  setDroneAircraftType,
} from "./redux/slices/droneInfoSlice"
import {
  emitExportMissionToFile,
  emitGetCurrentMission,
  emitGetTargetInfo,
  emitImportMissionFromFile,
  emitSetWaypointRadius,
  emitWriteCurrentMission,
  getFrameKey,
  selectAcceptanceRadius,
  selectActiveTab,
  selectDefaultWaypointAltitude,
  selectDrawingFenceItems,
  selectDrawingMissionItems,
  selectDrawingRallyItems,
  selectMissionProgressData,
  selectMissionProgressModal,
  selectPlannedHomePosition,
  selectTargetInfo,
  selectUnwrittenChanges,
  selectVehicleWaypointRadius,
  setAcceptanceRadius,
  setActiveTab,
  setDefaultWaypointAltitude,
  setMissionProgressData,
  setMissionProgressModal,
  setPlannedHomePosition,
} from "./redux/slices/missionSlice"
const tailwindColors = resolveConfig(tailwindConfig).theme.colors

const coordsFractionDigits = 7
const resizeTableHeightPadding = 20 // To account for the handle height and some padding

function isInvalidInputNumber(value) {
  return value === "" || value === null || isNaN(Number(value))
}

function UnwrittenChangesWarning({ unwrittenChanges }) {
  const firstUnwrittenTab = Object.entries(unwrittenChanges).find(
    ([, changed]) => changed,
  )

  return (
    <>
      {firstUnwrittenTab && (
        <p className="text-red-400 text-center">
          You have unwritten <b>{firstUnwrittenTab[0]}</b> changes.
        </p>
      )}
    </>
  )
}

export default function Missions() {
  // Redux
  const dispatch = useDispatch()
  const connected = useSelector(selectConnectedToDrone)
  const targetInfo = useSelector(selectTargetInfo)
  const plannedHomePosition = useSelector(selectPlannedHomePosition)
  const activeTab = useSelector(selectActiveTab)
  const aircraftType = useSelector(selectAircraftType)

  // Mission items
  const missionItems = useSelector(selectDrawingMissionItems)
  const fenceItems = useSelector(selectDrawingFenceItems)
  const rallyItems = useSelector(selectDrawingRallyItems)
  const unwrittenChanges = useSelector(selectUnwrittenChanges)
  const missionProgressModalOpened = useSelector(selectMissionProgressModal)
  const missionProgressModalData = useSelector(selectMissionProgressData)

  // Need to keep a reference to the active tab to avoid stale closures
  const activeTabRef = useRef(activeTab)
  const tabsListRef = useRef(null)
  const [tableSectionHeight, setTableSectionHeight] = useState(300)

  // Modal for mission progress
  const [missionProgressModalTitle, setMissionProgressModalTitle] = useState(
    "Mission progress update",
  )
  const currentPage = useSelector(selectCurrentPage)
  const mapRef = useRef()

  const [plannedHomeLatInput, setPlannedHomeLatInput] = useState(
    intToCoord(plannedHomePosition?.lat ?? 0).toFixed(coordsFractionDigits),
  )
  const [plannedHomeLonInput, setPlannedHomeLonInput] = useState(
    intToCoord(plannedHomePosition?.lon ?? 0).toFixed(coordsFractionDigits),
  )
  const [plannedHomeAltInput, setPlannedHomeAltInput] = useState(
    plannedHomePosition?.alt ?? 0.1,
  )

  const defaultWaypointAltitude = useSelector(selectDefaultWaypointAltitude)
  const [defaultAltitudeInput, setDefaultAltitudeInput] = useState(
    defaultWaypointAltitude,
  )

  const acceptanceRadius = useSelector(selectAcceptanceRadius)
  const vehicleWaypointRadius = useSelector(selectVehicleWaypointRadius)
  const waypointRadiusParamId = vehicleWaypointRadius?.paramId ?? null
  const effectiveAcceptanceRadius =
    connected && vehicleWaypointRadius !== null
      ? vehicleWaypointRadius.radius
      : acceptanceRadius
  const [acceptanceRadiusInput, setAcceptanceRadiusInput] = useState(
    effectiveAcceptanceRadius,
  )

  // Follow the source of truth when it changes underneath the input
  useEffect(() => {
    setAcceptanceRadiusInput(effectiveAcceptanceRadius)
  }, [effectiveAcceptanceRadius])

  function commitAcceptanceRadius() {
    if (
      isInvalidInputNumber(acceptanceRadiusInput) ||
      acceptanceRadiusInput <= 0
    ) {
      setAcceptanceRadiusInput(effectiveAcceptanceRadius)
      return
    }

    if (acceptanceRadiusInput === effectiveAcceptanceRadius) return

    if (connected) {
      dispatch(emitSetWaypointRadius(acceptanceRadiusInput))
    } else {
      dispatch(setAcceptanceRadius(acceptanceRadiusInput))
    }
  }

  useEffect(() => {
    if (tabsListRef.current) {
      // Set initial height of the table section when component mounts
      setTableSectionHeight(
        300 - tabsListRef.current.clientHeight - resizeTableHeightPadding,
      )
    }
  }, [tabsListRef.current])

  // Send some messages when file is loaded
  useEffect(() => {
    dispatch(emitGetTargetInfo())
  }, [currentPage])

  useEffect(() => {
    activeTabRef.current = activeTab
  }, [activeTab])

  useEffect(() => {
    setPlannedHomeLatInput(
      intToCoord(plannedHomePosition?.lat).toFixed(coordsFractionDigits),
    )
  }, [plannedHomePosition?.lat])

  useEffect(() => {
    setPlannedHomeLonInput(
      intToCoord(plannedHomePosition?.lon).toFixed(coordsFractionDigits),
    )
  }, [plannedHomePosition?.lon])

  useEffect(() => {
    setPlannedHomeAltInput(plannedHomePosition?.alt)
  }, [plannedHomePosition?.alt])

  function resetMissionProgressModalData() {
    dispatch(
      setMissionProgressData({
        message: "",
        progress: null,
      }),
    )
  }

  function createPlannedHomePositionItem() {
    if (!plannedHomePosition) {
      showErrorNotification("Planned home position is not set")
      return
    }

    const newHomeItem = {
      id: uuidv4(),
      seq: 0, // Home position is always the first item
      x: plannedHomePosition.lat,
      y: plannedHomePosition.lon,
      z: plannedHomePosition.alt || 0,
      frame: getFrameKey("GLOBAL"),
      command: 16, // MAV_CMD_NAV_WAYPOINT
      param1: 0,
      param2: 0,
      param3: 0,
      param4: 0,
      current: 1, // Set as current waypoint
      autocontinue: 1,
      target_component: targetInfo.target_component,
      target_system: targetInfo.target_system,
      mission_type:
        activeTabRef.current === "mission"
          ? 0
          : activeTabRef.current === "fence"
            ? 1
            : activeTabRef.current === "rally"
              ? 2
              : 0, // Default to 0 (Mission type) if activeTab is unrecognized,
      mavpackettype: "MISSION_ITEM_INT",
    }

    return newHomeItem
  }

  function readMissionFromDrone() {
    dispatch(emitGetCurrentMission())
    setMissionProgressModalTitle(`Reading ${activeTabRef.current} from drone`)
    resetMissionProgressModalData()
    dispatch(setMissionProgressModal(true))
  }

  function writeMissionToDrone() {
    if (activeTabRef.current === "mission") {
      dispatch(
        emitWriteCurrentMission({ type: "mission", items: missionItems }),
      )
    } else if (activeTabRef.current === "fence") {
      dispatch(emitWriteCurrentMission({ type: "fence", items: fenceItems }))
    } else if (activeTabRef.current === "rally") {
      dispatch(emitWriteCurrentMission({ type: "rally", items: rallyItems }))
    }
    setMissionProgressModalTitle(`Writing ${activeTabRef.current} to drone`)
    resetMissionProgressModalData()
    dispatch(setMissionProgressModal(true))
  }

  async function importMissionFromFile() {
    const result = await window.ipcRenderer.invoke(
      "window:select-file-in-explorer",
      [{ name: "Waypoint files", extensions: ["waypoints", "txt"] }],
    )
    if (result?.success) {
      dispatch(
        emitImportMissionFromFile({
          type: activeTabRef.current,
          file_path: result.path,
        }),
      )
    } else if (result) {
      showErrorNotification(result.message)
    }
  }

  async function saveMissionToFile() {
    // The options for the save dialog
    const options = {
      title: "Save the mission to a file",
      filters: [
        { name: "Waypoint Files", extensions: ["waypoints"] },
        { name: "All Files", extensions: ["*"] },
      ],
    }

    const result = await window.ipcRenderer.invoke(
      "app:get-save-file-path",
      options,
    )

    if (!result.canceled) {
      let items = []
      if (activeTabRef.current === "mission") {
        items = [...missionItems]
      } else if (activeTabRef.current === "fence") {
        items = [...fenceItems]

        const newPlannedHomeItem = createPlannedHomePositionItem()
        if (newPlannedHomeItem) {
          items.unshift(newPlannedHomeItem) // Add planned home item at the beginning
        }

        // Ensure all sequence values are updated
        items = items.map((item, index) => ({
          ...item,
          seq: index,
        }))
      } else if (activeTabRef.current === "rally") {
        items = [...rallyItems]

        const newPlannedHomeItem = createPlannedHomePositionItem()
        if (newPlannedHomeItem) {
          items.unshift(newPlannedHomeItem) // Add planned home item at the beginning
        }

        // Ensure all sequence values are updated
        items = items.map((item, index) => ({
          ...item,
          seq: index,
        }))
      }

      dispatch(
        emitExportMissionToFile({
          type: activeTabRef.current,
          file_path: result.filePath,
          items: items,
        }),
      )
    }
  }

  const sendElevationGraphUpdate = useCallback(() => {
    if (!window.ipcRenderer) return

    const profile = buildMissionElevationProfile(
      missionItems,
      aircraftType,
      plannedHomePosition,
    )
    window.ipcRenderer
      .invoke("app:update-elevation-graph", profile)
      .catch((err) => {
        console.error("Failed to update elevation graph:", err)
      })
  }, [missionItems, aircraftType, plannedHomePosition])

  const openElevationGraph = useCallback(() => {
    if (!window.ipcRenderer) return

    window.ipcRenderer
      .invoke("app:open-elevation-graph-window")
      .then(() => sendElevationGraphUpdate())
      .catch((err) => {
        console.error("Failed to open elevation graph window:", err)
      })
  }, [sendElevationGraphUpdate])

  useEffect(() => {
    sendElevationGraphUpdate()
  }, [sendElevationGraphUpdate])

  return (
    <Layout currentPage="missions">
      <Modal
        opened={missionProgressModalOpened}
        onClose={() => dispatch(setMissionProgressModal(false))}
        title={missionProgressModalTitle}
        closeOnClickOutside={false}
        closeOnEscape={false}
        withCloseButton={false}
        centered
        overlayProps={{
          backgroundOpacity: 0.55,
          blur: 3,
        }}
      >
        <div className="flex flex-col items-center justify-center mt-4">
          {missionProgressModalData.message && (
            <p className="text-center mb-2">
              {missionProgressModalData.message}
            </p>
          )}

          {missionProgressModalData.progress !== null &&
            missionProgressModalData.progress !== undefined && (
              <Progress
                animated
                size="lg"
                transitionDuration={300}
                value={missionProgressModalData.progress * 100}
                className="w-full mx-auto my-auto"
              />
            )}
        </div>
      </Modal>

      <UpdatePlannedHomePositionModal />

      <div className="flex flex-col h-screen overflow-hidden">
        <div className="flex flex-1 overflow-hidden">
          {/* Resizable Sidebar */}
          <ResizableBox
            width={200}
            height={Infinity}
            minConstraints={[200, Infinity]}
            maxConstraints={[600, Infinity]}
            resizeHandles={["e"]}
            axis="x"
            handle={
              <div className="w-2 h-full bg-falcongrey-900 hover:bg-falconred-500 cursor-col-resize absolute right-0 top-0 z-10"></div>
            }
            className="relative bg-falcongrey-800 overflow-y-auto"
          >
            <div className="flex flex-col gap-4 p-4">
              <div className="flex flex-col gap-4">
                {connected ? (
                  <>
                    <UnwrittenChangesWarning
                      unwrittenChanges={unwrittenChanges}
                    />
                    <Button
                      onClick={() => {
                        readMissionFromDrone()
                      }}
                      disabled={!connected}
                      className="grow"
                    >
                      Read {activeTab}
                    </Button>
                    <Button
                      onClick={() => {
                        writeMissionToDrone()
                      }}
                      disabled={!connected}
                      className="grow"
                    >
                      Write {activeTab}
                    </Button>
                  </>
                ) : (
                  <Select
                    label="Select Aircraft Type"
                    value={aircraftType.toString()}
                    onChange={(val) => {
                      dispatch(setDroneAircraftType(Number(val)))
                    }}
                    data={[
                      { value: "1", label: "Plane" },
                      { value: "2", label: "Copter" },
                    ]}
                    allowDeselect={false}
                  />
                )}
              </div>

              <Divider className="my-1" />

              <div className="flex flex-col gap-4">
                <Button className="grow" onClick={importMissionFromFile}>
                  Import from file
                </Button>
                <Button
                  onClick={() => {
                    saveMissionToFile()
                  }}
                  className="grow"
                >
                  Save to file
                </Button>
              </div>

              <Divider className="my-1" />

              <div className="flex flex-col gap-2">
                <NumberInput
                  label="Default waypoint altitude"
                  value={defaultAltitudeInput}
                  onChange={(val) => {
                    setDefaultAltitudeInput(val)
                    if (isInvalidInputNumber(val)) return
                    dispatch(setDefaultWaypointAltitude(val))
                  }}
                  onBlur={() => {
                    if (isInvalidInputNumber(defaultAltitudeInput)) {
                      setDefaultAltitudeInput(defaultWaypointAltitude)
                    }
                  }}
                  min={0}
                  allowNegative={false}
                  suffix="m"
                  hideControls
                />

                <Tooltip
                  label={
                    connected
                      ? `Sets ${waypointRadiusParamId ?? "the waypoint radius parameter"} on the aircraft`
                      : "Sets the acceptance waypoint radius"
                  }
                >
                  <NumberInput
                    label="Acceptance radius"
                    value={acceptanceRadiusInput}
                    onChange={setAcceptanceRadiusInput}
                    onBlur={commitAcceptanceRadius}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitAcceptanceRadius()
                    }}
                    min={0}
                    allowNegative={false}
                    suffix="m"
                    hideControls
                  />
                </Tooltip>
              </div>

              <Divider className="my-1" />

              <div className="flex flex-col gap-2">
                <p className="font-bold">
                  Planned home{" "}
                  <span>
                    <Tooltip
                      className="inline"
                      label={
                        <>
                          <p className="text-wrap max-w-80">
                            The planned home location is used to approximate the
                            starting location of the mission. The dashboard
                            displays the <i>actual</i> home location used by the
                            drone.
                          </p>
                        </>
                      }
                    >
                      <IconInfoCircle size={20} />
                    </Tooltip>
                  </span>
                </p>
                <NumberInput
                  label="Lat"
                  value={plannedHomeLatInput}
                  onChange={(val) => setPlannedHomeLatInput(val)}
                  onBlur={() => {
                    if (isInvalidInputNumber(plannedHomeLatInput)) {
                      setPlannedHomeLatInput(
                        intToCoord(plannedHomePosition?.lat).toFixed(
                          coordsFractionDigits,
                        ),
                      )
                    }
                  }}
                  min={-90}
                  max={90}
                  step={0.000001}
                  hideControls
                />
                <NumberInput
                  label="Lon"
                  value={plannedHomeLonInput}
                  onChange={(val) => setPlannedHomeLonInput(val)}
                  onBlur={() => {
                    if (isInvalidInputNumber(plannedHomeLonInput)) {
                      setPlannedHomeLonInput(
                        intToCoord(plannedHomePosition?.lon).toFixed(
                          coordsFractionDigits,
                        ),
                      )
                    }
                  }}
                  min={-180}
                  max={180}
                  step={0.000001}
                  hideControls
                />
                <NumberInput
                  label="Alt"
                  value={plannedHomeAltInput}
                  onChange={(val) => setPlannedHomeAltInput(val)}
                  onBlur={() => {
                    if (isInvalidInputNumber(plannedHomeAltInput)) {
                      setPlannedHomeAltInput(plannedHomePosition?.alt)
                    }
                  }}
                  min={0.1}
                  allowNegative={false}
                  hideControls
                />
                <Button
                  className="mt-2"
                  onClick={() =>
                    dispatch(
                      setPlannedHomePosition({
                        lat: coordToInt(plannedHomeLatInput),
                        lon: coordToInt(plannedHomeLonInput),
                        alt: plannedHomeAltInput,
                      }),
                    )
                  }
                >
                  Save planned home
                </Button>
              </div>

              <Divider className="my-1" />

              <div className="flex flex-col gap-2">
                <p className="font-bold">Mission statistics</p>
                <MissionStatistics />
              </div>
            </div>
          </ResizableBox>

          {/* Main content area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Map area */}
            <div className="flex-1 relative">
              <MissionsMapSection
                passedRef={mapRef}
                missionItems={missionItems}
                fenceItems={fenceItems}
                rallyItems={rallyItems}
                onOpenElevationGraph={openElevationGraph}
              />
            </div>

            {/* Resizable Bottom Bar */}
            <ResizableBox
              width={Infinity}
              height={300}
              minConstraints={[Infinity, 100]}
              maxConstraints={[Infinity, 400]}
              resizeHandles={["n"]}
              axis="y"
              handle={
                <div className="w-full h-2 bg-falcongrey-900 hover:bg-falconred-500 cursor-row-resize absolute top-0 left-0 z-10"></div>
              }
              className="relative bg-falcongrey-800 overflow-y-auto"
              onResizeStop={(_, { size }) => {
                setTableSectionHeight(
                  size.height -
                    tabsListRef.current.clientHeight -
                    resizeTableHeightPadding,
                )
              }}
            >
              <Tabs
                value={activeTab}
                onChange={(value) => dispatch(setActiveTab(value))}
                className="mt-2"
              >
                <Tabs.List grow ref={tabsListRef}>
                  <Tabs.Tab value="mission" color={tailwindColors.yellow[400]}>
                    Mission
                  </Tabs.Tab>
                  <Tabs.Tab value="fence" color={tailwindColors.blue[400]}>
                    Fence
                  </Tabs.Tab>
                  <Tabs.Tab value="rally" color={tailwindColors.purple[400]}>
                    Rally
                  </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="mission">
                  <MissionItemsTable tableSectionHeight={tableSectionHeight} />
                </Tabs.Panel>
                <Tabs.Panel value="fence">
                  <FenceItemsTable tableSectionHeight={tableSectionHeight} />
                </Tabs.Panel>
                <Tabs.Panel value="rally">
                  <RallyItemsTable tableSectionHeight={tableSectionHeight} />
                </Tabs.Panel>
              </Tabs>
            </ResizableBox>
          </div>
        </div>
      </div>
    </Layout>
  )
}
