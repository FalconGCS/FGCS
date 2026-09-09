/*
  The navbar component.

  This is shown at the top of each page. To change this please look at the layout component as this
  is where it is loaded. This also handles the connections to the drone as this is always loaded,
  in the future we may change this so that its loaded in its own component.
*/

// Base imports
import { Link } from "react-router-dom"

// Third party imports
import {
  Button,
  Group,
  LoadingOverlay,
  Modal,
  SegmentedControl,
  Select,
  Tabs,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core"
import { useSessionStorage } from "@mantine/hooks"
import { IconRefresh } from "@tabler/icons-react"

// Helper imports
import { IconAlertTriangle } from "@tabler/icons-react"
import {
  useConnectToDroneFromButtonCallback,
  useDisconnectFromDroneCallback,
} from "../helpers/droneConnectionCallbacks.js"

// Redux
import { useDispatch, useSelector } from "react-redux"
import {
  ConnectionType,
  emitConnectToDrone,
  emitDisconnectFromDrone,
  emitGetComPorts,
  emitStartForwarding,
  emitStopForwarding,
  selectBaudrate,
  selectComPorts,
  selectConnectedToDrone,
  selectConnecting,
  selectConnectionModal,
  selectConnectionStatus,
  selectConnectionType,
  selectCurrentPage,
  selectFetchingComPorts,
  selectForwardingAddress,
  selectForwardingAddressModalOpened,
  selectIp,
  selectIsForwarding,
  selectNetworkType,
  selectPort,
  selectSelectedComPorts,
  setBaudrate,
  setConnecting,
  setConnectionModal,
  setConnectionType,
  setForwardingAddress,
  setForwardingAddressModalOpened,
  setIp,
  setNetworkType,
  setPort,
  setSelectedComPorts,
} from "../redux/slices/droneConnectionSlice.js"
import { selectIsConnectedToSocket } from "../redux/slices/socketSlice.js"

// Styling imports
import { useEffect } from "react"
import { twMerge } from "tailwind-merge"
import { showErrorNotification } from "../helpers/notification.js"

// Modals
import ConnectionProgress from "./connectionProgress.jsx"
import SimulationModal from "./toolbar/simulationModal.jsx"

export default function Navbar() {
  // Redux
  const dispatch = useDispatch()
  const openedModal = useSelector(selectConnectionModal)
  const forwardingModalOpened = useSelector(selectForwardingAddressModalOpened)

  const connecting = useSelector(selectConnecting)
  const connectedToDrone = useSelector(selectConnectedToDrone)
  const connectedToSocket = useSelector(selectIsConnectedToSocket)

  const comPorts = useSelector(selectComPorts)
  const selectedComPort = useSelector(selectSelectedComPorts)
  const fetchingComPorts = useSelector(selectFetchingComPorts)
  const selectedBaudRate = useSelector(selectBaudrate)
  const connectionType = useSelector(selectConnectionType)
  const networkType = useSelector(selectNetworkType)
  const ip = useSelector(selectIp)
  const port = useSelector(selectPort)
  const droneConnectionStatus = useSelector(selectConnectionStatus)
  const forwardingAddress = useSelector(selectForwardingAddress)
  const isForwarding = useSelector(selectIsForwarding)

  // Panel is open/closed
  const [outOfDate] = useSessionStorage({ key: "outOfDate" })
  const currentPage = useSelector(selectCurrentPage)

  // Drone connection
  const connectToDroneFromButtonCallback = useConnectToDroneFromButtonCallback()
  const disconnectFromDroneCallback = useDisconnectFromDroneCallback()

  function handleConnectionModalCloseOrCancel() {
    if (connecting) {
      dispatch(emitDisconnectFromDrone())
      return
    }

    dispatch(setConnectionModal(false))
  }

  function connectToDrone(type) {
    if (type === ConnectionType.Serial) {
      dispatch(
        emitConnectToDrone({
          port: selectedComPort,
          baud: parseInt(selectedBaudRate),
          connectionType: type,
          forwardingAddress: forwardingAddress,
        }),
      )
    } else if (type === ConnectionType.Network) {
      if ((networkType !== "udpin" && ip === "") || port === "") {
        showErrorNotification("IP Address and Port cannot be empty")
        return
      }

      // UDP In creates a UDP socket that binds to a local port
      let filteredIp = ip
      if (networkType === "udpin") {
        filteredIp = "0.0.0.0"
      }

      const networkString = `${networkType}:${filteredIp}:${port}`

      dispatch(
        emitConnectToDrone({
          port: networkString,
          baud: 115200,
          connectionType: type,
          forwardingAddress: forwardingAddress,
        }),
      )
    } else {
      return
    }

    dispatch(setConnecting(true))
  }

  useEffect(() => {
    if (!comPorts.includes(selectedComPort)) {
      dispatch(setSelectedComPorts(null))
    }
  }, [comPorts, selectedComPort])

  useEffect(() => {
    const handler = () => dispatch(setForwardingAddressModalOpened(true))
    window.ipcRenderer.on("mavlink-forwarding:open", handler)
    return () =>
      window.ipcRenderer.removeAllListeners("mavlink-forwarding:open")
  }, [dispatch])

  const linkClassName =
    "text-md px-2 rounded-sm hover:text-falconred-400 transition-colors delay-50"

  return (
    <div className="flex flex-row items-center justify-center py-2 px-2 bg-falcongrey-900">
      {/* Connect to drone modal - should probably be moved into its own component? */}
      <Modal
        opened={openedModal}
        onClose={handleConnectionModalCloseOrCancel}
        title="Connect to aircraft"
        centered
        overlayProps={{
          backgroundOpacity: 0.55,
          blur: 3,
        }}
        styles={{
          content: {
            borderRadius: "0.5rem",
          },
        }}
        withCloseButton={false}
        closeOnClickOutside={!connecting}
        closeOnEscape={!connecting}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            connectToDrone(connectionType)
          }}
        >
          <Tabs
            value={connectionType}
            onChange={(value) => dispatch(setConnectionType(value))}
          >
            <Tabs.List grow>
              <Tabs.Tab value={ConnectionType.Serial}>
                Serial Connection
              </Tabs.Tab>
              <Tabs.Tab value={ConnectionType.Network}>
                Network Connection
              </Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value={ConnectionType.Serial} className="py-4">
              <LoadingOverlay visible={fetchingComPorts} />
              <div className="flex flex-col space-y-4">
                <Select
                  label="COM Port"
                  description="Select a COM Port from the ones available"
                  placeholder={
                    comPorts.length ? "Select a COM port" : "No COM ports found"
                  }
                  data={comPorts}
                  value={selectedComPort}
                  onChange={(value) => dispatch(setSelectedComPorts(value))}
                  rightSectionPointerEvents="all"
                  rightSection={<IconRefresh />}
                  rightSectionProps={{
                    onClick: () => dispatch(emitGetComPorts()),
                    className: "hover:cursor-pointer hover:bg-transparent/50",
                  }}
                />
                <Select
                  label="Baud Rate"
                  description="Select a baud rate for the specified COM Port"
                  data={[
                    "1200",
                    "4800",
                    "9600",
                    "13400",
                    "19200",
                    "38400",
                    "57600",
                    "75880",
                    "115200",
                    "230400",
                    "460800",
                    "500000",
                    "625000",
                    "921600",
                    "1000000",
                    "1500000",
                  ]}
                  value={selectedBaudRate}
                  onChange={(value) => dispatch(setBaudrate(value))}
                />
              </div>
            </Tabs.Panel>
            <Tabs.Panel value={ConnectionType.Network} className="py-4">
              <div className="flex flex-col space-y-4">
                <SegmentedControl
                  label="Network Connection type"
                  description="Select a network connection type"
                  value={networkType}
                  onChange={(value) => dispatch(setNetworkType(value))}
                  data={[
                    { value: "tcp", label: "TCP" },
                    { value: "udpin", label: "UDP In" },
                    { value: "udpout", label: "UDP Out" },
                  ]}
                />
                {networkType !== "udpin" && (
                  <TextInput
                    label="IP Address"
                    placeholder="127.0.0.1"
                    value={ip}
                    onChange={(event) =>
                      dispatch(setIp(event.currentTarget.value))
                    }
                    data-autofocus
                  />
                )}
                <TextInput
                  label="Port"
                  placeholder="5760"
                  value={port}
                  onChange={(event) =>
                    dispatch(setPort(event.currentTarget.value))
                  }
                />
              </div>
            </Tabs.Panel>
          </Tabs>

          {isForwarding && (
            <Text mb={16} c="dimmed" size="sm">
              Note: MAVLink packets will be forwarded to {forwardingAddress}
            </Text>
          )}

          <Group justify="space-between" className="pt-4">
            <Button
              variant="filled"
              color={"red"}
              onClick={handleConnectionModalCloseOrCancel}
            >
              {connecting ? "Cancel" : "Close"}
            </Button>
            <Button
              variant="filled"
              type="submit"
              color={"green"}
              disabled={
                !connectedToSocket ||
                (connectionType == ConnectionType.Serial &&
                  selectedComPort === null)
              }
              loading={connecting}
            >
              Connect
            </Button>
          </Group>
        </form>

        <ConnectionProgress
          connecting={connecting}
          status={droneConnectionStatus}
        />
      </Modal>

      <Modal
        opened={forwardingModalOpened}
        onClose={() => {
          dispatch(setForwardingAddressModalOpened(false))
        }}
        title="Forward MAVLink packets"
        centered
        overlayProps={{
          backgroundOpacity: 0.55,
          blur: 3,
        }}
        styles={{
          content: {
            borderRadius: "0.5rem",
          },
        }}
      >
        <Text mb={16} c="dimmed" size="sm">
          Note: Any GCS or application receiving forwarded MAVLink packets
          cannot send data back to the aircraft. The data is sent in a one-way
          manner only.
        </Text>
        <TextInput
          label="Forwarding Address"
          description={
            isForwarding
              ? "MAVLink packets are being forwarded to this address"
              : "Enter the address to forward MAVLink packets to"
          }
          placeholder="e.g. udpout:192.168.1.10:14550"
          value={forwardingAddress}
          onChange={(event) =>
            dispatch(setForwardingAddress(event.currentTarget.value))
          }
          data-autofocus
          disabled={isForwarding}
        />

        {isForwarding ? (
          <Button
            className="mt-8"
            variant="filled"
            color={"red"}
            onClick={() => {
              dispatch(emitStopForwarding())
            }}
          >
            Stop Forwarding
          </Button>
        ) : (
          <Button
            className="mt-8"
            variant="filled"
            color={"green"}
            onClick={() => {
              dispatch(emitStartForwarding())
              dispatch(setForwardingAddressModalOpened(false))
            }}
          >
            Start Forwarding
          </Button>
        )}
      </Modal>

      <SimulationModal />

      <div className="w-full flex justify-between gap-x-4 xl:grid xl:grid-cols-2 xl:gap-0">
        <div className="flex items-center wrap">
          {/* Navigation */}
          <Link
            to="/"
            draggable={false}
            className={twMerge(
              linkClassName,
              currentPage === "dashboard" && "text-falconred",
            )}
          >
            Dashboard
          </Link>
          <Link
            to="/missions"
            draggable={false}
            className={twMerge(
              linkClassName,
              currentPage === "missions" && "text-falconred",
            )}
          >
            Missions
          </Link>
          <Link
            to="/params"
            draggable={false}
            className={twMerge(
              linkClassName,
              currentPage === "params" && "text-falconred",
            )}
          >
            Params
          </Link>
          <Link
            to="/config"
            draggable={false}
            className={twMerge(
              linkClassName,
              currentPage?.startsWith("config") && "text-falconred",
            )}
          >
            Config
          </Link>
          <Link
            to="/fla"
            draggable={false}
            className={twMerge(
              linkClassName,
              currentPage === "fla" && "text-falconred",
            )}
          >
            FLA
          </Link>
        </div>

        {/* Right hand side information */}
        <div className="!ml-auto flex flex-row space-x-4 items-center">
          {/* Out of date warning */}
          {outOfDate && (
            <a
              href="https://github.com/Avis-Drone-Labs/FGCS/releases"
              target="_blank"
              className="flex flex-row gap-2 text-red-400 hover:text-red-600"
            >
              <IconAlertTriangle /> FGCS out of date
            </a>
          )}

          {/* Connected to message */}
          <p>
            {connectedToDrone && (
              <>
                Connected to
                <span className="inline font-bold">
                  {
                    {
                      [ConnectionType.Serial]: ` ${selectedComPort}`,
                      [ConnectionType.Network]: ` ${networkType}:${ip}:${port}`,
                    }[connectionType]
                  }
                </span>
              </>
            )}
          </p>

          {/* Button to connect to drone */}
          {connectedToSocket ? (
            <Button
              onClick={
                connectedToDrone
                  ? disconnectFromDroneCallback
                  : connectToDroneFromButtonCallback
              }
              color={connectedToDrone ? "red.8" : "green"}
              radius="xs"
            >
              {connectedToDrone ? "Disconnect" : "Connect"}
            </Button>
          ) : (
            <Tooltip label="Not connected to socket">
              <Button data-disabled onClick={(event) => event.preventDefault()}>
                Connect
              </Button>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  )
}
