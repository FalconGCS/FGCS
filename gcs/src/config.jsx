/*
  The config screen. Allows the testing and configuration of the settings and parameters of the drone

  This includes gripper testing, motor testing, RC configuration and Flight mode configuration
*/

// Base imports
import { useEffect } from "react"

// 3rd Party Imports
import { Tabs } from "@mantine/core"

// Custom component and helpers
import Failsafes from "./components/config/failsafe"
import FlightModes from "./components/config/flightModes"
import Ftp from "./components/config/ftp"
import Gripper from "./components/config/gripper"
import Motortestpanel from "./components/config/motorTest"
import RadioCalibration from "./components/config/radioCalibration"
import Layout from "./components/layout"
import NoDroneConnected from "./components/noDroneConnected"

// Redux
import { useDispatch, useSelector } from "react-redux"
import { selectActiveTab, setActiveTab } from "./redux/slices/configSlice"
import { selectConnectedToDrone } from "./redux/slices/droneConnectionSlice"
import SerialPorts from "./components/config/serialPorts"
import ServoOutput from "./components/config/servoOutput"

export default function Config() {
  const dispatch = useDispatch()
  const connected = useSelector(selectConnectedToDrone)
  const activeTab = useSelector(selectActiveTab)
  const paddingTop = "mt-4"

  useEffect(() => {
    if (!connected) {
      dispatch(setActiveTab(null))
    }
  }, [connected])

  return (
    <Layout currentPage="config">
      {connected ? (
        <div className="size-full">
          <Tabs
            orientation="vertical"
            color={"red"}
            className="h-full"
            keepMounted={false}
            value={activeTab}
            onChange={(newTab) => dispatch(setActiveTab(newTab))}
          >
            <Tabs.List>
              <Tabs.Tab value="gripper">Gripper</Tabs.Tab>
              <Tabs.Tab value="motor_test">Motor Test</Tabs.Tab>
              <Tabs.Tab value="rc_calibration">RC Calibration</Tabs.Tab>
              <Tabs.Tab value="flightmodes">Flight modes</Tabs.Tab>
              <Tabs.Tab value="failsafes">Failsafes</Tabs.Tab>
              <Tabs.Tab value="servo">Servo Output</Tabs.Tab>
              <Tabs.Tab value="serial_ports">Serial Ports</Tabs.Tab>
              <Tabs.Tab value="ftp">FTP</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="gripper">
              <div className={paddingTop}>
                <Gripper />
              </div>
            </Tabs.Panel>
            <Tabs.Panel value="motor_test">
              <div className={paddingTop}>
                <Motortestpanel />
              </div>
            </Tabs.Panel>
            <Tabs.Panel value="rc_calibration">
              <div className={paddingTop}>
                <RadioCalibration />
              </div>
            </Tabs.Panel>
            <Tabs.Panel value="flightmodes">
              <div className={paddingTop}>
                <FlightModes />
              </div>
            </Tabs.Panel>
            <Tabs.Panel value="failsafes">
              <div className="size-full">
                <Failsafes />
              </div>
            </Tabs.Panel>
            <Tabs.Panel value="servo">
              <div className={paddingTop}>
                <ServoOutput />
              </div>
            </Tabs.Panel>
            <Tabs.Panel value="serial_ports">
              <div className={paddingTop}>
                <SerialPorts />
              </div>
            </Tabs.Panel>
            <Tabs.Panel value="ftp">
              <div className={paddingTop}>
                <Ftp />
              </div>
            </Tabs.Panel>
          </Tabs>
        </div>
      ) : (
        <NoDroneConnected tab="config" />
      )}
    </Layout>
  )
}
