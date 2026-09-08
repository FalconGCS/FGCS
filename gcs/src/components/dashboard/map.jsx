/*
  The dashboard map.

  This uses maplibre to load the map, currently (as of 23/04/2024) this needs an internet
  connection to load but this will be addressed in later versions of FGCS. Please check
  docs/changelogs if this description has not been updated.
*/

// Base imports
import React, { useEffect, useRef, useState } from "react"
import { v4 as uuidv4 } from "uuid"

// Maplibre and mantine imports
import { Button, Divider, Modal, NumberInput } from "@mantine/core"
import { useClipboard, useDisclosure, useLocalStorage } from "@mantine/hooks"
import "maplibre-gl/dist/maplibre-gl.css"
import Map from "react-map-gl/maplibre"

// Redux
import { useDispatch, useSelector } from "react-redux"
import {
  addDashboardDistanceMeasurement,
  clearDashboardDistanceMeasurementDraftStart,
  removeDashboardDistanceMeasurement,
  selectDashboardContextMenu,
  selectDashboardDistanceMeasurementDraftStart,
  selectDashboardDistanceMeasurements,
  setDashboardDistanceMeasurementDraftStart,
  updateDashboardContextMenuState,
} from "../../redux/slices/dashboardSlice"
import {
  deletePoiMarker,
  emitReposition,
  selectConnectedToDrone,
  selectPoiMarkers,
} from "../../redux/slices/droneConnectionSlice"
import {
  selectFlightModeString,
  selectGPS,
  selectGpsTrack,
  selectGuidedModePinData,
  selectHomePosition,
} from "../../redux/slices/droneInfoSlice"
import { selectCurrentMissionItems } from "../../redux/slices/missionSlice"

// Helper scripts
import { intToCoord } from "../../helpers/dataFormatters"
import { filterMissionItems } from "../../helpers/filterMissions"
import { useSettings } from "../../helpers/settings"

// Other dashboard imports
import ContextMenuItem from "../mapComponents/contextMenuItem"
import { DistanceMeasurementMarkers } from "../mapComponents/distanceMeasurement"
import DroneMarker from "../mapComponents/droneMarker"
import FenceItems from "../mapComponents/fenceItems"
import HomeMarker from "../mapComponents/homeMarker"
import MarkerPin from "../mapComponents/markerPin"
import MissionItems from "../mapComponents/missionItems"
// Tailwind styling
import { distance, envelope, featureCollection, point } from "@turf/turf"
import resolveConfig from "tailwindcss/resolveConfig"
import tailwindConfig from "../../../tailwind.config"
import { showInfoNotification } from "../../helpers/notification"
import { getContainerPointFromEvent } from "../../helpers/pointer"
import AddPoiMarkerModal from "../mapComponents/addPoiMarkerModal"
import ContextMenuSubMenuItem from "../mapComponents/contextMenuSubMenuItem"
import DrawLineCoordinates from "../mapComponents/drawLineCoordinates"
import KmlLayers from "../mapComponents/kmlLayers"
import POIMarkersContainer from "../mapComponents/poiMarkersContainer"
const tailwindColors = resolveConfig(tailwindConfig).theme.colors

const coordsFractionDigits = 7

function MapSectionNonMemo({ passedRef, onDragstart, mapId = "dashboard" }) {
  // Redux
  const dispatch = useDispatch()
  const gpsData = useSelector(selectGPS)
  const connectedToDrone = useSelector(selectConnectedToDrone)
  const missionItems = useSelector(selectCurrentMissionItems)
  const homePosition = useSelector(selectHomePosition) // use actual home position
  const flightModeString = useSelector(selectFlightModeString)
  const guidedModePinData = useSelector(selectGuidedModePinData)
  const gpsTrack = useSelector(selectGpsTrack)
  const poiMarkers = useSelector(selectPoiMarkers)

  const [position, setPosition] = useState(null)
  const [firstCenteredToDrone, setFirstCenteredToDrone] = useState(false)
  const { getSetting } = useSettings()
  const [addPoiMarkerModalOpened, setAddPoiMarkerModalOpened] = useState(false)

  // Check if maps should be synchronized (from settings)
  const syncMaps = getSetting("General.syncMapViews") || false

  // Use either a shared key or a unique key based on the setting
  const viewStateKey = syncMaps
    ? "initialViewState"
    : `initialViewState_${mapId}`

  const [initialViewState, setInitialViewState] = useLocalStorage({
    key: viewStateKey,
    defaultValue: { latitude: 53.381655, longitude: -1.481434, zoom: 17 },
    getInitialValueInEffect: false,
  })

  const [repositionAltitude, setRepositionAltitude] = useLocalStorage({
    key: "repositionAltitude",
    defaultValue: 30,
  })

  const [filteredMissionItems, setFilteredMissionItems] = useState([])

  const contextMenuRef = useRef()
  const contextMenuState = useSelector(selectDashboardContextMenu)
  const measureDistanceStart = useSelector(
    selectDashboardDistanceMeasurementDraftStart,
  )
  const distanceMeasurements = useSelector(selectDashboardDistanceMeasurements)

  const [opened, { open, close }] = useDisclosure(false)
  const clipboard = useClipboard({ timeout: 500 })

  const selectedDistanceMeasurementId =
    typeof contextMenuState?.markerId === "string" &&
    contextMenuState.markerId.startsWith("distance:")
      ? contextMenuState.markerId.split(":")[1]
      : null

  useEffect(() => {
    const closeContextMenu = () =>
      dispatch(updateDashboardContextMenuState({ isOpen: false }))

    document.addEventListener("click", closeContextMenu)
    return () => {
      document.removeEventListener("click", closeContextMenu)
    }
  }, [])

  useEffect(() => {
    if (contextMenuRef.current) {
      const boundingRect = contextMenuRef.current.getBoundingClientRect()
      dispatch(
        updateDashboardContextMenuState({
          menuSize: {
            width: Math.round(boundingRect.width),
            height: Math.round(boundingRect.height),
          },
        }),
      )
    }
  }, [contextMenuRef.current])

  useEffect(() => {
    if (!connectedToDrone) {
      setPosition(null)
      setFirstCenteredToDrone(false)
      return
    }

    // Check latest gpsData point is valid
    if (
      isNaN(gpsData.lat) ||
      isNaN(gpsData.lon) ||
      gpsData.lon === 0 ||
      gpsData.lat === 0
    ) {
      return
    }

    // Move drone icon on map
    let lat = intToCoord(gpsData.lat)
    let lon = intToCoord(gpsData.lon)
    setPosition({ latitude: lat, longitude: lon })

    if (!firstCenteredToDrone && passedRef.current !== null) {
      passedRef.current.getMap().flyTo({
        center: [lon, lat],
        zoom: initialViewState.zoom,
      })
      setFirstCenteredToDrone(true)
    }
  }, [gpsData, connectedToDrone, firstCenteredToDrone, initialViewState.zoom])

  useEffect(() => {
    setFilteredMissionItems(filterMissionItems(missionItems.missionItems))
  }, [missionItems])

  function zoomToDrone() {
    if (passedRef.current && position) {
      passedRef.current.getMap().flyTo({
        center: [position.longitude, position.latitude],
        zoom: 17,
      })
    }
  }

  function zoomToMission() {
    if (passedRef.current && filteredMissionItems.length > 0) {
      const filteredCoords = filteredMissionItems.map((item) =>
        point([intToCoord(item.y), intToCoord(item.x)]),
      )
      const features = featureCollection(filteredCoords)
      const boundingBox = envelope(features).bbox

      passedRef.current.getMap().fitBounds(
        [
          [boundingBox[0], boundingBox[1]],
          [boundingBox[2], boundingBox[3]],
        ],
        {
          padding: 150,
        },
      )
    }
  }

  function zoomToHome() {
    if (
      passedRef.current &&
      homePosition &&
      homePosition.lat !== 0 &&
      homePosition.lon !== 0
    ) {
      passedRef.current.getMap().flyTo({
        center: [intToCoord(homePosition.lon), intToCoord(homePosition.lat)],
        zoom: 17,
      })
    }
  }

  function measureDistance() {
    if (measureDistanceStart === null) {
      dispatch(
        setDashboardDistanceMeasurementDraftStart(contextMenuState.gpsCoords),
      )
      showInfoNotification('Click "Measure distance" again to finish measuring')
    } else {
      dispatch(
        addDashboardDistanceMeasurement({
          id: uuidv4(),
          start: measureDistanceStart,
          end: contextMenuState.gpsCoords,
          distanceMeters: distance(
            [measureDistanceStart.lng, measureDistanceStart.lat],
            [contextMenuState.gpsCoords.lng, contextMenuState.gpsCoords.lat],
            { units: "meters" },
          ),
        }),
      )
    }
  }

  function stopMeasureDistance() {
    dispatch(clearDashboardDistanceMeasurementDraftStart())
  }

  return (
    <div className="w-initial h-full" id="map">
      <Map
        initialViewState={initialViewState}
        mapStyle={`https://api.maptiler.com/maps/${getSetting("General.mapStyle") || "hybrid"}/style.json?key=${getSetting("General.maptilerAPIKey") || import.meta.env.VITE_MAPTILER_API_KEY}`}
        ref={passedRef}
        attributionControl={false}
        dragRotate={false}
        touchRotate={false}
        onLoad={(e) => {
          const canvas = e.target.getCanvas()
          dispatch(
            updateDashboardContextMenuState({
              canvasSize: {
                width: canvas.clientWidth,
                height: canvas.clientHeight,
              },
            }),
          )
        }}
        onMoveEnd={(newViewState) =>
          setInitialViewState({
            latitude: newViewState.viewState.latitude,
            longitude: newViewState.viewState.longitude,
            zoom: newViewState.viewState.zoom,
          })
        }
        onDragStart={onDragstart}
        onContextMenu={(e) => {
          e.preventDefault()
          const canvas = e.target.getCanvas()
          const pt = getContainerPointFromEvent(e.originalEvent ?? e, canvas)
          dispatch(
            updateDashboardContextMenuState({
              isOpen: true,
              position: pt,
              gpsCoords: e.lngLat,
              markerId: null,
            }),
          )
        }}
        onMouseDown={() => {
          dispatch(updateDashboardContextMenuState({ isOpen: false }))
        }}
        onClick={() => {
          dispatch(updateDashboardContextMenuState({ isOpen: false }))
        }}
        cursor="default"
      >
        <KmlLayers />

        {/* Show marker on map if the position is set */}
        {position !== null &&
          !isNaN(position?.latitude) &&
          !isNaN(position?.longitude) && (
            <DroneMarker
              lat={position.latitude}
              lon={position.longitude}
              zoom={initialViewState.zoom}
            />
          )}

        <MissionItems missionItems={missionItems.missionItems} />

        <FenceItems fenceItems={missionItems.fenceItems} />

        {/* Show mission rally point */}
        {missionItems.rallyItems.map((item, index) => {
          return (
            <MarkerPin
              key={index}
              lat={intToCoord(item.x)}
              lon={intToCoord(item.y)}
              colour={tailwindColors.purple[400]}
              tooltipText={item.z ? `Alt: ${item.z}` : null}
            />
          )
        })}

        {flightModeString === "GUIDED" &&
          guidedModePinData !== null &&
          guidedModePinData.lat !== 0 &&
          guidedModePinData.lon !== 0 && (
            <MarkerPin
              lat={guidedModePinData.lat}
              lon={guidedModePinData.lon}
              colour={tailwindColors.pink[500]}
              tooltipText={
                guidedModePinData.alt ? `Alt: ${guidedModePinData.alt}` : null
              }
            />
          )}

        {/* Show home position */}
        {homePosition !== null &&
          homePosition.lat !== 0 &&
          homePosition.lon !== 0 && (
            <HomeMarker
              lat={intToCoord(homePosition.lat)}
              lon={intToCoord(homePosition.lon)}
            />
          )}

        {/* Show GPS track */}
        {gpsTrack.length > 1 && (
          <DrawLineCoordinates
            coordinates={gpsTrack.map((point) => [
              intToCoord(point.lon),
              intToCoord(point.lat),
            ])}
            colour={tailwindColors.violet[400]}
            width={5}
          />
        )}

        <DistanceMeasurementMarkers
          measureDistanceStart={measureDistanceStart}
          distanceMeasurements={distanceMeasurements}
        />

        <POIMarkersContainer />

        <Modal opened={opened} onClose={close} title="Enter altitude" centered>
          <form
            className="flex flex-col space-y-2"
            onSubmit={(e) => {
              e.preventDefault()
              dispatch(
                emitReposition({
                  lat: contextMenuState.gpsCoords.lat,
                  lon: contextMenuState.gpsCoords.lng,
                  alt: repositionAltitude,
                }),
              )
              close()
            }}
          >
            <NumberInput
              placeholder="Altitude (m)"
              value={repositionAltitude}
              onChange={setRepositionAltitude}
              min={0}
              allowNegative={false}
              hideControls
              data-autofocus
            />
            <Button fullWidth type="submit">
              Reposition
            </Button>
          </form>
        </Modal>

        <AddPoiMarkerModal
          modalOpened={addPoiMarkerModalOpened}
          setModalOpened={setAddPoiMarkerModalOpened}
          lat={contextMenuState.gpsCoords.lat}
          lon={contextMenuState.gpsCoords.lng}
        />

        {contextMenuState.isOpen && (
          <div
            ref={contextMenuRef}
            className="absolute bg-falcongrey-700 rounded-md p-1 z-20"
            style={{
              top: contextMenuState.position.y,
              left: contextMenuState.position.x,
            }}
          >
            <ContextMenuItem onClick={zoomToDrone}>
              <p>Zoom to drone</p>
            </ContextMenuItem>
            <ContextMenuItem onClick={zoomToMission}>
              <p>Zoom to mission</p>
            </ContextMenuItem>
            <ContextMenuItem onClick={zoomToHome}>
              <p>Zoom to home</p>
            </ContextMenuItem>
            <Divider className="my-1" />
            <ContextMenuItem onClick={open}>Fly to here</ContextMenuItem>
            <Divider className="my-1" />
            <ContextMenuItem onClick={measureDistance}>
              <p>Measure distance</p>
            </ContextMenuItem>
            {selectedDistanceMeasurementId && (
              <ContextMenuItem
                onClick={() => {
                  dispatch(
                    removeDashboardDistanceMeasurement(
                      selectedDistanceMeasurementId,
                    ),
                  )
                  stopMeasureDistance()
                }}
              >
                <p>Delete distance measurement</p>
              </ContextMenuItem>
            )}
            <ContextMenuSubMenuItem title={"POI marker"}>
              <ContextMenuItem
                onClick={() => {
                  setAddPoiMarkerModalOpened(true)
                }}
              >
                <p>Add POI marker</p>
              </ContextMenuItem>
              {poiMarkers.find(
                (marker) => marker.id === contextMenuState?.markerId,
              ) && (
                <ContextMenuItem
                  onClick={() => {
                    dispatch(deletePoiMarker({ id: contextMenuState.markerId }))
                  }}
                >
                  <p>Delete POI marker</p>
                </ContextMenuItem>
              )}
            </ContextMenuSubMenuItem>
            <Divider className="my-1" />
            <ContextMenuItem
              onClick={() => {
                clipboard.copy(
                  `${contextMenuState.gpsCoords.lat}, ${contextMenuState.gpsCoords.lng}`,
                )
                showInfoNotification("Copied to clipboard")
              }}
            >
              <div className="w-full flex justify-between gap-2">
                <p>
                  {contextMenuState.gpsCoords.lat.toFixed(coordsFractionDigits)}
                  ,{" "}
                  {contextMenuState.gpsCoords.lng.toFixed(coordsFractionDigits)}
                </p>
                <svg
                  className="relative -right-1"
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                >
                  <path
                    fill="currentColor"
                    d="M9 18q-.825 0-1.412-.587T7 16V4q0-.825.588-1.412T9 2h9q.825 0 1.413.588T20 4v12q0 .825-.587 1.413T18 18zm0-2h9V4H9zm-4 6q-.825 0-1.412-.587T3 20V7q0-.425.288-.712T4 6t.713.288T5 7v13h10q.425 0 .713.288T16 21t-.288.713T15 22zm4-6V4z"
                  />
                </svg>
              </div>
            </ContextMenuItem>
          </div>
        )}
      </Map>
    </div>
  )
}
function propsAreEqual(prev, next) {
  return JSON.stringify(prev) === JSON.stringify(next)
}
const MapSection = React.memo(MapSectionNonMemo, propsAreEqual)

export default MapSection
