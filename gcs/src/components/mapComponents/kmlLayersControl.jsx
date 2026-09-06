// 3rd Party Imports
import {
  ActionIcon,
  Button,
  ColorInput,
  Popover,
  ScrollArea,
  Text,
  Tooltip,
} from "@mantine/core"
import {
  IconEye,
  IconEyeOff,
  IconPaintOff,
  IconStack2,
  IconTrash,
  IconZoomIn,
} from "@tabler/icons-react"
import { useState } from "react"
import { useDispatch, useSelector } from "react-redux"

// Helper imports
import { useImportKmlLayers } from "../../helpers/kmlLayers"
import { showErrorNotification } from "../../helpers/notification"
import GetOutsideVisibilityColor from "../../helpers/outsideVisibility"

// Redux
import {
  removeKmlLayer,
  selectKmlLayers,
  setKmlLayerColourOverride,
  toggleKmlLayerVisibility,
} from "../../redux/slices/kmlSlice"

import { colorInputSwatch } from "../fla/constants"

function KmlLayerTile({ layer, onZoomTo }) {
  const dispatch = useDispatch()

  async function deleteLayer() {
    let result
    try {
      result = await window.ipcRenderer.invoke("kml:delete", layer.id)
    } catch {
      console.log("IPC Call Failed: kml:delete")
      showErrorNotification(`Could not delete ${layer.name}`)
      return
    }

    if (result?.error) {
      showErrorNotification(`Could not delete ${layer.name}: ${result.error}`)
      return
    }

    dispatch(removeKmlLayer(layer.id))
  }

  return (
    <div
      className="p-2 border rounded-md border-falcongrey-700 bg-falcongrey-900"
      data-testid={`kml-layer-${layer.name}`}
    >
      <div className="flex flex-row items-center justify-between gap-2 mb-1">
        <Tooltip label={layer.originalPath}>
          <div className="min-w-0 text-xs font-semibold truncate text-slate-200">
            {layer.name}
          </div>
        </Tooltip>
        <div className="text-xs shrink-0 text-slate-500">
          {layer.featureCount}
        </div>
      </div>

      <div className="flex flex-row items-center gap-1">
        <ColorInput
          className="flex-1 min-w-0 text-xs"
          size="xs"
          format="hex"
          swatches={colorInputSwatch}
          closeOnColorSwatchClick
          withEyeDropper={false}
          placeholder="KML colours"
          value={layer.colourOverride ?? ""}
          onChangeEnd={(colour) =>
            dispatch(
              setKmlLayerColourOverride({
                id: layer.id,
                colour: colour || null,
              }),
            )
          }
        />

        <Tooltip label="Use the colours from the KML file">
          <ActionIcon
            size="sm"
            variant="subtle"
            aria-label="Use the colours from the KML file"
            className="text-slate-400 hover:text-slate-200"
            disabled={layer.colourOverride === null}
            onClick={() =>
              dispatch(
                setKmlLayerColourOverride({ id: layer.id, colour: null }),
              )
            }
          >
            <IconPaintOff size={16} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label={layer.visible ? "Hide layer" : "Show layer"}>
          <ActionIcon
            size="sm"
            variant="subtle"
            aria-label={layer.visible ? "Hide layer" : "Show layer"}
            className="text-slate-400 hover:text-slate-200"
            onClick={() => dispatch(toggleKmlLayerVisibility(layer.id))}
          >
            {layer.visible ? <IconEye size={16} /> : <IconEyeOff size={16} />}
          </ActionIcon>
        </Tooltip>

        <Tooltip label="Zoom to layer">
          <ActionIcon
            size="sm"
            variant="subtle"
            aria-label="Zoom to layer"
            className="text-slate-400 hover:text-slate-200"
            onClick={() => onZoomTo(layer)}
          >
            <IconZoomIn size={16} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label="Delete layer">
          <ActionIcon
            size="sm"
            variant="subtle"
            color="red"
            aria-label="Delete layer"
            onClick={deleteLayer}
          >
            <IconTrash size={16} />
          </ActionIcon>
        </Tooltip>
      </div>
    </div>
  )
}

export default function KmlLayersControl({ mapRef, position = "left-start" }) {
  const layers = useSelector(selectKmlLayers)
  const importKmlLayers = useImportKmlLayers()
  const [opened, setOpened] = useState(false)
  const outsideVisibilityColor = GetOutsideVisibilityColor()

  function zoomToLayer(layer) {
    if (!mapRef.current) return

    const [minLng, minLat, maxLng, maxLat] = layer.bbox

    if (minLng === maxLng && minLat === maxLat) {
      mapRef.current.getMap().flyTo({ center: [minLng, minLat], zoom: 17 })
      return
    }

    mapRef.current.getMap().fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding: 100 },
    )
  }

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position={position}
      offset={8}
      width={340}
      withArrow
      shadow="md"
    >
      <Popover.Target>
        <ActionIcon
          aria-label="KML overlays"
          title="KML overlays"
          onClick={() => setOpened((isOpened) => !isOpened)}
        >
          <IconStack2 />
        </ActionIcon>
      </Popover.Target>

      <Popover.Dropdown
        p={0}
        onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: outsideVisibilityColor, border: "none" }}
        data-testid="kml-panel"
      >
        <div className="flex flex-col gap-2 p-2">
          <div className="flex flex-row items-center justify-between">
            <Text size="sm">KML overlays</Text>
            <Text size="xs" c="dimmed">
              {layers.length} loaded
            </Text>
          </div>

          <Button size="xs" fullWidth onClick={importKmlLayers}>
            Load KML
          </Button>

          {layers.length === 0 ? (
            <Text size="xs" c="dimmed">
              No KML files loaded
            </Text>
          ) : (
            <ScrollArea.Autosize mah={340} type="auto">
              <div className="flex flex-col gap-2">
                {layers.map((layer) => (
                  <KmlLayerTile
                    key={layer.id}
                    layer={layer}
                    onZoomTo={zoomToLayer}
                  />
                ))}
              </div>
            </ScrollArea.Autosize>
          )}
        </div>
      </Popover.Dropdown>
    </Popover>
  )
}
