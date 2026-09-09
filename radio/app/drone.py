import copy
import os
import re
import time
import traceback
from logging import Logger, getLogger
from pathlib import Path
from queue import Empty, Queue
from secrets import token_hex
from threading import Event, Lock, Thread, current_thread
from typing import Callable, Dict, List, Optional, Set

import serial
from pymavlink import mavutil
from serial.serialutil import SerialException

from app.controllers.armController import ArmController
from app.controllers.flightModesController import FlightModesController
from app.controllers.frameController import FrameController
from app.controllers.ftpController import FtpController
from app.controllers.gripperController import GripperController
from app.controllers.missionController import MissionController
from app.controllers.motorTestController import MotorTestController
from app.controllers.navController import NavController
from app.controllers.paramsController import ParamsController
from app.controllers.rcController import RcController
from app.controllers.serialPortsController import SerialPortsController
from app.controllers.servoController import ServoController
from app.customTypes import Number, Response, VehicleType
from app.utils import (
    commandAccepted,
    decodeFlightSwVersion,
    getFlightSwVersionString,
    getVehicleType,
    sendingCommandLock,
    sendMessage,
)

# Constants

LOG_LINE_LIMIT = 50000
CONNECT_STATUS_PARAM_THROTTLE_SECS = 0.2


DATASTREAM_RATES = {
    mavutil.mavlink.MAV_DATA_STREAM_RAW_SENSORS: 1,
    mavutil.mavlink.MAV_DATA_STREAM_EXTENDED_STATUS: 1,
    mavutil.mavlink.MAV_DATA_STREAM_RC_CHANNELS: 1,
    mavutil.mavlink.MAV_DATA_STREAM_RAW_CONTROLLER: 1,
    mavutil.mavlink.MAV_DATA_STREAM_POSITION: 1,
    mavutil.mavlink.MAV_DATA_STREAM_EXTRA1: 4,
    mavutil.mavlink.MAV_DATA_STREAM_EXTRA2: 3,
    mavutil.mavlink.MAV_DATA_STREAM_EXTRA3: 1,
}

VALID_BAUDRATES = [
    1200,
    4800,
    9600,
    13400,
    19200,
    38400,
    57600,
    75880,
    115200,
    230400,
    460800,
    500000,
    625000,
    921600,
    1000000,
    1500000,
]


class Drone:
    def __init__(
        self,
        port: str,
        baud: int = 57600,
        logger: Logger = getLogger("fgcs"),
        forwarding_address: Optional[str] = None,
        droneErrorCb: Optional[Callable] = None,
        droneDisconnectCb: Optional[Callable] = None,
        droneConnectStatusCb: Optional[Callable] = None,
        linkDebugStatsCb: Optional[Callable] = None,
        fetchingParameterCb: Optional[Callable] = None,
        connectionCancelEvent: Optional[Event] = None,
    ) -> None:
        """
        The drone class interfaces with the UAS via MavLink.

        Args:
            port (str): The port to connect to the drone.
            baud (int, optional): The baud rate for the connection. Defaults to 57600.
            droneErrorCb (Optional[Callable], optional): Callback function for drone errors. Defaults to None.
            droneDisconnectCb (Optional[Callable], optional): Callback function for drone disconnection. Defaults to None.
            droneConnectStatusCb (Optional[Callable], optional): Callback function for drone connection providing an update as the drone connects. Defaults to None.
            linkDebugStatsCb (Optional[Callable], optional): Callback function for link debug stats. Defaults to None.
            fetchingParameterCb (Optional[Callable], optional): Callback function for when parameters are being fetched. Defaults to None.
            connectionCancelEvent (Optional[Event], optional): Event to signal if the connection process should be cancelled. Defaults to None.
        """
        self.port = port
        self.baud = baud
        self.logger = logger
        self.droneErrorCb = droneErrorCb
        self.droneDisconnectCb = droneDisconnectCb
        self.droneConnectStatusCb = droneConnectStatusCb
        self.linkDebugStatsCb = linkDebugStatsCb
        self.fetchingParameterCb = fetchingParameterCb
        self.connection_cancel_event: Event = connectionCancelEvent or Event()

        self.connectionError: Optional[str] = None
        self._last_connect_progress: float = 0.0
        self._last_param_progress_emit_time: float = 0.0
        self._last_connect_status_payload: Optional[dict] = None

        self.connection_phases = [
            "Waiting for heartbeat",
            "Setting up forwarding",
            "Fetching parameters",
            "Setting up controllers",
            "Connection complete",
        ]

        self.logger.debug(f"Trying to setup master with port {port} and baud {baud}")

        if not Drone.checkBaudrateValid(baud):
            self.connectionError = (
                f"{baud} is an invalid baudrate. Valid baud rates are {VALID_BAUDRATES}"
            )
            return

        try:
            self.sendConnectionStatusUpdate(0)
            # Source system and component set to GCS values
            self.master: mavutil.mavserial = mavutil.mavlink_connection(
                port,
                baud=baud,
                source_system=255,
                source_component=mavutil.mavlink.MAV_COMP_ID_MISSIONPLANNER,
            )
        except Exception as e:
            self.logger.exception(traceback.format_exc())
            self.master = None
            if isinstance(e, SerialException):
                self.logger.error(str(e))
                self.connectionError = "Could not connect to drone, invalid port."
            elif isinstance(e, ConnectionRefusedError):
                self.logger.error(str(e))
                self.connectionError = "Could not connect to drone, connection refused."
            else:
                self.connectionError = str(e)
            return

        if self._isConnectionCancelRequested():
            self._setCancelledConnectionErrorAndCloseMaster()
            return

        try:
            self.master.mav.heartbeat_send(
                mavutil.mavlink.MAV_TYPE_GCS,
                mavutil.mavlink.MAV_AUTOPILOT_INVALID,
                0,
                0,
                mavutil.mavlink.MAV_STATE_ACTIVE,
            )
        except Exception as e:
            self.logger.warning(
                f"Failed to send initial outgoing heartbeat: {e}", exc_info=True
            )

        try:
            initial_heartbeat = None
            heartbeat_timeout_secs = 5.0
            deadline = time.monotonic() + heartbeat_timeout_secs

            while True:
                if self._isConnectionCancelRequested():
                    self._setCancelledConnectionErrorAndCloseMaster()
                    return

                now = time.monotonic()
                if now >= deadline:
                    break

                remaining = deadline - now
                heartbeat = self.master.recv_match(
                    type="HEARTBEAT", blocking=True, timeout=max(remaining, 0.0)
                )

                if heartbeat is None:
                    continue

                # Ignore heartbeats from non-autopilot MAVLink components.
                if heartbeat.autopilot == mavutil.mavlink.MAV_AUTOPILOT_INVALID:
                    continue

                initial_heartbeat = heartbeat
                break

            if initial_heartbeat is None:
                self.logger.error(
                    f"No heartbeat received after {heartbeat_timeout_secs:.0f} seconds"
                )
                self.master.close()
                self.master = None
                self.connectionError = (
                    f"No heartbeat received after {heartbeat_timeout_secs:.0f} seconds."
                )
                return
        except Exception as e:
            self.logger.error(
                "Error while waiting for heartbeat: " + str(e), exc_info=True
            )
            if self.master is not None:
                self.master.close()
            self.master = None
            self.connectionError = (
                "An error occured while waiting for a heartbeat from the drone."
            )
            return

        self.aircraft_type = getVehicleType(initial_heartbeat.type)
        if self.aircraft_type not in (
            VehicleType.FIXED_WING.value,
            VehicleType.MULTIROTOR.value,
        ):
            self.logger.error("Aircraft not plane or quadcopter")
            self.master.close()
            self.master = None
            self.connectionError = f"Could not connect to the drone. Aircraft not plane or quadcopter, got type {self.aircraft_type}"
            return

        self.logger.info(f"Connected to aircraft of type {self.aircraft_type}")

        self.autopilot = initial_heartbeat.autopilot
        self.target_system = initial_heartbeat.get_srcSystem()
        self.target_component = initial_heartbeat.get_srcComponent()

        self.logger.debug(
            f"Heartbeat received (system {self.target_system} component {self.target_component})"
        )

        self.message_listeners: Dict[str, Callable] = {}
        self.message_queue: Queue = Queue()
        self.log_message_queue: Queue = Queue()

        self.log_directory = Path.home().joinpath("FGCS", "logs")
        self.log_directory.mkdir(parents=True, exist_ok=True)
        self.current_log_file: Optional[Path] = None
        self.log_file_names: List[Path] = []
        self.cleanTempLogs()

        # To ensure that only one command is sent at a time and we wait for a
        # response before sending another command, a thread-safe lock is used
        self.sending_command_lock = Lock()

        self.forwarding_address: Optional[str] = None
        self.forwarding_connection: Optional[mavutil.mavlink_connection] = None

        self.is_active = Event()
        self.is_active.set()

        self.reserved_messages: Set[str] = set()
        self.controller_queues: Dict[str, Queue] = {}
        self.reservation_lock = Lock()
        self.controller_id = f"Drone_{current_thread().ident}"

        self.armed = False
        self.capabilities: Optional[list[str]] = None
        self.flight_sw_version: Optional[tuple[int, int, int, int]] = None

        self.startThread()

        self.addMessageListener("STATUSTEXT", sendMessage)

        if self._isConnectionCancelRequested():
            self._setCancelledConnectionErrorAndCloseMaster()
            self.is_active.clear()
            self.stopAllThreads()
            return

        self.getAutopilotVersion()

        if self.flight_sw_version is None:
            self.logger.error("Could not determine flight software version")
            self.master.close()
            self.master = None
            self.connectionError = "Could not determine flight software version"
            return

        self.logger.info(
            f"Flight software version: {getFlightSwVersionString(self.flight_sw_version)}"
        )

        if self.flight_sw_version[0] != 4:
            self.logger.error("Unsupported flight software version")
            self.master.close()
            self.master = None
            self.connectionError = f"Unsupported flight software version {getFlightSwVersionString(self.flight_sw_version)}. Only version 4.x.x is supported."
            return

        self.stopAllDataStreams()
        self.sendConnectionStatusUpdate(1)

        if forwarding_address:
            try:
                start_forwarding_result = self.startForwardingToAddress(
                    forwarding_address
                )
                if not start_forwarding_result.get("success", False):
                    self.logger.error(
                        f"Failed to start forwarding: {start_forwarding_result.get('message', 'Unknown error')}"
                    )
            except Exception as e:
                self.logger.error(f"Failed to start forwarding: {e}", exc_info=True)

        self.paramsController: ParamsController = ParamsController(self)
        self.sendConnectionStatusUpdate(2)
        fetch_all_params_result = self.paramsController.fetchAllParamsBlocking(
            timeout_secs=120,
            progress_update_callback=self.sendParamFetchConnectionStatusUpdate,
            should_cancel_callback=self._isConnectionCancelRequested,
        )

        if not fetch_all_params_result.get("success"):
            self.is_active.clear()
            self.stopAllThreads()
            fetch_error_message = fetch_all_params_result.get(
                "message", "Could not fetch all drone parameters"
            )
            self.logger.error(fetch_error_message)
            self.master.close()
            self.master = None
            self.connectionError = fetch_error_message
            return

        self.sendConnectionStatusUpdate(3)
        self.setupControllers()
        self.sendConnectionStatusUpdate(4)

        self.sendStatusTextMessage(
            mavutil.mavlink.MAV_SEVERITY_INFO, "FGCS connected to aircraft"
        )

    def _isConnectionCancelRequested(self) -> bool:
        return self.connection_cancel_event.is_set()

    def requestConnectionCancel(self) -> None:
        self.connection_cancel_event.set()
        if getattr(self, "paramsController", None) is not None:
            self.paramsController.is_requesting_params = False

    def _setCancelledConnectionErrorAndCloseMaster(self) -> None:
        self.logger.info("Connection cancelled by user")
        self.connectionError = "Connection cancelled by user."
        if getattr(self, "master", None) is not None:
            try:
                self.master.close()
            except Exception:
                self.logger.exception("Failed to close connection during cancellation")
            self.master = None

    def __getNextLogFilePath(self, line: str) -> str:
        return line.split("==NEXT_FILE==")[-1].split("==END==")[0]

    def __getCurrentDateTimeStr(self) -> str:
        return time.strftime("%Y-%m-%d_%H-%M-%S", time.localtime())

    def setupControllers(self) -> None:
        self.armController = ArmController(self)
        self.flightModesController = FlightModesController(self)
        self.motorTestController = MotorTestController(self)
        self.gripperController = GripperController(self)
        self.missionController = MissionController(self)
        self.frameController = FrameController(self)
        self.rcController = RcController(self)
        self.servoController = ServoController(self)
        self.serialPortsController = SerialPortsController(self)
        self.navController = NavController(self)
        self.ftpController = FtpController(self)

    def _emitConnectionStatus(
        self, message: str, progress: float, sub_message: str = ""
    ) -> None:
        if not self.droneConnectStatusCb:
            return

        progress = round(min(max(float(progress), 0.0), 100.0), 2)
        progress = max(progress, self._last_connect_progress)
        payload = {
            "message": message,
            "sub_message": sub_message,
            "progress": progress,
        }

        if payload == self._last_connect_status_payload:
            return

        try:
            self.droneConnectStatusCb(payload)
        except Exception:
            self.logger.exception("Connection status callback failed")
            return

        self._last_connect_status_payload = payload.copy()
        self._last_connect_progress = progress

    def sendParamFetchConnectionStatusUpdate(self, data: dict) -> None:
        total_params = max(int(data.get("total_number_of_params", 0)), 1)
        current_index = max(int(data.get("current_param_index", 0)) + 1, 1)
        current_index = min(current_index, total_params)
        current_param_id = data.get("current_param_id", "")

        # Param fetch owns the entire bar while it is running.
        progress = round((current_index / total_params) * 100, 2)
        sub_message = f"{current_index}/{total_params}"
        if current_param_id:
            sub_message = f"{sub_message}: {current_param_id}"

        now = time.monotonic()
        is_final_update = current_index >= total_params
        if (
            not is_final_update
            and now - self._last_param_progress_emit_time
            < CONNECT_STATUS_PARAM_THROTTLE_SECS
        ):
            return

        self._emitConnectionStatus(
            message="Fetching Params",
            sub_message=sub_message,
            progress=progress,
        )
        self._last_param_progress_emit_time = now

    def sendConnectionStatusUpdate(self, msg_index: int) -> None:
        total_msgs = len(self.connection_phases)
        if msg_index < 0 or msg_index >= total_msgs:
            self.logger.error(f"Invalid connection status index {msg_index}")
            return

        msg = self.connection_phases[msg_index]

        # Do not regress progress during non-fetch stages.
        progress = 100.0 if msg_index == total_msgs - 1 else self._last_connect_progress
        self._emitConnectionStatus(message=msg, sub_message="", progress=progress)

    @staticmethod
    def checkBaudrateValid(baud: int) -> bool:
        return baud in VALID_BAUDRATES

    @staticmethod
    def getValidBaudrates() -> list[int]:
        return VALID_BAUDRATES

    def cleanTempLogs(self) -> None:
        """
        Clean up and try to recover any temporary log files that were not properly closed.
        """
        log_files = [
            file
            for file in self.log_directory.iterdir()
            if file.is_file() and file.name.startswith("tmp_")
        ]
        first_recovered_log_files = [
            file for file in log_files if file.name.startswith("tmp_first_")
        ]

        number_of_first_recovered_log_files = 0

        # Go through each first ("starting") log file
        for first_recovered_log_file in first_recovered_log_files:
            exif_date = None
            final_recovered_log_file = self.log_directory.joinpath(
                f"RECOVERED_TMP_{self.__getCurrentDateTimeStr()}.ftlog"
            )
            no_next_log_file_flag = False
            next_log_file = None

            with open(final_recovered_log_file, "a") as final_recovered_log_file_handle:
                with open(first_recovered_log_file) as first_recovered_log_file_handle:
                    lines = first_recovered_log_file_handle.readlines()
                    first_line = lines[0]
                    last_line = lines[-1]

                    if first_line.startswith("==START_TIME=="):
                        exif_date = first_line.split("==START_TIME==")[-1].split(
                            "==END=="
                        )[0]

                    final_recovered_log_file_handle.writelines(lines)
                    number_of_first_recovered_log_files += 1

                    # Try and get the file name of the next log file
                    # If the next file is not found, then the first log file is the only log file for this set of logs
                    if last_line.startswith("==NEXT_FILE=="):
                        next_log_file_name = self.__getNextLogFilePath(last_line)
                        next_log_file = self.log_directory.joinpath(next_log_file_name)

                        # If the next file is not found or doesn't exist in the list of log files, or if the file isn't a file, then stop the recovery
                        if (
                            not next_log_file
                            or next_log_file not in log_files
                            or not next_log_file.is_file()
                        ):
                            self.logger.error(
                                f"Could not find the next log file {next_log_file_name}, stopping recovery"
                            )
                            no_next_log_file_flag = True
                    else:
                        no_next_log_file_flag = True

            os.remove(first_recovered_log_file)

            if no_next_log_file_flag:
                continue

            # Go through each log file listed in the end of the previous log file whilst appending the messages to the final log file
            while next_log_file is not None:
                with open(
                    final_recovered_log_file, "a"
                ) as final_recovered_log_file_handle:
                    with open(next_log_file) as next_log_file_handle:
                        lines = next_log_file_handle.readlines()
                        final_recovered_log_file_handle.writelines(lines)
                        number_of_first_recovered_log_files += 1
                        last_line = lines[-1]

                        current_log_file = next_log_file

                        # Try and get the file name of the next log file
                        if last_line.startswith("==NEXT_FILE=="):
                            next_log_file_name = self.__getNextLogFilePath(last_line)
                            next_log_file = self.log_directory.joinpath(
                                next_log_file_name
                            )

                            # If the next file is not found or doesn't exist in the list of log files, or if the file isn't a file, then stop the recovery
                            if (
                                not next_log_file
                                or next_log_file not in log_files
                                or not next_log_file.is_file()
                            ):
                                self.logger.error(
                                    f"Could not find the next log file {next_log_file_name}, stopping recovery"
                                )
                                next_log_file = None
                        else:
                            next_log_file = None

                    # Remove the current log file as we're done reading from it
                    os.remove(current_log_file)

            if exif_date is not None:
                self.logger.debug(
                    f"Recovered logs {number_of_first_recovered_log_files} from {exif_date}"
                )
                new_final_recovered_log_file_name = self.log_directory.joinpath(
                    f"{exif_date}_RECOVERED.ftlog"
                )
                os.rename(
                    final_recovered_log_file,
                    new_final_recovered_log_file_name,
                )
            else:
                new_final_recovered_log_file_name = final_recovered_log_file

            self.logger.info(
                f"Saved {number_of_first_recovered_log_files} recovered drone logs to: {str(new_final_recovered_log_file_name)}"
            )

    def setupDataStreams(self) -> None:
        """
        Setups up data streams for the drone.

        The data streams and the messages returned are:
        - RAW_SENSORS: RAW_IMU, SCALED_IMU2, SCALED_IMU3, SCALED_PRESSURE, SCALED_PRESSURE2
        - EXTENDED_STATUS: SYS_STATUS, POWER_STATUS, MEMINFO, NAV_CONTROLLER_OUTPUT, MISSION_CURRENT, GPS_RAW_INT, MCU_STATUS
        - RC_CHANNELS: SERVO_OUTPUT_RAW, RC_CHANNELS
        - POSITION: LOCAL_POSITION, GLOBAL_POSITION_INT
        - EXTRA1: ESC_TELEMETRY_5_TO_8, ATTITUDE
        - EXTRA2: VFR_HUD
        - EXTRA3: BATTERY_STATUS, SYSTEM_TIME, VIBRATION, AHRS, WIND, TERRAIN_REPORT, EKF_STATUS_REPORT
        """

        # self.setupSingleDataStream(mavutil.mavlink.MAV_DATA_STREAM_RAW_SENSORS)
        self.setupSingleDataStream(mavutil.mavlink.MAV_DATA_STREAM_EXTENDED_STATUS)
        # self.setupSingleDataStream(mavutil.mavlink.MAV_DATA_STREAM_RC_CHANNELS)
        self.setupSingleDataStream(mavutil.mavlink.MAV_DATA_STREAM_POSITION)
        self.setupSingleDataStream(mavutil.mavlink.MAV_DATA_STREAM_EXTRA1)
        self.setupSingleDataStream(mavutil.mavlink.MAV_DATA_STREAM_EXTRA2)
        self.setupSingleDataStream(mavutil.mavlink.MAV_DATA_STREAM_EXTRA3)

    def setupSingleDataStream(self, stream: int) -> None:
        """Set up a single data stream.

        Args:
            stream (int): The data stream to set up
        """
        rate = DATASTREAM_RATES.get(stream)
        if rate is None:
            self.logger.warning(
                f"No configured rate for stream {stream}; skipping setup request"
            )
            return
        self.sendDataStreamRequestMessage(stream, rate)

    @sendingCommandLock
    def sendDataStreamRequestMessage(self, stream: int, rate: int) -> None:
        """Send a request for a specific data stream.

        Args:
            stream (int): The data stream to request
            rate (int): The rate, in hertz, to receive the data stream
        """
        self.master.mav.request_data_stream_send(
            self.target_system,
            self.target_component,
            stream,
            rate,
            1,
        )

    @sendingCommandLock
    def stopAllDataStreams(self) -> None:
        """Stop all data streams"""
        self.master.mav.request_data_stream_send(
            self.target_system,
            self.target_component,
            mavutil.mavlink.MAV_DATA_STREAM_ALL,
            1,
            0,
        )

    def addMessageListener(self, message_id: str, func: Callable) -> bool:
        """Add a message listener for a specific message.

        Args:
            message_id (int): The message to add a listener for.
            func (Optional[Callable], optional): The function to run when the message is received. Defaults to None.

        Returns:
            bool: True if the listener was added, False if it already exists
        """
        if message_id not in self.message_listeners:
            self.message_listeners[message_id] = func
            return True
        return False

    def removeMessageListener(self, message_id: str) -> bool:
        """Removes a message listener for a specific message.

        Args:
            message_id (str): The message to remove the listener for.

        Returns:
            bool: True if the listener was removed, False if it does not exist
        """
        if message_id in self.message_listeners:
            del self.message_listeners[message_id]
            return True
        return False

    def clearAllMessageListeners(self) -> None:
        """Clears all message listeners."""
        self.message_listeners.clear()

    def reserve_message_type(self, message_type: str, controller_id: str) -> bool:
        """Reserve a message type for exclusive controller use.

        Args:
            message_type: The MAVLink message type to reserve (e.g., "COMMAND_ACK")
            controller_id: Unique identifier for the controller

        Returns:
            bool: True if reservation successful, False if already reserved
        """
        with self.reservation_lock:
            if message_type in self.reserved_messages:
                return False

            self.reserved_messages.add(message_type)
            if controller_id not in self.controller_queues:
                self.controller_queues[controller_id] = Queue()

            return True

    def release_message_type(self, message_type: str, controller_id: str) -> None:
        """Release a reserved message type.

        Args:
            message_type: The message type to release
            controller_id: The controller releasing the message
        """
        with self.reservation_lock:
            self.reserved_messages.discard(message_type)
            # Clear any remaining messages in the controller's queue for this type
            # by creating a new, empty queue
            if controller_id in self.controller_queues:
                self.controller_queues[controller_id] = Queue()

    def wait_for_message(
        self,
        message_type: str,
        controller_id: str,
        timeout: float = 3.0,
        condition_func=None,
    ) -> Optional[mavutil.mavlink.MAVLink_message]:
        """Wait for a specific message type for a controller.

        Args:
            message_type: The message type to wait for
            controller_id: The controller waiting for the message
            timeout: How long to wait before timing out
            condition_func: Optional function to filter messages (e.g., lambda msg: msg.command == expected_cmd)

        Returns:
            The message object if received, None if timeout
        """
        if controller_id not in self.controller_queues:
            self.controller_queues[controller_id] = Queue()

        start_time = time.time()
        while time.time() - start_time < timeout:
            try:
                # Check controller's queue for the message
                queue_item = self.controller_queues[controller_id].get(timeout=0.1)
                msg_type, msg = queue_item

                if msg_type == message_type:
                    # Apply condition filter if provided
                    if condition_func is None or condition_func(msg):
                        return msg
                    else:
                        # Not the message we're looking for, continue waiting
                        continue

            except Empty:
                continue

        self.logger.debug(
            f"Timeout waiting for message {message_type} for controller {controller_id}"
        )
        return None

    def checkForMessages(self) -> None:
        """Check for messages from the drone and add them to the message queue."""
        while self.is_active.is_set():
            try:
                msg = self.master.recv_msg()
            except mavutil.mavlink.MAVError as e:
                self.logger.error(e, exc_info=True)
                if self.droneErrorCb:
                    self.droneErrorCb(str(e))
                continue
            except AttributeError as e:
                self.logger.error(e, exc_info=True)
            except KeyboardInterrupt:
                break
            except (serial.serialutil.SerialException, ConnectionAbortedError):
                self.logger.error("Autopilot disconnected", exc_info=True)
                self.close()
                break
            except Exception as e:
                # Log any other unexpected exception
                self.logger.error(e, exc_info=True)
                if self.droneErrorCb:
                    self.droneErrorCb(str(e))
                continue

            if msg is None:
                # Avoid busy waiting
                time.sleep(0.05)
                continue

            if self.forwarding_connection is not None:
                try:
                    msg_buf = msg.get_msgbuf()
                    self.forwarding_connection.write(msg_buf)
                except Exception as e:
                    self.logger.error(f"Failed to forward message: {e}", exc_info=True)
                    self.stopForwarding()

            msg_name = msg.get_type()

            if msg_name == "HEARTBEAT":
                if (
                    msg.autopilot == mavutil.mavlink.MAV_AUTOPILOT_INVALID
                ):  # No valid autopilot, e.g. a GCS or other MAVLink component
                    continue

                self.armed = bool(
                    msg.base_mode & mavutil.mavlink.MAV_MODE_FLAG_SAFETY_ARMED
                )

            if self.armed:
                try:
                    self.log_message_queue.put(
                        f"{msg._timestamp},{msg_name},{','.join([f'{message}:{msg.to_dict()[message]}' for message in msg.to_dict() if message != 'mavpackettype'])}"
                    )
                except Exception as e:
                    self.log_message_queue.put(f"Writing message failed! {e}")
                    continue

            if msg_name == "TIMESYNC":
                component_timestamp = msg.ts1
                local_timestamp = time.time_ns()
                self.master.mav.timesync_send(local_timestamp, component_timestamp)
                continue
            elif msg_name == "STATUSTEXT":
                self.logger.info(msg.text)

            with self.reservation_lock:
                if msg_name in self.reserved_messages:
                    # Route to controller queues
                    for controller_id, queue in self.controller_queues.items():
                        try:
                            queue.put((msg_name, msg), block=False)
                        except Exception:
                            # Queue full
                            pass
                else:
                    # Route to normal message listeners
                    if msg_name in self.message_listeners:
                        self.message_queue.put([msg_name, msg])

    def executeMessages(self) -> None:
        """Executes message listeners based on messages from the message queue."""
        while self.is_active.is_set():
            try:
                q = self.message_queue.get(timeout=1)
                self.message_listeners[q[0]](q[1])
            except Empty:
                continue
            except KeyError as e:
                self.logger.error(
                    f"Could not execute message (likely due to backend abruptly stopping): {e}"
                )

    def logMessages(self) -> None:
        """A thread to log messages into a temp FTLog file from the log queue."""
        current_line_number = 0

        while self.is_active.is_set():
            try:
                log_msg = self.log_message_queue.get(timeout=1)
                if log_msg:
                    # Check if a temp log file has been created yet, if not create one
                    if self.current_log_file is None:
                        self.current_log_file = self.log_directory.joinpath(
                            f"tmp_first_{token_hex(8)}.ftlog"
                        )
                        self.log_file_names.append(self.current_log_file)
                        with open(self.current_log_file, "w") as f:
                            f.write(
                                f"==START_TIME=={self.__getCurrentDateTimeStr()}==END==\n"
                            )

                    # Write the incoming telemetry message to the temp log file
                    if current_line_number < LOG_LINE_LIMIT:
                        with open(
                            self.current_log_file, "a"
                        ) as current_log_file_handler:
                            current_log_file_handler.write(log_msg + "\n")
                            current_line_number += 1
                    else:
                        # If the current log file has reached the line limit, create a new temp log file
                        next_log_file_name = self.log_directory.joinpath(
                            f"tmp_{token_hex(8)}.ftlog"
                        )
                        with open(
                            self.current_log_file, "a"
                        ) as current_log_file_handler:
                            # Write the next file name to the current log file
                            current_log_file_handler.write(
                                f"==NEXT_FILE=={str(next_log_file_name)}==END==\n"
                            )

                        self.current_log_file = next_log_file_name
                        self.log_file_names.append(self.current_log_file)

                        with open(self.current_log_file, "w") as f:
                            f.write(
                                f"==START_TIME=={self.__getCurrentDateTimeStr()}==END==\n"
                            )
                            f.write(log_msg + "\n")
                            current_line_number = 1
            except Empty:
                continue

    def getLinkDebugData(self) -> None:
        """While active, get link debug data"""
        refresh_rate_hz = 2

        if not hasattr(self, "_sliding_window"):
            self._sliding_window: dict[str, list] = {
                "packets_sent": [],
                "bytes_sent": [],
                "packets_received": [],
                "bytes_received": [],
            }

        if not hasattr(self, "_last_link_stats"):
            self._last_link_stats: dict[str, Number] = {
                "total_packets_sent": 0,
                "total_bytes_sent": 0,
                "total_packets_received": 0,
                "total_bytes_received": 0,
                "total_receive_errors": 0,
                "uptime": 0,
            }

        while self.is_active.is_set():
            if self.linkDebugStatsCb:
                try:
                    link_stats = {
                        "total_packets_sent": self.master.mav.total_packets_sent,
                        "total_bytes_sent": self.master.mav.total_bytes_sent,
                        "total_packets_received": self.master.mav.total_packets_received,
                        "total_bytes_received": self.master.mav.total_bytes_received,
                        "total_receive_errors": self.master.mav.total_receive_errors,
                        "uptime": self.master.uptime,
                    }

                    # Update sliding window
                    self._sliding_window["packets_sent"].append(
                        link_stats["total_packets_sent"]
                        - self._last_link_stats["total_packets_sent"]
                    )
                    self._sliding_window["bytes_sent"].append(
                        link_stats["total_bytes_sent"]
                        - self._last_link_stats["total_bytes_sent"]
                    )
                    self._sliding_window["packets_received"].append(
                        link_stats["total_packets_received"]
                        - self._last_link_stats["total_packets_received"]
                    )
                    self._sliding_window["bytes_received"].append(
                        link_stats["total_bytes_received"]
                        - self._last_link_stats["total_bytes_received"]
                    )

                    # Keep only the last x readings
                    for key in self._sliding_window:
                        if len(self._sliding_window[key]) > refresh_rate_hz:
                            self._sliding_window[key].pop(0)

                    # Calculate averages over the last x readings
                    link_stats["avg_packets_sent_per_sec"] = sum(
                        self._sliding_window["packets_sent"]
                    ) / len(self._sliding_window["packets_sent"])
                    link_stats["avg_bytes_sent_per_sec"] = sum(
                        self._sliding_window["bytes_sent"]
                    ) / len(self._sliding_window["bytes_sent"])
                    link_stats["avg_packets_received_per_sec"] = sum(
                        self._sliding_window["packets_received"]
                    ) / len(self._sliding_window["packets_received"])
                    link_stats["avg_bytes_received_per_sec"] = sum(
                        self._sliding_window["bytes_received"]
                    ) / len(self._sliding_window["bytes_received"])

                    self._last_link_stats = copy.deepcopy(link_stats)

                    self.linkDebugStatsCb(link_stats)
                except Exception as e:
                    self.logger.error(e, exc_info=True)

            time.sleep(1 / refresh_rate_hz)

    def sendHeartbeatMessage(self) -> None:
        """Sends a heartbeat message to the drone every second."""
        heartbeat_interval_secs = 1.0
        next_heartbeat_time = time.monotonic()

        while self.is_active.is_set():
            now = time.monotonic()
            sleep_time = next_heartbeat_time - now
            if sleep_time > 0:
                time.sleep(sleep_time)

            master = getattr(self, "master", None)
            if master is None:
                # Connection teardown can clear master while this thread is winding down.
                break

            try:
                master.mav.heartbeat_send(
                    mavutil.mavlink.MAV_TYPE_GCS,
                    mavutil.mavlink.MAV_AUTOPILOT_INVALID,
                    0,
                    0,
                    mavutil.mavlink.MAV_STATE_ACTIVE,
                )
            except Exception as e:
                self.logger.error(f"Failed to send heartbeat: {e}", exc_info=True)

            # Keep a stable 1Hz cadence and recover if we fall behind.
            next_heartbeat_time += heartbeat_interval_secs
            if next_heartbeat_time < time.monotonic():
                next_heartbeat_time = time.monotonic() + heartbeat_interval_secs

    def startThread(self) -> None:
        """Starts the listener and sender threads."""
        self.listener_thread = Thread(target=self.checkForMessages, daemon=True)
        self.sender_thread = Thread(target=self.executeMessages, daemon=True)
        self.log_thread = Thread(target=self.logMessages, daemon=True)
        self.link_debug_data_thread = Thread(target=self.getLinkDebugData, daemon=True)
        self.heartbeat_thread = Thread(target=self.sendHeartbeatMessage, daemon=True)
        self.listener_thread.start()
        self.sender_thread.start()
        self.log_thread.start()
        self.link_debug_data_thread.start()
        self.heartbeat_thread.start()

    def stopAllThreads(self) -> None:
        """Stops all threads."""
        self.is_active.clear()

        this_thread = current_thread()

        if getattr(self, "paramsController", None) is not None:
            self.paramsController.is_requesting_params = False

        for thread in [
            getattr(self, "listener_thread", None),
            getattr(self, "sender_thread", None),
            getattr(self, "log_thread", None),
            getattr(self, "link_debug_data_thread", None),
            getattr(self, "heartbeat_thread", None),
        ]:
            if thread is not None and thread.is_alive() and thread is not this_thread:
                thread.join(timeout=3)

    @sendingCommandLock
    def getAutopilotVersion(self) -> None:
        """Get the autopilot version."""
        if not self.reserve_message_type("AUTOPILOT_VERSION", self.controller_id):
            self.logger.error("Could not reserve AUTOPILOT_VERSION messages")
            return

        try:
            self.sendCommand(
                mavutil.mavlink.MAV_CMD_REQUEST_MESSAGE,
                param1=mavutil.mavlink.MAVLINK_MSG_ID_AUTOPILOT_VERSION,
            )

            response = self.wait_for_message(
                "AUTOPILOT_VERSION", self.controller_id, timeout=5
            )

            if response is None:
                self.logger.error("Failed to get autopilot version: Timeout")
                return

            capabilities = getattr(response, "capabilities", None)
            if capabilities is not None:
                # Decode capabilities bitmask into list of capability names
                capabilities_map = mavutil.mavlink.enums["MAV_PROTOCOL_CAPABILITY"]
                self.capabilities = []
                for capability_value, capability_enum in capabilities_map.items():
                    if capabilities & capability_value:
                        self.capabilities.append(capability_enum.name)

            flight_sw_version = getattr(response, "flight_sw_version", None)
            if flight_sw_version is not None:
                self.flight_sw_version = decodeFlightSwVersion(flight_sw_version)

        except serial.serialutil.SerialException:
            self.logger.error("Failed to get autopilot version due to serial exception")
        finally:
            self.release_message_type("AUTOPILOT_VERSION", self.controller_id)

    def rebootAutopilot(self) -> bool:
        """Reboot the autopilot.

        Returns:
            bool: True if the reboot command was successfully sent and accepted, False otherwise.
        """
        if not self.reserve_message_type("COMMAND_ACK", self.controller_id):
            self.logger.error("Could not reserve COMMAND_ACK messages for reboot")
            return False

        try:
            self.sending_command_lock.acquire()

            self.sendCommand(
                mavutil.mavlink.MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN,
                param1=1,  #  Autopilot
                param2=0,  #  Companion
                param3=0,  # Component action
                param4=0,  # Component ID
            )

            response = self.wait_for_message(
                "COMMAND_ACK",
                self.controller_id,
                condition_func=lambda msg: msg.command
                == mavutil.mavlink.MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN,
            )

            self.sending_command_lock.release()
            self.release_message_type("COMMAND_ACK", self.controller_id)

            if commandAccepted(
                response, mavutil.mavlink.MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN
            ):
                self.logger.info("Rebooting autopilot")
                self.close()
                return True
            else:
                self.logger.error("Reboot failed, command not accepted")
                return False
        except serial.serialutil.SerialException:
            self.logger.info("Rebooting autopilot")
            self.sending_command_lock.release()
            self.release_message_type("COMMAND_ACK", self.controller_id)
            self.close()
            return True

    def sendCommand(
        self,
        message: int,
        param1: float = 0,
        param2: float = 0,
        param3: float = 0,
        param4: float = 0,
        param5: float = 0,
        param6: float = 0,
        param7: float = 0,
    ) -> None:
        """Send a command long to the drone. COMMAND_LONG must be used for
        sending MAV_CMD commands that send float properties in parameters
        5 and 6, as these values would be truncated tointegers if sent in
        COMMAND_INT.

        Args:
            message (float): The message to send
            param1 (float, optional)
            param2 (float, optional)
            param3 (float, optional)
            param4 (float, optional)
            param5 (float, optional)
            param6 (float, optional)
            param7 (float, optional)
        """
        message = self.master.mav.command_long_encode(
            self.target_system,
            self.target_component,
            message,
            0,  # Confirmation
            param1,  # param 1
            param2,  # param 2
            param3,  # param 3
            param4,  # param 4
            param5,  # param 5
            param6,  # param 6
            param7,  # param 7
        )
        self.master.mav.send(message)

    def sendCommandInt(
        self,
        message: int,
        frame: int = 0,
        param1: float = 0,
        param2: float = 0,
        param3: float = 0,
        param4: float = 0,
        x: Number = 0,
        y: Number = 0,
        z: float = 0,
    ):
        """
        Send a command int to the drone. COMMAND_INT should be used when sending
        commands that contain positional or navigation information. This is
        because it allows the co-ordinate frame to be specified for location and
        altitude values, which may otherwise be "unspecified". In addition
        latitudes/longitudes can be sent with greater precision in a COMMAND_INT
        as scaled integers in params 5 and 6 (than when sent in float values in
        COMMAND_LONG).

        Args:
            message (float): The message to send
            frame (float, optional): The coordinate system of the command
            param1 (float, optional)
            param2 (float, optional)
            param3 (float, optional)
            param4 (float, optional)
            x (Number, optional)
            y (Number, optional)
            z (float, optional)
        """
        current = 0
        autocontinue = 0

        if isinstance(x, float):
            x = int(x * 1e7)
        if isinstance(y, float):
            y = int(y * 1e7)

        self.master.mav.command_int_send(
            self.target_system,
            self.target_component,
            frame,
            message,
            current,
            autocontinue,
            param1,
            param2,
            param3,
            param4,
            x,
            y,
            z,
        )

    def sendStatusTextMessage(self, severity: int, text: str) -> None:
        """Send a status text message to the drone.

        Args:
            severity (int): The severity of the message
            text (str): The text of the message
        """
        max_len = 50
        for i in range(0, len(text), max_len):
            chunk = text[i : i + max_len]
            self.master.mav.statustext_send(severity, chunk.encode("utf-8"))

    def startForwardingToAddress(self, address: str) -> Response:
        """Start forwarding MAVLink messages to a specific address.

        Args:
            address (str): The address to forward messages to.
        """
        if self.forwarding_address == address:
            self.logger.debug(f"Already forwarding to address {address}")
            return {
                "success": True,
                "message": f"Already forwarding to address {address}",
            }

        # Check if the forwarding address is in the format: "udpout:IP:PORT" or "tcpout:IP:PORT"
        match = re.match(
            r"^((udpout|tcpout):(([0-9]{1,3}\.){3}[0-9]{1,3}):([0-9]{1,5}))$", address
        )
        if not match:
            self.logger.warning(
                f"Invalid forwarding address format. Must be in the format udpout:IP:PORT or tcpout:IP:PORT, got {address}"
            )
            return {
                "success": False,
                "message": "Address must be in the format udpout:IP:PORT or tcpout:IP:PORT",
            }

        self.stopForwarding()

        self.forwarding_address = address
        self.forwarding_connection = mavutil.mavlink_connection(
            self.forwarding_address, timeout=1
        )
        self.logger.info(f"Started forwarding to address {address}")

        return {"success": True, "message": f"Started forwarding to address {address}"}

    def stopForwarding(self) -> Response:
        """Stop forwarding MAVLink messages."""
        if self.forwarding_connection is not None:
            self.forwarding_connection.close()
            self.forwarding_connection = None
            self.logger.info(f"Stopped forwarding to address {self.forwarding_address}")
            self.forwarding_address = None
            return {"success": True, "message": "Stopped forwarding"}
        else:
            return {"success": False, "message": "Not currently forwarding"}

    def close(self) -> None:
        """Close the connection to the drone."""
        self.logger.info(f"Cleaning up resources for drone at {self}")
        self.clearAllMessageListeners()

        if self.droneDisconnectCb:
            self.droneDisconnectCb()

        self.is_active.clear()

        if getattr(self, "master", None) is not None:
            self.stopAllDataStreams()
        self.stopForwarding()
        self.stopAllThreads()

        if getattr(self, "master", None) is not None:
            self.master.close()
            self.master = None

        if len(self.log_file_names) == 0:
            self.logger.debug("No logs to save")
        elif (
            len(self.log_file_names) == 1
            and os.stat(self.log_file_names[0]).st_size <= 0
        ):
            os.remove(self.log_file_names[0])
            self.logger.debug("No logs to save")
        else:
            final_log_file = self.log_directory.joinpath(
                f"{self.__getCurrentDateTimeStr()}.ftlog"
            )

            try:
                with open(final_log_file, "a") as final_log_file_handle:
                    # Open all the log files that were written to in the current session and write their data to the final log file
                    for log_file in self.log_file_names:
                        if not log_file.is_file():
                            self.logger.warning(f"Log file {log_file} is not a file.")
                            continue

                        with open(log_file) as log_file_handle:
                            final_log_file_handle.writelines(
                                log_file_handle.readlines()
                            )
                        os.remove(log_file)
            except Exception as e:
                self.logger.error("Failed to save drone logs")
                self.logger.error(e, exc_info=True)

            self.logger.info(f"Saved drone logs to: {final_log_file}")
        self.logger.debug("Closed connection to drone")
