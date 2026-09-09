import { Accordion, Button, ScrollArea, Tabs, Tooltip } from "@mantine/core"
import { useDebouncedCallback, useDisclosure } from "@mantine/hooks"
import { Fragment } from "react"
import { useDispatch, useSelector } from "react-redux"
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels"
import {
  selectAircraftType,
  selectFile,
  selectFirmwareVersion,
  selectMessageMeans,
  selectPanelLayout,
  setHorizontalLayout,
  setVerticalLayout,
} from "../../redux/slices/logAnalyserSlice.js"
import ChartDataCard from "./chartDataCard.jsx"
import DataTable from "./dataTable.jsx"
import Graph from "./graph.jsx"
import MessagesFiltersAccordion from "./messagesFiltersAccordion.jsx"
import { usePresetCategories } from "./presetCategories.js"
import PresetsAccordion from "./presetsAccordion.jsx"
import SavePresetModal from "./savePresetModal.jsx"

/**
 * Main display component for the Falcon Log Analyser (FLA).
 */
export default function MainDisplay({ closeLogFile, chartData, customColors }) {
  const dispatch = useDispatch()

  // Redux selectors
  const file = useSelector(selectFile)
  const aircraftType = useSelector(selectAircraftType)
  const messageMeans = useSelector(selectMessageMeans)
  const firmwareVersion = useSelector(selectFirmwareVersion)
  const panelLayout = useSelector(selectPanelLayout)

  // Debounced layout update handlers (300ms delay)
  const debouncedSetHorizontalLayout = useDebouncedCallback(
    (sizes) => dispatch(setHorizontalLayout(sizes)),
    300,
  )

  const debouncedSetVerticalLayout = useDebouncedCallback(
    (sizes) => dispatch(setVerticalLayout(sizes)),
    300,
  )

  // Shared presets state for all children (presets + modal)
  const {
    presetCategories,
    saveCustomPreset,
    deleteCustomPreset,
    findExistingPreset,
  } = usePresetCategories()

  const [
    isSavePresetModalOpen,
    { open: openSavePresetModal, close: closeSavePresetModal },
  ] = useDisclosure(false)

  return (
    <div className="flex h-full px-2 py-4 mb-4 overflow-hidden">
      <PanelGroup
        direction="horizontal"
        onLayout={debouncedSetHorizontalLayout}
      >
        {/* Left Panel - Message selection column */}
        <Panel defaultSize={panelLayout.leftSidebar} minSize={10}>
          <div className="pb-6 flex flex-col min-h-0 h-full pr-2">
            <div className="flex flex-col mb-2 text-sm gap-y-2 flex-shrink-0">
              <div className="flex">
                <Tooltip label={file.path}>
                  <div className="flex-1 min-w-0 px-4 py-2 text-gray-200 bg-falcongrey-700 rounded truncate">
                    File Name:
                    <span
                      className="ml-2 text-white underline cursor-pointer"
                      onClick={() => {
                        window.ipcRenderer.send(
                          "window:open-file-in-explorer",
                          file.path,
                        )
                      }}
                    >
                      {file.name}
                    </span>
                  </div>
                </Tooltip>
                <Button
                  className="ml-2 flex-shrink-0"
                  size="sm"
                  color="red"
                  onClick={closeLogFile}
                >
                  Close file
                </Button>
              </div>
              <div className="flex justify-between px-4 py-2 text-gray-200 rounded bg-falcongrey-700">
                <div className="whitespace-nowrap">Aircraft Type:</div>
                <div className="text-white text-right capitalize">
                  {aircraftType ?? "No Aircraft Type"}
                </div>
              </div>
              {firmwareVersion !== null && (
                <div className="flex justify-between px-4 py-2 text-gray-200 rounded bg-falcongrey-700">
                  <div className="whitespace-nowrap">Firmware Version:</div>
                  <div className="text-white text-right">{firmwareVersion}</div>
                </div>
              )}
            </div>
            <ScrollArea className="flex-1 min-h-0">
              <Accordion multiple={true} defaultValue={["messages"]}>
                {/* Presets */}
                <Accordion.Item key="presets" value="presets">
                  <Accordion.Control className="rounded-md">
                    Presets
                  </Accordion.Control>
                  <Accordion.Panel>
                    <PresetsAccordion
                      presetCategories={presetCategories}
                      deleteCustomPreset={deleteCustomPreset}
                    />
                  </Accordion.Panel>
                </Accordion.Item>

                {/* All messages (checkboxes in accordions) */}
                <Accordion.Item
                  key="messages"
                  value="messages"
                  styles={{ item: { borderBottom: "none" } }}
                >
                  <Accordion.Control className="rounded-md">
                    Messages
                  </Accordion.Control>
                  <Accordion.Panel>
                    <MessagesFiltersAccordion />
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
            </ScrollArea>
          </div>
        </Panel>

        {/* Resize Handle */}
        <PanelResizeHandle className='w-1 bg-falcongrey-700 hover:bg-falconred-500 data-[resize-handle-state="hover"]:bg-falconred-500 data-[resize-handle-state="drag"]:bg-falconred-500 transition-colors cursor-col-resize' />

        {/* Right Panel - Graph and Tabs */}
        <Panel defaultSize={panelLayout.rightContent} minSize={65}>
          <PanelGroup
            direction="vertical"
            className="h-full"
            onLayout={debouncedSetVerticalLayout}
          >
            {/* Top Panel - Graph */}
            <Panel defaultSize={panelLayout.graph} minSize={30}>
              <div className="h-full pl-2 min-w-0">
                <Graph
                  data={chartData}
                  customColors={customColors}
                  openPresetModal={openSavePresetModal}
                />
              </div>
            </Panel>

            {/* Vertical Resize Handle */}
            <PanelResizeHandle className='h-1 bg-falcongrey-700 hover:bg-falconred-500 data-[resize-handle-state="hover"]:bg-falconred-500 data-[resize-handle-state="drag"]:bg-falconred-500 transition-colors cursor-row-resize' />

            {/* Bottom Panel - Tabs */}
            <Panel defaultSize={panelLayout.tabs} minSize={15}>
              <div className="h-full px-2 py-1 min-w-0 flex flex-col">
                <Tabs
                  defaultValue={"chart_cards"}
                  className="flex flex-col flex-1 min-h-0"
                >
                  <Tabs.List>
                    <Tabs.Tab value="chart_cards">Chart Cards</Tabs.Tab>
                    <Tabs.Tab value="data_table">Data Table</Tabs.Tab>
                  </Tabs.List>

                  <Tabs.Panel
                    value="chart_cards"
                    className="min-h-0 h-full pb-4"
                  >
                    <ScrollArea className="h-full">
                      <div className="grid grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6 gap-2 py-2">
                        {chartData.datasets.map((item) => (
                          <Fragment key={item.label}>
                            <ChartDataCard
                              item={item}
                              unit={item.yAxisID} // item.yAxisID is the unit
                              messageMeans={messageMeans}
                            />
                          </Fragment>
                        ))}
                      </div>
                    </ScrollArea>
                  </Tabs.Panel>
                  <Tabs.Panel
                    value="data_table"
                    className="min-h-0 h-full pb-4"
                  >
                    <DataTable />
                  </Tabs.Panel>
                </Tabs>
              </div>
            </Panel>
          </PanelGroup>
        </Panel>
      </PanelGroup>

      <SavePresetModal
        isSavePresetModalOpen={isSavePresetModalOpen}
        closeSavePresetModal={closeSavePresetModal}
        saveCustomPreset={saveCustomPreset}
        findExistingPreset={findExistingPreset}
      />
    </div>
  )
}
