/*
  MessagesFiltersAccordion
  Renders the list of log message accordions with checkboxes that control whether or
  not they show on the graph.
  This also contains the descriptions of all log messages from helpers.
*/

// 3rd Party Imports
import { Accordion, Checkbox, Tooltip } from "@mantine/core"
import { memo, useCallback, useEffect, useState } from "react"
import { useDispatch, useSelector } from "react-redux"

// Helper imports
import { logMessageDescriptions } from "../../helpers/logMessageDescriptions.js"

// Local imports
import {
  selectAircraftType,
  selectColorIndex,
  selectCustomColors,
  selectLogType,
  selectMessageFilters,
  selectPersistentColorMap,
  setCanSavePreset,
  setColorIndex,
  setCustomColors,
  setMessageFilters,
  setPersistentColorMapEntry,
} from "../../redux/slices/logAnalyserSlice.js"
import { colorPalette } from "./constants.js"

// Memoized field checkbox component to prevent unnecessary re-renders
const FieldCheckbox = memo(
  ({ messageName, fieldName, checked, fieldDescription, onChangeHandler }) => {
    const checkbox = (
      <Checkbox
        label={fieldName}
        checked={checked}
        onChange={(event) => onChangeHandler(event, messageName, fieldName)}
      />
    )

    // Wrap with Tooltip if description exists
    if (fieldDescription) {
      return (
        <Tooltip
          label={fieldDescription}
          position="right"
          multiline
          w={300}
          withArrow
        >
          <div className="w-fit">{checkbox}</div>
        </Tooltip>
      )
    }

    return checkbox
  },
)

FieldCheckbox.displayName = "FieldCheckbox"

export default function MessagesFiltersAccordion() {
  const dispatch = useDispatch()

  const messageFilters = useSelector(selectMessageFilters)
  const customColors = useSelector(selectCustomColors)
  const persistentColorMap = useSelector(selectPersistentColorMap)
  const colorIndex = useSelector(selectColorIndex)
  const logType = useSelector(selectLogType)
  const aircraftType = useSelector(selectAircraftType)

  // State to hold dynamically loaded log message definitions
  const [logMessageDefinitions, setLogMessageDefinitions] = useState(null)

  // Dynamically load log message definitions based on log type and aircraft type
  useEffect(() => {
    // Only load for dataflash logs
    if (logType === "dataflash_log" || logType === "dataflash_bin") {
      const loadDefinitions = async () => {
        try {
          let module
          if (aircraftType === "plane" || aircraftType === "quadplane") {
            module = await import(
              "../../../data/gen_log_messages_desc_plane.json"
            )
          } else {
            module = await import(
              "../../../data/gen_log_messages_desc_copter.json"
            )
          }
          setLogMessageDefinitions(module.default)
        } catch (error) {
          console.error("Failed to load log message definitions:", error)
          setLogMessageDefinitions(null)
        }
      }
      loadDefinitions()
    } else {
      setLogMessageDefinitions(null)
    }
  }, [logType, aircraftType])

  // handles color assignment and checks if a new preset can be saved
  const selectMessageFilter = useCallback(
    (event, messageName, fieldName) => {
      // Use shallow cloning for better performance
      const newFilters = {
        ...messageFilters,
        [messageName]: {
          ...messageFilters[messageName],
          [fieldName]: event.currentTarget.checked,
        },
      }

      const checked = event.currentTarget.checked
      let newColors = { ...customColors }
      const fieldKey = `${messageName}/${fieldName}`

      if (!checked) {
        delete newColors[fieldKey]
      } else {
        if (!newColors[fieldKey]) {
          // Check persistent map first, then fall back to palette
          if (persistentColorMap[fieldKey]) {
            newColors[fieldKey] = persistentColorMap[fieldKey]
          } else {
            const assignedColor = colorPalette[colorIndex % colorPalette.length]
            newColors[fieldKey] = assignedColor
            dispatch(
              setPersistentColorMapEntry({
                key: fieldKey,
                color: assignedColor,
              }),
            )
            dispatch(setColorIndex((colorIndex + 1) % colorPalette.length))
          }
        }
      }

      dispatch(setCustomColors(newColors))
      dispatch(setMessageFilters(newFilters))

      // Then check if we should allow saving preset
      // Only enable save if there are selected filters
      const hasSelectedFilters = Object.values(newFilters).some((category) =>
        Object.values(category).some((isSelected) => isSelected),
      )
      dispatch(setCanSavePreset(hasSelectedFilters))
    },
    [messageFilters, customColors, persistentColorMap, colorIndex, dispatch],
  )

  // Memoize description getters
  const getMessageDescription = useCallback(
    (messageName) => {
      // Remove [ index ] suffix for base message name
      const baseMessageName = messageName.replace(/\[\d+\]$/, "")

      // Try to get from JSON definitions first (for dataflash logs)
      if (logMessageDefinitions && logMessageDefinitions[baseMessageName]) {
        return logMessageDefinitions[baseMessageName].description
      }

      // Fallback to hardcoded descriptions
      if (logMessageDescriptions[baseMessageName]) {
        return logMessageDescriptions[baseMessageName]
      }

      return logMessageDescriptions[messageName] || null
    },
    [logMessageDefinitions],
  )

  const getFieldDescription = useCallback(
    (messageName, fieldName) => {
      // Remove [ index ] suffix for base message name
      const baseMessageName = messageName.replace(/\[\d+\]$/, "")

      // Try to get from JSON definitions (for dataflash logs)
      if (logMessageDefinitions && logMessageDefinitions[baseMessageName]) {
        const messageInfo = logMessageDefinitions[baseMessageName]
        if (messageInfo.fields && messageInfo.fields[fieldName]) {
          const field = messageInfo.fields[fieldName]
          const units = field.units ? ` (${field.units})` : ""
          return `${field.description}${units}`
        }
      }

      return null
    },
    [logMessageDefinitions],
  )

  if (!messageFilters) return null

  return (
    <Accordion
      multiple={true}
      classNames={{
        control: "!py-1",
        label: "!py-1",
      }}
    >
      {Object.keys(messageFilters).map((messageName) => (
        <Accordion.Item value={messageName} key={messageName}>
          <Accordion.Control className="rounded-md">
            <p>{messageName}</p>
            <p className="text-sm italic text-gray-500">
              {getMessageDescription(messageName)}
            </p>
          </Accordion.Control>
          <Accordion.Panel>
            <div className="flex flex-col gap-1">
              {Object.keys(messageFilters[messageName]).map((fieldName) => (
                <FieldCheckbox
                  key={`${messageName}/${fieldName}`}
                  messageName={messageName}
                  fieldName={fieldName}
                  checked={messageFilters[messageName][fieldName]}
                  fieldDescription={getFieldDescription(messageName, fieldName)}
                  onChangeHandler={selectMessageFilter}
                />
              ))}
            </div>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  )
}
