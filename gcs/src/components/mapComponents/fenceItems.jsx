/*
  The FenceItems component returns the markers and lines connecting the
  markers together on the map to display. It also filters out any
  items which should not be displayed on the map as markers or not have lines
  connecting them. It properly parses the type of fence marker.
*/

import { useMemo } from "react"

// Helper imports
import { coordToInt, intToCoord } from "../../helpers/dataFormatters"

// Styling imports
import "maplibre-gl/dist/maplibre-gl.css"

// Component imports

// Tailwind styling
import { circle, midpoint, point } from "@turf/turf"
import { Layer, Source } from "react-map-gl"
import { useDispatch, useSelector } from "react-redux"
import resolveConfig from "tailwindcss/resolveConfig"
import tailwindConfig from "../../../tailwind.config"
import { FENCE_ITEM_COMMANDS_LIST } from "../../helpers/mavlinkConstants"
import { selectCurrentPage } from "../../redux/slices/droneConnectionSlice"
import {
  insertFencePolygonVertex,
  selectActiveTab,
} from "../../redux/slices/missionSlice"
import DrawLineCoordinates from "./drawLineCoordinates"
import MarkerPin from "./markerPin"
import MidpointInsertButton from "./midpointInsertButton"
const tailwindColors = resolveConfig(tailwindConfig).theme.colors

function getFenceCommandNumber(value) {
  return parseInt(
    Object.keys(FENCE_ITEM_COMMANDS_LIST).filter(
      (key) => FENCE_ITEM_COMMANDS_LIST[key] === value,
    ),
  )
}

const polygonCommands = [
  getFenceCommandNumber("MAV_CMD_NAV_FENCE_POLYGON_VERTEX_INCLUSION"),
  getFenceCommandNumber("MAV_CMD_NAV_FENCE_POLYGON_VERTEX_EXCLUSION"),
]
const circleCommands = [
  getFenceCommandNumber("MAV_CMD_NAV_FENCE_CIRCLE_INCLUSION"),
  getFenceCommandNumber("MAV_CMD_NAV_FENCE_CIRCLE_EXCLUSION"),
]

export default function FenceItems({ fenceItems }) {
  const dispatch = useDispatch()
  const currentPage = useSelector(selectCurrentPage)
  const editable =
    useSelector(selectActiveTab) === "fence" && currentPage === "missions"

  const { fencePolygonGroups, fencePolygonItems, fenceCircleItems } =
    useMemo(() => {
      const polygonItems = []
      const circleItems = []
      const polygonGroups = []

      let currentGroup = []
      let currentGroupStartIndex = null

      fenceItems.forEach((item, index) => {
        if (polygonCommands.includes(item.command)) {
          const polygonItem = { ...item, fenceIndex: index }
          polygonItems.push(polygonItem)

          if (currentGroup.length === 0) {
            currentGroupStartIndex = index
          }

          currentGroup.push(polygonItem)

          if (currentGroup.length === item.param1) {
            polygonGroups.push({
              items: currentGroup,
              startIndex: currentGroupStartIndex,
            })
            currentGroup = []
            currentGroupStartIndex = null
          }

          return
        }

        if (circleCommands.includes(item.command)) {
          circleItems.push({ ...item, fenceIndex: index })
        }
      })

      return {
        fencePolygonGroups: polygonGroups,
        fencePolygonItems: polygonItems,
        fenceCircleItems: circleItems,
      }
    }, [fenceItems])

  const polygonEdgeInsertButtons = useMemo(() => {
    if (!editable) return []

    return fencePolygonGroups.flatMap((polygon) => {
      if (polygon.items.length < 2) return []

      return polygon.items.map((item, index) => {
        const nextItem = polygon.items[(index + 1) % polygon.items.length]
        const midpointCoords = midpoint(
          point([intToCoord(item.y), intToCoord(item.x)]),
          point([intToCoord(nextItem.y), intToCoord(nextItem.x)]),
        ).geometry.coordinates

        return {
          afterId: item.id,
          polygonStartIndex: polygon.startIndex,
          polygonLength: polygon.items.length,
          lat: midpointCoords[1],
          lon: midpointCoords[0],
          tooltipText: `Insert vertex between ${item.z + 1} and ${nextItem.z + 1}`,
        }
      })
    })
  }, [editable, fencePolygonGroups])

  return (
    <>
      {/* Show mission geo-fence MARKERS */}
      {fencePolygonItems.map((item, index) => {
        return (
          <MarkerPin
            key={item.id || index}
            id={item.id}
            lat={intToCoord(item.x)}
            lon={intToCoord(item.y)}
            colour={tailwindColors.blue[400]}
            draggable={editable}
          />
        )
      })}

      {polygonEdgeInsertButtons.map((button) => (
        <MidpointInsertButton
          key={`${button.afterId}:${button.polygonStartIndex}`}
          lat={button.lat}
          lon={button.lon}
          colour={tailwindColors.blue[400]}
          tooltipText={button.tooltipText}
          onClick={() => {
            dispatch(
              insertFencePolygonVertex({
                afterId: button.afterId,
                polygonStartIndex: button.polygonStartIndex,
                polygonLength: button.polygonLength,
                x: coordToInt(button.lat),
                y: coordToInt(button.lon),
              }),
            )
          }}
        />
      ))}

      {/* Group fencePolygonItems into separate polygons */}
      {(() => {
        return fencePolygonGroups.map((polygon, index) => {
          const lastPolygonItem = polygon.items[polygon.items.length - 1]

          const color =
            lastPolygonItem.command === 5002
              ? tailwindColors.red[500]
              : tailwindColors.blue[200]

          return (
            <DrawLineCoordinates
              key={index}
              coordinates={[
                ...polygon.items.map((item) => [
                  intToCoord(item.y),
                  intToCoord(item.x),
                ]),
                [
                  intToCoord(polygon.items[0].y),
                  intToCoord(polygon.items[0].x),
                ],
              ]}
              colour={color}
              lineProps={{ "line-width": 2, "line-dasharray": [4, 6] }}
              fillLayer={true}
              fillOpacity={lastPolygonItem.command === 5002 ? 0.2 : 0}
            />
          )
        })
      })()}

      {fenceCircleItems.map((item, index) => {
        return (
          <MarkerPin
            key={index}
            id={item.id}
            lat={intToCoord(item.x)}
            lon={intToCoord(item.y)}
            colour={tailwindColors.blue[400]}
            draggable={editable}
          />
        )
      })}

      <Source
        id="circle-source"
        type="geojson"
        data={{
          type: "FeatureCollection",
          features: fenceCircleItems.map((item) =>
            circle([intToCoord(item.y), intToCoord(item.x)], item.param1, {
              steps: 64, // Number of points to create the circle
              units: "meters", // Units for the radius
              properties: {
                color:
                  item.command === 5004
                    ? tailwindColors.red[500]
                    : tailwindColors.blue[200],
                fillOpacity: item.command === 5004 ? 0.2 : 0, // No fill if inclusion
              },
            }),
          ),
        }}
      >
        <Layer
          id="fence-circle-fill-layer"
          type="fill"
          paint={{
            "fill-color": ["get", "color"],
            "fill-opacity": ["get", "fillOpacity"],
          }}
        />
        <Layer
          id="fence-circle-border-layer"
          type="line"
          paint={{
            "line-color": ["get", "color"],
            "line-width": 2,
            "line-dasharray": [2, 2],
          }}
        />
      </Source>
    </>
  )
}
