/*
  The MissionItems component returns the markers and lines connecting the
  markers together on the dashboard map to display. It also filters out any
  items which should not be displayed on the map as markers or not have lines
  connecting them.
*/
import { useMemo } from "react"
import { useDispatch, useSelector } from "react-redux"
import { selectCurrentPage } from "../../redux/slices/droneConnectionSlice"
import { selectHomePosition } from "../../redux/slices/droneInfoSlice"
import {
  insertDrawingItemAfter,
  selectActiveTab,
  selectPlannedHomePosition,
} from "../../redux/slices/missionSlice"

// Helper imports
import { coordToInt, intToCoord } from "../../helpers/dataFormatters"
import { filterMissionItems } from "../../helpers/filterMissions"

// Styling imports
import "maplibre-gl/dist/maplibre-gl.css"

// Component imports
import DrawLineCoordinates from "./drawLineCoordinates"
import MarkerPin from "./markerPin"
import MidpointInsertButton from "./midpointInsertButton"

// Tailwind styling
import { circle, midpoint, point } from "@turf/turf"
import { Layer, Source } from "react-map-gl"
import resolveConfig from "tailwindcss/resolveConfig"
import tailwindConfig from "../../../tailwind.config"

const tailwindColors = resolveConfig(tailwindConfig).theme.colors

const LOITER_RADIUS_PARAMS = {
  17: "param3", // MAV_CMD_NAV_LOITER_UNLIM
  18: "param3", // MAV_CMD_NAV_LOITER_TURNS
  19: "param3", // MAV_CMD_NAV_LOITER_TIME
  31: "param2", // MAV_CMD_NAV_LOITER_TO_ALT
}

export default function MissionItems({ missionItems }) {
  const dispatch = useDispatch()
  const currentPage = useSelector(selectCurrentPage)
  const editable =
    useSelector(selectActiveTab) === "mission" && currentPage === "missions"
  const plannedHomePosition = useSelector(selectPlannedHomePosition)
  const currentHomePosition = useSelector(selectHomePosition)
  const homePosition =
    currentPage === "missions" ? plannedHomePosition : currentHomePosition

  const filteredMissionItems = useMemo(
    () => filterMissionItems(missionItems),
    [missionItems],
  )

  const displayedMissionItems = useMemo(
    () => filteredMissionItems.filter((item) => item.command !== 20),
    [filteredMissionItems],
  )

  const missionPathItems = useMemo(() => {
    if (filteredMissionItems.length === 0) return []

    const stopCommandItem = [...missionItems]
      .filter((item) => [20, 21, 189].includes(item.command))
      .sort((a, b) => a.seq - b.seq)
      .at(0)

    return stopCommandItem
      ? filteredMissionItems.filter((item) => item.seq <= stopCommandItem.seq)
      : filteredMissionItems
  }, [filteredMissionItems, missionItems])

  const takeoffWaypoint = useMemo(() => {
    return missionItems.find((item) => item.command === 22)
  }, [missionItems])

  const { solid: listOfLineCoords, dotted: listOfDottedLineSegments } = useMemo(
    () => getListOfLineCoordinates(filteredMissionItems),
    [filteredMissionItems, homePosition, takeoffWaypoint],
  )

  const loiterCircles = useMemo(() => {
    return displayedMissionItems
      .filter((item) => item.command in LOITER_RADIUS_PARAMS)
      .map((item) => {
        const radius = Math.abs(
          Number(item[LOITER_RADIUS_PARAMS[item.command]]),
        )
        if (!Number.isFinite(radius) || radius === 0) return null

        return circle([intToCoord(item.y), intToCoord(item.x)], radius, {
          steps: 64,
          units: "meters",
        })
      })
      .filter(Boolean)
  }, [displayedMissionItems])

  const insertionMidpoints = useMemo(() => {
    if (!editable || missionPathItems.length < 2) return []

    return missionPathItems
      .slice(0, -1)
      .map((startItem, index) => {
        const endItem = missionPathItems[index + 1]

        const hasHiddenMissionItemsBetween = missionItems.some((item) => {
          if (item.seq <= startItem.seq || item.seq >= endItem.seq) {
            return false
          }

          const itemIsRenderedOnMap =
            item.x !== 0 && item.y !== 0 && item.command !== 20
          return !itemIsRenderedOnMap
        })

        if (hasHiddenMissionItemsBetween) {
          return null
        }

        const midpointCoords = getMidpointCoordinates(startItem, endItem)

        return {
          afterId: startItem.id,
          lat: midpointCoords[1],
          lon: midpointCoords[0],
          tooltipText: `Insert waypoint between ${startItem.seq} and ${endItem.seq}`,
        }
      })
      .filter(Boolean)
  }, [editable, missionPathItems])

  function getListOfLineCoordinates(filteredMissionItems) {
    if (filteredMissionItems.length === 0) return { solid: [], dotted: [] }

    const lineCoordsList = []
    const dottedLineSegmentsList = []
    const stopCommandItem = [...missionItems]
      .filter((item) => [20, 21, 189].includes(item.command))
      .sort((a, b) => a.seq - b.seq)
      .at(0)
    const rtlMissionItem =
      stopCommandItem && stopCommandItem.command === 20 ? stopCommandItem : null
    let homeCoord = null

    // Stop processing waypoints after first RTL/land command in mission sequence.
    const itemsToProcess = stopCommandItem
      ? filteredMissionItems.filter((item) => item.seq <= stopCommandItem.seq)
      : filteredMissionItems

    // Use home as the starting point
    if (homePosition) {
      homeCoord = [intToCoord(homePosition.lon), intToCoord(homePosition.lat)]
      if (
        takeoffWaypoint !== undefined &&
        takeoffWaypoint.seq < itemsToProcess[0].seq // If the takeoff waypoint is before the first displayed waypoint
      ) {
        // If there is a takeoff waypoint before the first displayed waypoint, draw a solid line from the home position (takeoff point)
        lineCoordsList.push(homeCoord)
      } else {
        // Draw a dotted line from the home position to the first displayed waypoint
        dottedLineSegmentsList.push([
          homeCoord,
          [intToCoord(itemsToProcess[0].y), intToCoord(itemsToProcess[0].x)],
        ])
      }
    }

    const itemsForConnectedPath = rtlMissionItem
      ? itemsToProcess.filter((item) => item.seq !== rtlMissionItem.seq)
      : itemsToProcess

    itemsForConnectedPath.forEach((item) => {
      lineCoordsList.push([intToCoord(item.y), intToCoord(item.x)])
    })

    // If mission has no terminating land command, show return-to-home as dotted.
    if (
      ![21, 189].includes(itemsToProcess[itemsToProcess.length - 1].command) &&
      !rtlMissionItem
    ) {
      const lastItemCoord = [
        intToCoord(itemsToProcess[itemsToProcess.length - 1].y),
        intToCoord(itemsToProcess[itemsToProcess.length - 1].x),
      ]

      const returnEndpoint = homeCoord || [
        intToCoord(itemsToProcess[0].y),
        intToCoord(itemsToProcess[0].x),
      ]

      dottedLineSegmentsList.push([lastItemCoord, returnEndpoint])
    }

    // If RTL is present, draw a solid line from the last positional waypoint back to home.
    if (rtlMissionItem && homeCoord && itemsForConnectedPath.length > 0) {
      lineCoordsList.push(homeCoord)
    }

    // Connect jump commands to previously displayed item and jump target item
    const jumpCommandItems = missionItems.filter(
      (item) =>
        item.command === 177 &&
        (!stopCommandItem || item.seq <= stopCommandItem.seq),
    )
    jumpCommandItems.forEach((jumpItem) => {
      const nextItem = itemsToProcess.find((item) => {
        return item.seq === jumpItem.param1
      })
      if (nextItem === undefined) return

      const lastFilteredItem = itemsToProcess
        .filter((item) => item.seq < jumpItem.seq)
        .at(-1)
      if (!lastFilteredItem) return

      lineCoordsList.push([
        intToCoord(lastFilteredItem.y),
        intToCoord(lastFilteredItem.x),
      ])
      lineCoordsList.push([intToCoord(nextItem.y), intToCoord(nextItem.x)])
    })

    return { solid: lineCoordsList, dotted: dottedLineSegmentsList }
  }

  function getMidpointCoordinates(startItem, endItem) {
    return midpoint(
      point([intToCoord(startItem.y), intToCoord(startItem.x)]),
      point([intToCoord(endItem.y), intToCoord(endItem.x)]),
    ).geometry.coordinates
  }

  return (
    <>
      <Source
        id="loiter-radius-source"
        type="geojson"
        data={{
          type: "FeatureCollection",
          features: loiterCircles,
        }}
      >
        <Layer
          id="loiter-radius-layer"
          type="line"
          paint={{
            "line-color": tailwindColors.yellow[400],
            "line-width": 2,
            "line-dasharray": [2, 2],
          }}
        />
      </Source>

      {/* Show mission item LABELS */}
      {displayedMissionItems.map((item, index) => {
        return (
          <MarkerPin
            key={index}
            id={item.id}
            lat={intToCoord(item.x)}
            lon={intToCoord(item.y)}
            colour={tailwindColors.yellow[400]}
            text={`${item.seq}`}
            tooltipText={item.z ? `Alt: ${item.z}` : null}
            draggable={editable}
          />
        )
      })}

      {insertionMidpoints.map((midpointItem) => (
        <MidpointInsertButton
          key={midpointItem.afterId}
          lat={midpointItem.lat}
          lon={midpointItem.lon}
          colour={tailwindColors.yellow[400]}
          tooltipText={midpointItem.tooltipText}
          onClick={() => {
            const afterItem = missionPathItems.find(
              (item) => item.id === midpointItem.afterId,
            )

            if (!afterItem) return

            dispatch(
              insertDrawingItemAfter({
                afterId: afterItem.id,
                x: coordToInt(midpointItem.lat),
                y: coordToInt(midpointItem.lon),
              }),
            )
          }}
        />
      ))}

      {/* Show mission item outlines */}
      <DrawLineCoordinates
        coordinates={listOfLineCoords}
        colour={tailwindColors.yellow[400]}
        lineProps={{ "line-width": 2 }}
      />

      {listOfDottedLineSegments.map((segment, index) => (
        <DrawLineCoordinates
          key={index}
          coordinates={segment}
          colour={tailwindColors.yellow[400]}
          lineProps={{ "line-width": 2, "line-dasharray": [4, 6] }}
        />
      ))}
    </>
  )
}
