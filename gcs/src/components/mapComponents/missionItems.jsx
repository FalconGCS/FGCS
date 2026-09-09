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
  selectHoveredMissionItemSeq,
  selectPlannedHomePosition,
  setHoveredMissionItemSeq,
} from "../../redux/slices/missionSlice"

// Helper imports
import { coordToInt, intToCoord } from "../../helpers/dataFormatters"
import { filterMissionItems } from "../../helpers/filterMissions"
import { getLoiterRadiusMeters } from "../../helpers/loiterCommands"
import {
  BRANCH_END_COMMANDS,
  buildMissionPathSegments,
  getReturnPathGroupsBySeq,
  missionItemToCoord,
} from "../../helpers/missionPathSegments"

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

// One colour per return path, cycled if a mission has more return paths than
// colours. Avoids the hues already spoken for elsewhere on the map: yellow for
// ordinary mission items, red and blue for fences, purple for rally points,
// pink for the guided mode pin and violet for the GPS track.
const RETURN_PATH_COLOURS = [
  tailwindColors.green[400],
  tailwindColors.cyan[400],
  tailwindColors.orange[400],
  tailwindColors.fuchsia[400],
  tailwindColors.teal[300],
  tailwindColors.sky[400],
]

function getMidpointCoordinates(startItem, endItem) {
  return midpoint(
    point(missionItemToCoord(startItem)),
    point(missionItemToCoord(endItem)),
  ).geometry.coordinates
}

/*
  The solid lines (mission branches and jump legs) and the dotted ones (the
  unflown hops to and from home) for a mission, as lists of line coordinates.
*/
function getListOfLineCoordinates(
  missionItems,
  positionalItems,
  homePosition,
  takeoffWaypoint,
) {
  if (positionalItems.length === 0) return { solid: [], dotted: [] }

  const homeCoord = homePosition
    ? [intToCoord(homePosition.lon), intToCoord(homePosition.lat)]
    : null

  const { branches, jumpLegs } = buildMissionPathSegments(
    missionItems,
    positionalItems,
    homeCoord,
  )

  const dottedLineSegmentsList = []
  const firstItem = positionalItems[0]
  const lastItem = positionalItems[positionalItems.length - 1]
  const hasRtlMissionItem = missionItems.some((item) => item.command === 20)

  // Use home as the starting point
  if (homeCoord !== null) {
    if (
      takeoffWaypoint !== undefined &&
      takeoffWaypoint.seq < firstItem.seq // If the takeoff waypoint is before the first displayed waypoint
    ) {
      // If there is a takeoff waypoint before the first displayed waypoint, draw a solid line from the home position (takeoff point)
      if (branches.length > 0) {
        branches[0] = [homeCoord, ...branches[0]]
      } else {
        branches.push([homeCoord, missionItemToCoord(firstItem)])
      }
    } else {
      // Draw a dotted line from the home position to the first displayed waypoint
      dottedLineSegmentsList.push([homeCoord, missionItemToCoord(firstItem)])
    }
  }

  // If mission has no terminating land command, show return-to-home as dotted.
  if (![21, 189].includes(lastItem.command) && !hasRtlMissionItem) {
    const returnEndpoint = homeCoord || missionItemToCoord(firstItem)
    dottedLineSegmentsList.push([missionItemToCoord(lastItem), returnEndpoint])
  }

  return {
    solid: [...branches, ...jumpLegs],
    dotted: dottedLineSegmentsList,
  }
}

export default function MissionItems({ missionItems }) {
  const dispatch = useDispatch()
  const currentPage = useSelector(selectCurrentPage)
  const editable =
    useSelector(selectActiveTab) === "mission" && currentPage === "missions"
  const plannedHomePosition = useSelector(selectPlannedHomePosition)
  const currentHomePosition = useSelector(selectHomePosition)
  const hoveredMissionItemSeq = useSelector(selectHoveredMissionItemSeq)
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

  const { groupBySeq: returnPathGroupBySeq, entrySeqs: returnPathEntrySeqs } =
    useMemo(
      () => getReturnPathGroupsBySeq(missionItems, filteredMissionItems),
      [missionItems, filteredMissionItems],
    )

  function getMissionItemColour(item) {
    const returnPathIndex = returnPathGroupBySeq.get(item.seq)
    if (returnPathIndex === undefined) return tailwindColors.yellow[400]

    return RETURN_PATH_COLOURS[returnPathIndex % RETURN_PATH_COLOURS.length]
  }

  const missionPathItems = useMemo(() => {
    if (filteredMissionItems.length === 0) return []

    const stopCommandItem = [...missionItems]
      .filter((item) => BRANCH_END_COMMANDS.includes(item.command))
      .sort((a, b) => a.seq - b.seq)
      .at(0)

    return stopCommandItem
      ? filteredMissionItems.filter((item) => item.seq <= stopCommandItem.seq)
      : filteredMissionItems
  }, [filteredMissionItems, missionItems])

  const takeoffWaypoint = useMemo(() => {
    return missionItems.find((item) => item.command === 22)
  }, [missionItems])

  const { solid: listOfSolidLineSegments, dotted: listOfDottedLineSegments } =
    useMemo(
      () =>
        getListOfLineCoordinates(
          missionItems,
          filteredMissionItems,
          homePosition,
          takeoffWaypoint,
        ),
      [missionItems, filteredMissionItems, homePosition, takeoffWaypoint],
    )

  const loiterCircles = useMemo(() => {
    return displayedMissionItems
      .map((item) => {
        const radius = getLoiterRadiusMeters(item)
        if (radius === null) return null

        return circle(missionItemToCoord(item), radius, {
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
            colour={getMissionItemColour(item)}
            ringed={returnPathEntrySeqs.has(item.seq)}
            text={`${item.seq}`}
            tooltipText={item.z ? `Alt: ${item.z}` : null}
            draggable={editable}
            highlighted={hoveredMissionItemSeq === item.seq}
            onHoverChange={(isHovered) =>
              dispatch(setHoveredMissionItemSeq(isHovered ? item.seq : null))
            }
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

      {/* Show mission item outlines. Every branch and jump leg shares one
          source, so the map keeps a single layer however many the mission has */}
      <DrawLineCoordinates
        coordinates={listOfSolidLineSegments}
        multiLine
        colour={tailwindColors.yellow[400]}
        lineProps={{ "line-width": 2 }}
      />

      <DrawLineCoordinates
        coordinates={listOfDottedLineSegments}
        multiLine
        colour={tailwindColors.yellow[400]}
        lineProps={{ "line-width": 2, "line-dasharray": [4, 6] }}
      />
    </>
  )
}
