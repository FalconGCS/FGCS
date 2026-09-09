/*
  Holds each element for the preset accordion including the buttons to select them.
  Preset Selection and Deletion logic is also handled here.
*/

// 3rd Party Imports
import {
  Accordion,
  ActionIcon,
  Button,
  Tooltip as MantineTooltip,
} from "@mantine/core"
import { IconInfoCircle, IconTrash } from "@tabler/icons-react"
import _ from "lodash"
import { colorPalette } from "./constants.js"

import { useMemo } from "react"
import { useDispatch, useSelector } from "react-redux"
import {
  showErrorNotification,
  showSuccessNotification,
} from "../../helpers/notification.js"
import {
  selectAircraftType,
  // Selectors
  selectColorIndex,
  selectLogType,
  selectMessageFilters,
  selectPersistentColorMap,
  setCanSavePreset,
  setColorIndex,
  setCustomColors,
  setMessageFilters,
  setPersistentColorMapEntry,
} from "../../redux/slices/logAnalyserSlice.js"

// Utility function to convert a string to title case
function toTitleCase(str) {
  return str.replace(/\w\S*/g, (txt) => {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  })
}

export default function PresetAccordionItem({ category, deleteCustomPreset }) {
  // Redux
  const dispatch = useDispatch()
  const aircraftType = useSelector(selectAircraftType)
  const colorIndex = useSelector(selectColorIndex)
  const logType = useSelector(selectLogType)
  const messageFilters = useSelector(selectMessageFilters)
  const persistentColorMap = useSelector(selectPersistentColorMap)

  // Preset selection
  function selectPreset(preset) {
    // Don't allow selecting unavailable presets
    if (!preset.isAvailable) {
      return
    }

    // Reset all filters
    let newFilters = structuredClone(messageFilters)
    Object.keys(newFilters).forEach((categoryName) => {
      const category = newFilters[categoryName]
      Object.keys(category).forEach((fieldName) => {
        newFilters[categoryName][fieldName] = false
      })
    })
    // Use preset's custom colors if available, otherwise initialize empty
    let newColors = preset.customColors
      ? structuredClone(preset.customColors)
      : {}
    let nextColorIndex = colorIndex

    // Turn on filters for the given preset
    Object.keys(preset.filters).forEach((requestedName) => {
      // Use the mapped name if available (handles MESSAGE[0] <-> MESSAGE fallback)
      const actualMessageName =
        preset.messageNameMap?.[requestedName] || requestedName

      if (Object.keys(messageFilters).includes(actualMessageName)) {
        preset.filters[requestedName].forEach((field) => {
          if (!(field in messageFilters[actualMessageName])) {
            showErrorNotification(
              `Your log file does not include ${actualMessageName}/${field} data`,
            )
            return
          }
          newFilters[actualMessageName][field] = true

          // Assign a color
          const fieldKey = `${actualMessageName}/${field}`
          // First priority: use color from preset if it exists
          if (!newColors[fieldKey]) {
            // Second priority: use color from persistent map if it exists
            if (persistentColorMap[fieldKey]) {
              newColors[fieldKey] = persistentColorMap[fieldKey]
            } else {
              // Fall back to palette color
              const assignedColor =
                colorPalette[nextColorIndex % colorPalette.length]
              newColors[fieldKey] = assignedColor
              nextColorIndex = (nextColorIndex + 1) % colorPalette.length
              dispatch(
                setPersistentColorMapEntry({
                  key: fieldKey,
                  color: assignedColor,
                }),
              )
            }
          }
        })
      } else {
        showErrorNotification(
          `Your log file does not include ${actualMessageName}`,
        )
      }
    })

    dispatch(setColorIndex(nextColorIndex)) // limited by palette length
    dispatch(setCustomColors(newColors))
    dispatch(setMessageFilters(newFilters))
    // Don't allow saving if we just selected an existing preset
    dispatch(setCanSavePreset(false))
  }

  function handleDeleteCustomPreset(presetName) {
    // Are there filters on screen?
    const hasSelectedFilters = Object.values(messageFilters).some((category) =>
      Object.values(category).some((isSelected) => isSelected),
    )

    // If so, check if they match the filters of the preset to be deleted
    if (hasSelectedFilters) {
      const filtersOfPresetToBeDeleted = (category?.presets || []).find(
        (preset) => preset.name === presetName,
      )?.filters
      if (!filtersOfPresetToBeDeleted) {
        deleteCustomPreset(presetName, logType)
        return
      }

      const activeMessageFields = Object.keys(messageFilters).reduce(
        (filteredCategories, category) => {
          const selectedFields = Object.keys(messageFilters[category]).filter(
            (field) => messageFilters[category][field] === true,
          )

          // Only add the category to the result if it has selected fields
          if (selectedFields.length > 0) {
            filteredCategories[category] = selectedFields
          }

          return filteredCategories
        },
        {},
      )
      const matchesSelectedPresets = _.isEqual(
        filtersOfPresetToBeDeleted,
        activeMessageFields,
      )

      if (matchesSelectedPresets) {
        dispatch(setCanSavePreset(true))
      }
    }

    deleteCustomPreset(presetName, logType)
    showSuccessNotification(
      `Custom preset "${presetName}" deleted successfully`,
    )
  }

  // Filter out presets that don't match the current aircraft type
  const filteredPresets = useMemo(
    () =>
      category.presets.filter(
        (preset) =>
          preset.aircraftType === undefined ||
          preset.aircraftType.includes(aircraftType),
      ),
    [category.presets, aircraftType],
  )

  const isCustomPreset = useMemo(
    () => category.name === "Custom Presets",
    [category.name],
  )

  // Generate tooltip content for unavailable presets showing missing messages/fields
  function getUnavailableTooltip(preset) {
    if (preset.isAvailable) return null

    const missingParts = []

    if (preset.missingMessages && preset.missingMessages.length > 0) {
      missingParts.push(
        <div key="messages">
          <p className="text-sm">Missing messages:</p>
          <p className="text-sm font-mono">
            {preset.missingMessages.join(", ")}
          </p>
        </div>,
      )
    }

    if (preset.missingFields && Object.keys(preset.missingFields).length > 0) {
      const fieldDetails = Object.entries(preset.missingFields)
        .map(([msg, fields]) => `${msg}: ${fields.join(", ")}`)
        .join("\n")
      missingParts.push(
        <div key="fields">
          <p className="text-sm">Missing fields:</p>
          <p className="text-sm font-mono">{fieldDetails}</p>
        </div>,
      )
    }

    // If somehow there are no missing messages or fields but preset is still
    // not available
    if (missingParts.length === 0) {
      missingParts.push(
        <div key="fields">
          <p className="text-sm">This preset is unavailable</p>
        </div>,
      )
    }

    return (
      <div className="text-left whitespace-pre-wrap max-w-96">
        <p className="font-semibold mb-1">{preset.name}</p>
        <div className="flex flex-col gap-1">{missingParts}</div>
      </div>
    )
  }

  // Generate tooltip content for available presets showing included messages/fields
  function getAvailableTooltip(preset) {
    if (!preset.filters || Object.keys(preset.filters).length === 0) {
      return preset.name
    }

    const messageList = Object.entries(preset.filters)
      .map(([message, fields]) => {
        if (Array.isArray(fields) && fields.length > 0) {
          return `${message}: ${fields.join(", ")}`
        }
        return message
      })
      .join("\n")

    return (
      <div className="text-left whitespace-pre-wrap max-w-96">
        <p className="font-semibold mb-1">{preset.name}</p>
        <p className="text-sm">Includes:</p>
        <p className="text-sm font-mono">{messageList}</p>
      </div>
    )
  }

  return (
    <Accordion.Item value={category.name}>
      <Accordion.Control className="rounded-md">
        {category.name}
      </Accordion.Control>
      <Accordion.Panel>
        <div className="flex flex-col gap-1">
          {filteredPresets.length === 0 ? (
            <div className="flex items-center justify-center py-4">
              <IconInfoCircle size={20} />
              <p className="ml-2">
                No Saved {aircraftType ? toTitleCase(aircraftType) : ""}{" "}
                {isCustomPreset ? "Custom Preset" : "Preset"}
              </p>
            </div>
          ) : (
            filteredPresets.map((preset, idx) => {
              const isAvailable = preset.isAvailable

              return (
                <div key={idx} className="flex items-center gap-1">
                  <MantineTooltip
                    label={
                      isAvailable
                        ? getAvailableTooltip(preset)
                        : getUnavailableTooltip(preset)
                    }
                    withArrow
                    position="right"
                    arrowSize={10}
                    arrowOffset={15}
                  >
                    <Button
                      onClick={() => selectPreset(preset)}
                      className="flex-1"
                      disabled={!isAvailable}
                    >
                      <p className="text-wrap line-clamp-1">{preset.name}</p>
                    </Button>
                  </MantineTooltip>

                  {/* Add delete button if isCustomPreset */}
                  {isCustomPreset && (
                    <MantineTooltip label="Delete Preset">
                      <ActionIcon
                        variant="light"
                        color={"red"}
                        onClick={() => handleDeleteCustomPreset(preset.name)}
                      >
                        <IconTrash size={18} />
                      </ActionIcon>
                    </MantineTooltip>
                  )}
                </div>
              )
            })
          )}
        </div>
      </Accordion.Panel>
    </Accordion.Item>
  )
}
