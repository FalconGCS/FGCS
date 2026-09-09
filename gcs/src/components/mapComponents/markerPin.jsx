/*
  A component to display a marker pin on a map
*/

// Base imports
import React from "react"

// Map and mantine imports
import { Tooltip } from "@mantine/core"
import { Marker } from "react-map-gl"
import { useDispatch, useSelector } from "react-redux"
import resolveConfig from "tailwindcss/resolveConfig"
import tailwindConfig from "../../../tailwind.config"
import { coordToInt } from "../../helpers/dataFormatters"
import { getContainerPointFromEvent } from "../../helpers/pointer"
import { updateDashboardContextMenuState } from "../../redux/slices/dashboardSlice"
import { selectCurrentPage } from "../../redux/slices/droneConnectionSlice"
import {
  updateContextMenuState,
  updateDrawingItem,
} from "../../redux/slices/missionSlice"

const tailwindColors = resolveConfig(tailwindConfig).theme.colors

// The halo geometry, shared by the return path ring and the hover highlight.
// Concentric with the pin head, whose circle the path puts at (12, 11) with a
// radius of 8 -- the halo needs the same centre or it reads as lopsided. It
// extends past the 0..24 viewBox, so the svg below sets overflow visible.
const HALO = { cx: "12", cy: "11", r: "10.5", strokeWidth: "2" }

const MarkerPin = React.memo(
  ({
    id,
    lat,
    lon,
    colour,
    text = null,
    tooltipText = null,
    showOnTop = false,
    draggable = false,
    dragEndCallback = null,
    ringed = false,
    // Called with true/false as the pointer enters and leaves, for callers that
    // want to reflect the hover somewhere else
    onHoverChange = null,
    // Draws the pin standing out from its neighbours, for a hover that
    // originated elsewhere
    highlighted = false,
  }) => {
    const dispatch = useDispatch()
    const currentPage = useSelector(selectCurrentPage)

    return (
      <div
        onMouseEnter={() => onHoverChange?.(true)}
        onMouseLeave={() => onHoverChange?.(false)}
        onMouseDown={(e) => {
          // Prevent right-click from initiating a drag on the marker
          if (e.button === 2) {
            e.preventDefault()
            e.stopPropagation()
          }
        }}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          // get map container
          const container = e.currentTarget.closest(
            ".maplibregl-map, .mapboxgl-map",
          )
          // use helper to get point inside container
          const pt = getContainerPointFromEvent(e.nativeEvent, container)

          // Dispatch to the appropriate context menu based on the type
          const contextMenuAction =
            currentPage === "dashboard"
              ? updateDashboardContextMenuState
              : updateContextMenuState

          dispatch(
            contextMenuAction({
              isOpen: true,
              position: { x: pt.x, y: pt.y },
              gpsCoords: { lat: lat, lng: lon },
              markerId: id,
            }),
          )
        }}
      >
        <Marker
          latitude={lat}
          longitude={lon}
          className={(showOnTop || highlighted) && "z-10"}
          offset={[0, -15]}
          draggable={draggable}
          onDragEnd={(e) => {
            if (dragEndCallback !== null) {
              dragEndCallback({ x: e.lngLat.lat, y: e.lngLat.lng })
            } else {
              dispatch(
                updateDrawingItem({
                  id: id,
                  x: coordToInt(e.lngLat.lat),
                  y: coordToInt(e.lngLat.lng),
                }),
              )
            }
          }}
        >
          <Tooltip disabled={tooltipText === null} label={tooltipText}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="34"
              height="34"
              viewBox="0 0 24 24"
              overflow="visible"
              fill={colour}
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="icon icon-tabler icons-tabler-outline icon-tabler-map-pin text-black"
            >
              {(highlighted || ringed) && (
                <circle
                  {...HALO}
                  fill="none"
                  stroke={highlighted ? tailwindColors.falconred[700] : "white"}
                />
              )}
              <path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0z" />
              {text && (
                <text textAnchor="middle" x="12" y="14" className="text-black">
                  {text}
                </text>
              )}
            </svg>
          </Tooltip>
        </Marker>
      </div>
    )
  },
  (prevProps, nextProps) => {
    return JSON.stringify(prevProps) === JSON.stringify(nextProps)
  },
)

export default MarkerPin
