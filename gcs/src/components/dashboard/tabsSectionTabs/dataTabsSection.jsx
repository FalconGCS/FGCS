import { Tabs } from "@mantine/core"
import { useDisclosure, useElementSize } from "@mantine/hooks"
import { IconInfoCircle } from "@tabler/icons-react"
import { useEffect, useRef, useState } from "react"
import { useDispatch, useSelector } from "react-redux"
import { calcDataGridMetrics } from "../../../helpers/dashboardDataGrid"
import { DataMessage } from "../../../helpers/dataDisplay"
import {
  selectDataGridContextMenu,
  updateDataGridContextMenuState,
} from "../../../redux/slices/dashboardSlice"
import {
  changeSelectedDisplayTelemetry,
  selectDataGridSize,
  selectSelectedDisplayTelemetry,
  setDataGridSize,
} from "../../../redux/slices/droneInfoSlice"
import DashboardDataModal from "../../dashboardDataModal"
import useContextMenuPosition from "../../mapComponents/useContextMenuPosition"
import DataGridContextMenu from "./dataGridContextMenu"
import useAvailableGridHeight from "./useAvailableGridHeight"

export default function DataTabsSection({ tabPadding }) {
  const [selectedBox, setSelectedBox] = useState(null)
  const [opened, { open, close }] = useDisclosure(false)

  const dispatch = useDispatch()
  const selectedData = useSelector(selectSelectedDisplayTelemetry)
  const { rows, cols } = useSelector(selectDataGridSize)

  const { ref: gridRef, width: gridWidth } = useElementSize()
  const availableHeight = useAvailableGridHeight(gridRef)
  const metrics = calcDataGridMetrics({
    containerWidth: gridWidth,
    availableHeight,
    rows,
    cols,
  })
  const hasMeasured = gridWidth > 0
  const { rowHeight, cellWidth } = metrics
  const valueFontSize = hasMeasured ? metrics.valueFontSize : undefined
  const labelFontSize = hasMeasured ? metrics.labelFontSize : undefined

  const contextMenuRef = useRef(null)
  const contextMenuState = useSelector(selectDataGridContextMenu)
  const contextMenuPosition = useContextMenuPosition(
    contextMenuRef,
    contextMenuState.isOpen,
    contextMenuState.position,
  )

  useEffect(() => {
    if (!contextMenuState.isOpen) return

    const closeContextMenu = () =>
      dispatch(updateDataGridContextMenuState({ isOpen: false }))
    const closeOnEscape = (e) => {
      if (e.key === "Escape") closeContextMenu()
    }

    document.addEventListener("click", closeContextMenu)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("click", closeContextMenu)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [contextMenuState.isOpen, dispatch])

  const handleDoubleClick = (box) => {
    setSelectedBox(box)
    open()
  }

  const handleContextMenu = (e) => {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    dispatch(
      updateDataGridContextMenuState({
        isOpen: true,
        position: { x: e.clientX - rect.left, y: e.clientY - rect.top },
      }),
    )
  }

  const handleCheckboxChange = (key, subkey, subvalue, boxId, isChecked) => {
    // Update wantedData on checkbox change
    if (isChecked) {
      dispatch(
        changeSelectedDisplayTelemetry({
          index: boxId,
          data: {
            currently_selected: `${key}.${subkey}`,
            display_name: subkey,
            value: 0,
          },
        }),
      )
      close()
    }
  }

  return (
    <Tabs.Panel value="data">
      <div className={tabPadding}>
        <div
          ref={gridRef}
          data-testid="data-grid"
          className="relative grid gap-1 cursor-pointer select-none"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridAutoRows: `${rowHeight}px`,
          }}
          onContextMenu={handleContextMenu}
        >
          {selectedData.length > 0 ? (
            selectedData.map((data) => (
              <div
                key={data.boxId}
                className="overflow-hidden"
                onDoubleClick={() => handleDoubleClick(data)} // Pass boxId to the function
              >
                <DataMessage
                  label={data.display_name}
                  value={data.value}
                  currentlySelected={data.currently_selected}
                  id={data.boxId}
                  valueFontSize={valueFontSize}
                  labelFontSize={labelFontSize}
                  cellWidth={cellWidth}
                />
              </div>
            ))
          ) : (
            <div className="flex justify-center items-center p-4">
              <IconInfoCircle size={20} />
              <p className="ml-2">Double Click to select data</p>
            </div>
          )}

          {contextMenuState.isOpen && (
            <DataGridContextMenu
              passedRef={contextMenuRef}
              position={contextMenuPosition}
              rows={rows}
              cols={cols}
              onChange={(size) => dispatch(setDataGridSize(size))}
              onClose={() =>
                dispatch(updateDataGridContextMenuState({ isOpen: false }))
              }
            />
          )}
        </div>

        <DashboardDataModal
          opened={opened}
          close={close}
          selectedBox={selectedBox}
          handleCheckboxChange={handleCheckboxChange}
        />
      </div>
    </Tabs.Panel>
  )
}
