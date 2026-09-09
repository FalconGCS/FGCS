/*
A custom component for each message card (seen at the bottom of the screen on FLA).
This holds information about the colour of the line, and its mean, max, min.
*/

import { colorInputSwatch } from "./constants.js"

// 3rd Party Imports
import { ActionIcon, Box, ColorInput } from "@mantine/core"
import { IconPaint, IconTrash } from "@tabler/icons-react"
import { memo, useCallback } from "react"
import { useDispatch, useSelector } from "react-redux"

// Redux imports
import {
  selectCustomColors,
  selectMessageFilters,
  setCanSavePreset,
  setCustomColors,
  setMessageFilters,
  setPersistentColorMapEntry,
} from "../../redux/slices/logAnalyserSlice.js"

function ChartDataCard({ item, unit, messageMeans }) {
  const dispatch = useDispatch()
  const messageFilters = useSelector(selectMessageFilters)
  const customColors = useSelector(selectCustomColors)

  // Change the color of the line
  const changeColor = useCallback(
    (label, color) => {
      // Early return if color hasn't actually changed
      if (customColors[label] === color) {
        return
      }

      const newColors = { ...customColors, [label]: color }
      dispatch(setCustomColors(newColors))
      dispatch(setPersistentColorMapEntry({ key: label, color }))
    },
    [customColors, dispatch],
  )

  // Turn off only one filter at a time
  const removeDataset = useCallback(
    (label) => {
      const [categoryName, fieldName] = label.split("/")

      // Early return if invalid
      if (
        !messageFilters[categoryName] ||
        messageFilters[categoryName][fieldName] === undefined
      ) {
        return
      }

      // Use shallow cloning for better performance
      const newFilters = {
        ...messageFilters,
        [categoryName]: {
          ...messageFilters[categoryName],
          [fieldName]: false,
        },
      }

      const newColors = { ...customColors }
      delete newColors[label]

      dispatch(setCustomColors(newColors))
      dispatch(setMessageFilters(newFilters))
      dispatch(setCanSavePreset(Object.keys(newColors).length > 0))
    },
    [messageFilters, customColors, dispatch],
  )

  return (
    <div className="inline-flex flex-col items-center gap-2 px-2 py-2 mr-3 text-xs font-bold text-white border border-gray-700 rounded-lg bg-grey-200">
      {/* Title and Delete Button */}
      <div className="inline-flex items-center content-center justify-between w-full">
        <p className="text-md flex-1 min-w-0 break-words">
          {item.label} <span className="text-gray-400">({unit})</span>
        </p>
        <ActionIcon
          variant="subtle"
          color={"red"}
          onClick={() => removeDataset(item.label)}
          className="self-start"
        >
          <IconTrash size={18} />
        </ActionIcon>
      </div>

      {/* Color Selector */}
      <ColorInput
        className="w-full text-xs"
        size="xs"
        format="hex"
        swatches={colorInputSwatch}
        closeOnColorSwatchClick
        withEyeDropper={false}
        value={customColors[item.label] || item.borderColor}
        rightSection={<IconPaint size={16} />}
        onChangeEnd={(color) => changeColor(item.label, color)}
      />

      {/* Min, max, mean */}
      <Box className="w-full text-gray-400 mt-auto">
        Min: {messageMeans[item.label]?.min}, Max:{" "}
        {messageMeans[item.label]?.max}, Mean: {messageMeans[item.label]?.mean}
      </Box>
    </div>
  )
}

export default memo(ChartDataCard)
