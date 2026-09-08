/*
  A component to display a line or multiple lines given a list of coordinates
*/

import { Layer, Source } from "react-map-gl"

export default function DrawLineCoordinates({
  coordinates,
  colour,
  width = 1,
  lineProps = {},
  fillLayer = false,
  fillOpacity = 0.5,
  // Set when `coordinates` is a list of separate lines rather than one line, so
  // several disconnected lines can share a single source and layer
  multiLine = false,
}) {
  return (
    <Source
      type="geojson"
      data={{
        type: "Feature",
        properties: {},
        geometry: {
          type: multiLine ? "MultiLineString" : "LineString",
          coordinates,
        },
      }}
      buffer={512} // Attempt to increase buffer to remove fill layer clipping
    >
      <Layer
        {...{
          type: "line",
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": colour,
            "line-width": width,
            ...lineProps,
          },
        }}
      />
      {fillLayer && (
        <Layer
          type="fill"
          paint={{
            "fill-color": colour,
            "fill-opacity": fillOpacity,
          }}
          layout={{
            "fill-sort-key": 10,
          }}
        />
      )}
    </Source>
  )
}
