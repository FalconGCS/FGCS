/*
  A component to display a marker pin on a map
*/

// Base imports
import React from "react"

// Map and mantine imports
import { Tooltip } from "@mantine/core"
import { Marker } from "react-map-gl"
import { useDispatch, useSelector } from "react-redux"
import { coordToInt } from "../../helpers/dataFormatters"
import { getContainerPointFromEvent } from "../../helpers/pointer"
import { updateDashboardContextMenuState } from "../../redux/slices/dashboardSlice"
import { selectCurrentPage } from "../../redux/slices/droneConnectionSlice"
import {
  updateContextMenuState,
  updateDrawingItem,
} from "../../redux/slices/missionSlice"

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
  }) => {
    const dispatch = useDispatch()
    const currentPage = useSelector(selectCurrentPage)

    return (
      <div
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
          className={showOnTop && "z-10"}
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
              fill={colour}
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="icon icon-tabler icons-tabler-outline icon-tabler-map-pin text-black"
            >
              {ringed && (
                <circle
                  cx="12"
                  cy="10"
                  r="10.5"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
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
