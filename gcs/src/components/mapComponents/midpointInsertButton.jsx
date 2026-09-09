/*
  A small button rendered at a map midpoint for inserting a new point.
*/

import { Marker } from "react-map-gl"

export default function MidpointInsertButton({
  lat,
  lon,
  colour,
  tooltipText,
  onClick,
}) {
  return (
    <Marker latitude={lat} longitude={lon} offset={[0, 0]}>
      <div
        onMouseDown={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onClick?.()
        }}
        className="pointer-events-auto"
      >
        <button
          type="button"
          title={tooltipText}
          aria-label={tooltipText}
          className="flex h-4 w-4 items-center justify-center rounded-full border border-black/30 text-[1rem] text-black font-bold"
          style={{ backgroundColor: colour }}
        >
          +
        </button>
      </div>
    </Marker>
  )
}
