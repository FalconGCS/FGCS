import { useEffect, useMemo, useState } from "react"
import { Layer, Marker, Source, useMap } from "react-map-gl"
import { useSelector } from "react-redux"

import { DEFAULT_KML_COLOUR } from "../../helpers/kml"
import { selectKmlLayers } from "../../redux/slices/kmlSlice"

// How close the cursor has to be, in pixels, for a placemark to count as
// hovered
const HOVER_HIT_RADIUS_PX = 4

// Stops a label becoming unreadable where a lot of layers overlap
const MAX_HOVER_LABELS = 6

function KmlLayer({ layer }) {
  const colour = layer.colourOverride
  const visibility = layer.visible ? "visible" : "none"

  // Hidden layers are kept on the map rather than unmounted
  const paint = useMemo(
    () => ({
      fill: {
        "fill-color": colour ?? [
          "coalesce",
          ["get", "fill"],
          DEFAULT_KML_COLOUR,
        ],
        "fill-opacity": [
          "to-number",
          ["coalesce", ["get", "fill-opacity"], 0.25],
        ],
      },
      line: {
        "line-color": colour ?? [
          "coalesce",
          ["get", "stroke"],
          DEFAULT_KML_COLOUR,
        ],
        "line-width": ["to-number", ["coalesce", ["get", "stroke-width"], 2]],
        "line-opacity": [
          "to-number",
          ["coalesce", ["get", "stroke-opacity"], 1],
        ],
      },
      circle: {
        "circle-radius": 5,
        "circle-color": colour ?? [
          "coalesce",
          ["get", "fill"],
          ["get", "stroke"],
          DEFAULT_KML_COLOUR,
        ],
        "circle-stroke-width": 1,
        "circle-stroke-color": "#ffffff",
      },
    }),
    [colour],
  )

  return (
    <Source
      id={`kml-src-${layer.id}`}
      type="geojson"
      data={layer.geojson}
      buffer={512}
    >
      <Layer
        id={`kml-fill-${layer.id}`}
        type="fill"
        filter={["match", ["geometry-type"], ["Polygon"], true, false]}
        layout={{ visibility }}
        paint={paint.fill}
      />
      <Layer
        id={`kml-line-${layer.id}`}
        type="line"
        filter={[
          "match",
          ["geometry-type"],
          ["LineString", "Polygon"],
          true,
          false,
        ]}
        layout={{
          "line-join": "round",
          "line-cap": "round",
          visibility,
        }}
        paint={paint.line}
      />
      <Layer
        id={`kml-point-${layer.id}`}
        type="circle"
        filter={["match", ["geometry-type"], ["Point"], true, false]}
        layout={{ visibility }}
        paint={paint.circle}
      />
    </Source>
  )
}

export default function KmlLayers() {
  const layers = useSelector(selectKmlLayers)
  const { current: map } = useMap()
  const [hoveredFeature, setHoveredFeature] = useState(null)

  const hoverLayerIds = useMemo(
    () =>
      layers
        .filter((layer) => layer.visible)
        .flatMap((layer) => [
          `kml-fill-${layer.id}`,
          `kml-line-${layer.id}`,
          `kml-point-${layer.id}`,
        ]),
    [layers],
  )

  useEffect(() => {
    if (!map || hoverLayerIds.length === 0) {
      setHoveredFeature(null)
      return
    }

    function onMouseMove(e) {
      const { x, y } = e.point

      // Layers which have been hidden aren't rendered, so they never match here
      const features = map.queryRenderedFeatures(
        [
          [x - HOVER_HIT_RADIUS_PX, y - HOVER_HIT_RADIUS_PX],
          [x + HOVER_HIT_RADIUS_PX, y + HOVER_HIT_RADIUS_PX],
        ],
        { layers: hoverLayerIds },
      )

      const names = [
        ...new Set(
          features
            .map((feature) => feature.properties?.name)
            .filter((name) => name),
        ),
      ].slice(0, MAX_HOVER_LABELS)

      setHoveredFeature(names.length > 0 ? { names, lngLat: e.lngLat } : null)
    }

    function onMouseOut() {
      setHoveredFeature(null)
    }

    map.on("mousemove", onMouseMove)
    map.on("mouseout", onMouseOut)

    return () => {
      map.off("mousemove", onMouseMove)
      map.off("mouseout", onMouseOut)
    }
  }, [map, hoverLayerIds])

  return (
    <>
      {layers.map((layer) => (
        <KmlLayer key={layer.id} layer={layer} />
      ))}

      {hoveredFeature !== null && (
        <Marker
          latitude={hoveredFeature.lngLat.lat}
          longitude={hoveredFeature.lngLat.lng}
          anchor="bottom"
          offset={[0, -12]}
          style={{ pointerEvents: "none" }}
        >
          <div className="flex flex-col px-2 py-1 text-xs rounded-md bg-falcongrey-700/90 text-slate-200">
            {hoveredFeature.names.map((name) => (
              <span key={name}>{name}</span>
            ))}
          </div>
        </Marker>
      )}
    </>
  )
}
