/*
  The missions map.

  This uses maplibre to load the map, currently (as of 16/03/2025) this needs an internet
  connection to load but this will be addressed in later versions of FGCS. Please check
  docs/changelogs if this description has not been updated.
*/

// Base imports
import React, { useEffect, useRef, useState } from "react"

// Maplibre and mantine imports
import { useClipboard, useLocalStorage, usePrevious } from "@mantine/hooks"
import "maplibre-gl/dist/maplibre-gl.css"
import Map from "react-map-gl/maplibre"

// Helper scripts
import { v4 as uuidv4 } from "uuid"
import { coordToInt, intToCoord } from "../../helpers/dataFormatters"
import { filterMissionItems } from "../../helpers/filterMissions"
import {
  showInfoNotification,
  showNotification,
} from "../../helpers/notification"
import { useSettings } from "../../helpers/settings"

// Other dashboard imports
import ContextMenuItem from "../mapComponents/contextMenuItem"
import ContextMenuSubMenuItem from "../mapComponents/contextMenuSubMenuItem"
import { DistanceMeasurementMarkers } from "../mapComponents/distanceMeasurement"
import DroneMarker from "../mapComponents/droneMarker"
import FenceItems from "../mapComponents/fenceItems"
import HomeMarker from "../mapComponents/homeMarker"
import MarkerPin from "../mapComponents/markerPin"
import MissionItems from "../mapComponents/missionItems"
import Polygon from "../mapComponents/polygon"
import Divider from "../toolbar/menus/divider"

// Tailwind styling
import { distance, envelope, featureCollection, point } from "@turf/turf"
import resolveConfig from "tailwindcss/resolveConfig"
import tailwindConfig from "../../../tailwind.config"

// Redux
import { useDispatch, useSelector } from "react-redux"
import { getContainerPointFromEvent } from "../../helpers/pointer"
import {
  deletePoiMarker,
  selectPoiMarkers,
} from "../../redux/slices/droneConnectionSlice"
import {
  selectFlightModeString,
  selectGPS,
  selectGuidedModePinData,
} from "../../redux/slices/droneInfoSlice"
import {
  addMissionDistanceMeasurement,
  clearDrawingItems,
  clearMissionDistanceMeasurementDraftStart,
  createFencePolygon,
  createNewDefaultDrawingItem,
  getFrameKey,
  removeDrawingItem,
  removeMissionDistanceMeasurement,
  selectActiveTab,
  selectContextMenu,
  selectMissionDistanceMeasurementDraftStart,
  selectMissionDistanceMeasurements,
  selectPlannedHomePosition,
  setMissionDistanceMeasurementDraftStart,
  setPlannedHomePosition,
  setPlannedHomePositionToDronesHomePositionThunk,
  updateContextMenuState,
} from "../../redux/slices/missionSlice"
import AddPoiMarkerModal from "../mapComponents/addPoiMarkerModal"
import ContextMenuSpecificCommandItems from "../mapComponents/contextMenuSpecificCommandItems"
import KmlLayers from "../mapComponents/kmlLayers"
import KmlLayersControl from "../mapComponents/kmlLayersControl"
import POIMarkersContainer from "../mapComponents/poiMarkersContainer"

const tailwindColors = resolveConfig(tailwindConfig).theme.colors

const coordsFractionDigits = 7

function MapSectionNonMemo({
  passedRef,
  missionItems,
  fenceItems,
  rallyItems,
  onDragstart,
  onOpenElevationGraph,
}) {
  // Redux
  const dispatch = useDispatch()
  const gpsData = useSelector(selectGPS)
  const plannedHomePosition = useSelector(selectPlannedHomePosition)
  const flightModeString = useSelector(selectFlightModeString)
  const currentTab = useSelector(selectActiveTab)
  const contextMenuState = useSelector(selectContextMenu)
  const measureDistanceStart = useSelector(
    selectMissionDistanceMeasurementDraftStart,
  )
  const distanceMeasurements = useSelector(selectMissionDistanceMeasurements)
  const guidedModePinData = useSelector(selectGuidedModePinData)
  const poiMarkers = useSelector(selectPoiMarkers)

  const [position, setPosition] = useState(null)
  const { getSetting } = useSettings()

  // Check if maps should be synchronized (from settings)
  const syncMaps = getSetting("General.syncMapViews") || false

  // Use either a shared key or a unique key based on the setting
  const viewStateKey = syncMaps
    ? "initialViewState"
    : `initialViewState_missions`

  const [initialViewState, setInitialViewState] = useLocalStorage({
    key: viewStateKey,
    defaultValue: { latitude: 53.381655, longitude: -1.481434, zoom: 17 },
    getInitialValueInEffect: false,
  })
  const previousPlannedHomePositionValue = usePrevious(plannedHomePosition)

  const [filteredMissionItems, setFilteredMissionItems] = useState([])

  const contextMenuRef = useRef()

  const clipboard = useClipboard({ timeout: 500 })

  const [polygonDrawMode, setPolygonDrawMode] = useState(false)
  const [polygonPoints, setPolygonPoints] = useState([])

  const selectedDistanceMeasurementId =
    typeof contextMenuState?.markerId === "string" &&
    contextMenuState.markerId.startsWith("distance:")
      ? contextMenuState.markerId.split(":")[1]
      : null

  const [addPoiMarkerModalOpened, setAddPoiMarkerModalOpened] = useState(false)

  useEffect(() => {
    const closeContextMenu = () =>
      dispatch(updateContextMenuState({ isOpen: false }))

    document.addEventListener("click", closeContextMenu)
    return () => {
      document.removeEventListener("click", closeContextMenu)
    }
  }, [])

  useEffect(() => {
    // Check latest gpsData point is valid
    if (
      isNaN(gpsData.lat) ||
      isNaN(gpsData.lon) ||
      gpsData.lon === 0 ||
      gpsData.lat === 0
    )
      return

    // Move drone icon on map
    let lat = intToCoord(gpsData.lat)
    let lon = intToCoord(gpsData.lon)
    setPosition({ latitude: lat, longitude: lon })
  }, [gpsData])

  useEffect(() => {
    setFilteredMissionItems(filterMissionItems(missionItems))
  }, [missionItems])

  useEffect(() => {
    if (contextMenuRef.current) {
      const boundingRect = contextMenuRef.current.getBoundingClientRect()
      dispatch(
        updateContextMenuState({
          menuSize: {
            width: Math.round(boundingRect.width),
            height: Math.round(boundingRect.height),
          },
        }),
      )
    }
  }, [contextMenuRef.current])

  useEffect(() => {
    // center map on home point only on first instance of home point being
    // received from the drone
    if (
      passedRef.current &&
      plannedHomePosition !== null &&
      previousPlannedHomePositionValue === null
    ) {
      setInitialViewState({
        latitude: intToCoord(plannedHomePosition.lat),
        longitude: intToCoord(plannedHomePosition.lon),
        zoom: initialViewState.zoom,
      })
      passedRef.current.getMap().flyTo({
        center: [
          intToCoord(plannedHomePosition.lon),
          intToCoord(plannedHomePosition.lat),
        ],
        zoom: initialViewState.zoom,
      })
    }
  }, [plannedHomePosition])

  function addNewPolygonVertex(lat, lon) {
    if (!polygonDrawMode) return

    // Add new point to polygon points
    setPolygonPoints((prevPoints) => [
      ...prevPoints,
      { id: uuidv4(), lat: lat, lon: lon },
    ])
  }

  function updatePolygonVertex(updatedPolygonVertex) {
    setPolygonPoints((prevPoints) =>
      prevPoints.map((item) =>
        item.id === updatedPolygonVertex.id
          ? {
              ...item,
              lat: intToCoord(updatedPolygonVertex.x),
              lon: intToCoord(updatedPolygonVertex.y),
            }
          : item,
      ),
    )
  }

  function convertPolygonToFenceItems(fenceType) {
    if (polygonPoints.length < 3) {
      showNotification("Polygon must have at least 3 points to be valid")
      return
    }

    const fenceItems = polygonPoints.map((point, index) => ({
      id: point.id,
      command: fenceType === "inclusion" ? 5001 : 5002, // 5001 for inclusion, 5002 for exclusion
      param1: polygonPoints.length, // Number of points in the polygon
      param2: 0,
      param3: 0,
      param4: 0,
      x: coordToInt(point.lat),
      y: coordToInt(point.lon),
      z: index,
      frame: getFrameKey("MAV_FRAME_GLOBAL_RELATIVE_ALT"),
      mission_type: 1,
    }))

    dispatch(createFencePolygon(fenceItems))
    setPolygonPoints([])
    setPolygonDrawMode(false)
  }

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
          padding: 50,
        },
      )
    }
  }

  function zoomToPlannedHome() {
    if (passedRef.current && plannedHomePosition) {
      passedRef.current.getMap().flyTo({
        center: [
          intToCoord(plannedHomePosition.lon),
          intToCoord(plannedHomePosition.lat),
        ],
        zoom: 17,
      })
    }
  }

  function measureDistance() {
    if (measureDistanceStart === null) {
      dispatch(
        setMissionDistanceMeasurementDraftStart(contextMenuState.gpsCoords),
      )
      showInfoNotification('Click "Measure distance" again to finish measuring')
    } else {
      dispatch(
        addMissionDistanceMeasurement({
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
    dispatch(clearMissionDistanceMeasurementDraftStart())
  }

  function openElevationGraph() {
    onOpenElevationGraph?.()
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
            updateContextMenuState({
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
          // get map container
          const canvas = e.target.getCanvas()
          // use helper to get point inside container
          const pt = getContainerPointFromEvent(e.originalEvent ?? e, canvas)
          dispatch(
            updateContextMenuState({
              isOpen: true,
              position: pt,
              gpsCoords: e.lngLat,
              markerId: null,
            }),
          )
        }}
        onMouseDown={() => {
          dispatch(updateContextMenuState({ isOpen: false }))
        }}
        onClick={(e) => {
          dispatch(updateContextMenuState({ isOpen: false }))
          let lat = e.lngLat.lat
          let lon = e.lngLat.lng

          if (polygonDrawMode) {
            addNewPolygonVertex(lat, lon)
          } else {
            dispatch(
              createNewDefaultDrawingItem({
                x: coordToInt(lat),
                y: coordToInt(lon),
              }),
            )
          }
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

        <Polygon
          polygonPoints={polygonPoints}
          editable={polygonDrawMode}
          dragEndCallback={updatePolygonVertex}
        />

        <MissionItems missionItems={missionItems} />

        <FenceItems fenceItems={fenceItems} />

        {/* Show mission rally point */}
        {rallyItems.map((item, index) => {
          return (
            <MarkerPin
              key={index}
              id={item.id}
              lat={intToCoord(item.x)}
              lon={intToCoord(item.y)}
              colour={tailwindColors.purple[400]}
              text={`${item.seq}`}
              tooltipText={item.z ? `Alt: ${item.z}` : null}
              draggable={currentTab === "rally"}
            />
          )
        })}

        {flightModeString === "Guided" && guidedModePinData !== null && (
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
        {plannedHomePosition !== null && (
          <HomeMarker
            lat={intToCoord(plannedHomePosition.lat)}
            lon={intToCoord(plannedHomePosition.lon)}
            updateMissionHomePositionDragCb={({ x, y }) => {
              dispatch(
                setPlannedHomePosition({
                  lat: coordToInt(x),
                  lon: coordToInt(y),
                }),
              )
            }}
          />
        )}

        <DistanceMeasurementMarkers
          measureDistanceStart={measureDistanceStart}
          distanceMeasurements={distanceMeasurements}
        />

        <POIMarkersContainer />

        <div className="absolute z-30 top-2 left-2">
          <KmlLayersControl mapRef={passedRef} position="right-start" />
        </div>

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
            <ContextMenuItem
              onClick={() => {
                clipboard.copy(
                  `${contextMenuState.gpsCoords.lat}, ${contextMenuState.gpsCoords.lng}`,
                )
                showNotification("Copied to clipboard")
              }}
            >
              <p>
                {contextMenuState.gpsCoords.lat.toFixed(coordsFractionDigits)},{" "}
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
            </ContextMenuItem>
            {contextMenuState.markerId !== null &&
              contextMenuState.markerId !== undefined &&
              contextMenuState.markerId !== "home" &&
              !String(contextMenuState.markerId).startsWith("distance:") && (
                <>
                  <Divider />
                  <ContextMenuItem
                    onClick={() =>
                      dispatch(removeDrawingItem(contextMenuState.markerId))
                    }
                  >
                    <p>Delete waypoint</p>
                  </ContextMenuItem>
                </>
              )}
            <ContextMenuSpecificCommandItems />
            <Divider />
            <ContextMenuItem onClick={zoomToDrone}>
              <p>Zoom to drone</p>
            </ContextMenuItem>
            <ContextMenuItem onClick={zoomToMission}>
              <p>Zoom to mission</p>
            </ContextMenuItem>
            <ContextMenuItem onClick={zoomToPlannedHome}>
              <p>Zoom to planned home</p>
            </ContextMenuItem>
            <Divider />
            {contextMenuState?.markerId === "home" ? (
              <ContextMenuItem
                onClick={() => {
                  dispatch(setPlannedHomePositionToDronesHomePositionThunk())
                }}
              >
                <p>Set planned home to drone's home position</p>
              </ContextMenuItem>
            ) : (
              <ContextMenuItem
                onClick={() => {
                  dispatch(
                    setPlannedHomePosition({
                      lat: coordToInt(contextMenuState.gpsCoords.lat),
                      lon: coordToInt(contextMenuState.gpsCoords.lng),
                    }),
                  )
                }}
              >
                <p>Set planned home position</p>
              </ContextMenuItem>
            )}
            <ContextMenuItem onClick={() => dispatch(clearDrawingItems())}>
              <p>Clear mission</p>
            </ContextMenuItem>
            <Divider />
            <ContextMenuItem onClick={measureDistance}>
              <p>Measure distance</p>
            </ContextMenuItem>
            {selectedDistanceMeasurementId && (
              <ContextMenuItem
                onClick={() => {
                  dispatch(
                    removeMissionDistanceMeasurement(
                      selectedDistanceMeasurementId,
                    ),
                  )
                  stopMeasureDistance()
                }}
              >
                <p>Delete distance measurement</p>
              </ContextMenuItem>
            )}
            <ContextMenuItem onClick={openElevationGraph}>
              <p>Elevation graph</p>
            </ContextMenuItem>
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
            <Divider />
            <ContextMenuSubMenuItem title={"Polygon"}>
              <ContextMenuItem
                onClick={() => {
                  setPolygonDrawMode(true)
                }}
              >
                <p>Draw polygon</p>
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => {
                  setPolygonPoints([])
                  setPolygonDrawMode(false)
                }}
              >
                <p>Clear polygon</p>
              </ContextMenuItem>
              {currentTab === "fence" && (
                <>
                  <ContextMenuItem
                    onClick={() => {
                      convertPolygonToFenceItems("inclusion")
                    }}
                  >
                    <p>Fence inclusion</p>
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => {
                      convertPolygonToFenceItems("exclusion")
                    }}
                  >
                    <p>Fence exclusion</p>
                  </ContextMenuItem>
                </>
              )}
            </ContextMenuSubMenuItem>
          </div>
        )}
      </Map>
    </div>
  )
}

function propsAreEqual(prev, next) {
  return JSON.stringify(prev) === JSON.stringify(next)
}
const MissionsMapSection = React.memo(MapSectionNonMemo, propsAreEqual)

export default MissionsMapSection
