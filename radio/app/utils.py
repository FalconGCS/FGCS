import logging
import math
import sys
from typing import Any, List, Optional, Union

from pymavlink import mavutil
from serial.tools import list_ports
from typing_extensions import NotRequired, TypedDict

from app.customTypes import Number, VehicleType

from . import socketio

logger = logging.getLogger("fgcs")


def getComPort() -> str:
    """
    Get a com port name from a selected list. This is only used in testing as its CLI interface and is NOT used in the GUI.

    Returns:
        The port name that was selected
    """
    while True:
        ports = list(list_ports.comports())

        print("Available COM ports:")
        for i in range(len(ports)):
            port = ports[i]
            print(f"\t[{i}]\t{port.name}: {port.description}")

        inp_port = input("Enter a port index to connect to: ")
        if not inp_port.isdigit():
            continue

        inp_port_num = int(inp_port)
        if 0 <= inp_port_num < len(ports):
            break

    if sys.platform == "darwin":
        port_name = ports[inp_port_num].name
        if port_name[:3] == "cu.":
            port_name = port_name[3:]

        port_name = f"/dev/tty.{port_name}"
    elif sys.platform in ["linux", "linux2"]:
        port_name = f"/dev/{ports[inp_port_num].name}"
    else:
        port_name = ports[inp_port_num].name

    return port_name


def getComPortNames() -> List[str]:
    """
    Gets a list of all available COM port names

    Returns:
        The names of COM ports available
    """
    ports = list(list_ports.comports())
    correct_ports = []
    for i in range(len(ports)):
        port = ports[i]
        if sys.platform == "darwin":
            port_name = port.name
            if port_name[:3] == "cu.":
                port_name = port_name[3:]

            port_name = f"/dev/tty.{port_name}"
        elif sys.platform in ["linux", "linux2"]:
            port_name = f"/dev/{port.name}"
        else:
            port_name = port.name

        correct_ports.append(port_name)

    return correct_ports


def secondsToMicroseconds(secs: float) -> int:
    """
    Converts seconds to microseconds

    Args:
        secs: The number in seconds

    Returns:
        The input "secs" in microseconds, as an integer
    """
    return int(secs * 1e6)


def commandAccepted(response: Any, command: int) -> bool:
    """
    Check if a command has been accepted

    Args:
        response: The response from the command
        command: The command inputted

    Returns:
        True if the command has been accepted, False otherwise.
    """
    if command is None:
        logger.warning("Command is None, cannot check if command accepted")
        return False

    if response is None:
        logger.warning(f"Response is None, cannot check if command {command} accepted")
        return False

    if response.command != command:
        logger.warning(
            f"Command {command} does not match response command {response.command}"
        )
        logger.debug(f"Full response: {response.to_dict()}, command: {command}")
        return False

    if response.result != mavutil.mavlink.MAV_RESULT_ACCEPTED:
        logger.warning(f"Command {command} not accepted, result: {response.result}")
        return False

    return True


def normalisePwmValue(val: float, min_val: float = 1000, max_val: float = 2000) -> int:
    """
    Normalise a PWM value to the range -1 to 1

    Args:
        val: The value to normalise
        min_val: Minimum pwm value accepted by the servo
        max_val: Maximum pwm value accepted by the servo

    Returns:
        The normalised PWM value
    """
    return int(2 * ((val - min_val) / (max_val - min_val)) - 1)


def droneErrorCb(msg: Any) -> None:
    """
    Send drone error to the socket

    Args:
        msg: The error message to send to the client
    """
    socketio.emit("drone_error", {"message": msg})


class ConnectionDataType(TypedDict):
    message: str
    progress: Number
    sub_message: NotRequired[str]


def droneConnectStatusCb(msg: ConnectionDataType) -> None:
    """
    Send drone connect status updates to the socket

    Args:
        msg: The connect message to send to the client
    """
    socketio.emit("drone_connect_status", msg)


def notConnectedError(action: Optional[str] = None) -> None:
    """
    Send error to the socket indicating that drone connection must be established to complete this action

    Args:
        action (str | None): The action the that requires drone connection. Default `None`.
    """
    socketio.emit(
        "connection_error",
        {
            "message": f"Must be connected to the drone to {'perform this action' if action is None else action}."
        },
    )


def fetchingParameterCb(param_name: str) -> None:
    """
    Send the parameter currently being fetched to the socket.

    Args:
        param_name (str): The name of the parameter currently being fetched.
    """
    socketio.emit(
        "fetching_param",
        {"success": True, "message": param_name},
    )


def missingParameterError(endpoint: str, params: Union[str, list[str]]) -> None:
    """ "
    Send error to the socket indicating that a request made to the server was missing required parameters

    Args
        endpoint (str): The endpoint that is missing a parameter
        params (str | list[str]): The names of the parameter/s that are missing from the request
    """
    socketio.emit(
        "drone_error",
        {
            "message": f"Request to endpoint {endpoint} missing value for parameter"
            + (f": {params}" if isinstance(params, str) else ", ".join(params))
            + "."
        },
    )


def coerceFiniteNumber(value: Any) -> Optional[float]:
    """
    Coerce a value from a socket payload into a finite number.
    """
    if isinstance(value, bool):
        return None

    try:
        number = float(value)
    except (TypeError, ValueError):
        return None

    return number if math.isfinite(number) else None


def sendMessage(msg: Any) -> None:
    """
    Sends a message to the frontend with a timestamp

    Args:
        msg: The message to send
    """
    data = msg.to_dict()
    data["timestamp"] = msg._timestamp
    socketio.emit("incoming_msg", data, namespace="/telemetry")


FIXED_WING_TYPES = [
    mavutil.mavlink.MAV_TYPE_FIXED_WING,
    mavutil.mavlink.MAV_TYPE_VTOL_DUOROTOR,
    mavutil.mavlink.MAV_TYPE_VTOL_QUADROTOR,
    mavutil.mavlink.MAV_TYPE_VTOL_TILTROTOR,
    # mavutil.mavlink.MAV_TYPE_VTOL_TAILSITTER,
    # mavutil.mavlink.MAV_TYPE_VTOL_TILTWING,
    mavutil.mavlink.MAV_TYPE_VTOL_RESERVED2,
    mavutil.mavlink.MAV_TYPE_VTOL_RESERVED3,
    mavutil.mavlink.MAV_TYPE_VTOL_RESERVED4,
    mavutil.mavlink.MAV_TYPE_VTOL_RESERVED5,
]

MULTIROTOR_TYPES = [
    mavutil.mavlink.MAV_TYPE_QUADROTOR,
    mavutil.mavlink.MAV_TYPE_HEXAROTOR,
    mavutil.mavlink.MAV_TYPE_OCTOROTOR,
    mavutil.mavlink.MAV_TYPE_TRICOPTER,
    mavutil.mavlink.MAV_TYPE_DODECAROTOR,
    mavutil.mavlink.MAV_TYPE_ADSB,  # For cube orange (?)
]


def getVehicleType(typeId: int) -> int:
    if typeId in FIXED_WING_TYPES:
        return VehicleType.FIXED_WING.value
    elif typeId in MULTIROTOR_TYPES:
        return VehicleType.MULTIROTOR.value
    else:
        return VehicleType.UNKNOWN.value


def sendingCommandLock(func):
    """A decorator to ensure that only one command is sent at a time."""

    def wrapper(self, *args, **kwargs):
        lock = getattr(self, "drone", self).sending_command_lock
        lock.acquire()
        try:
            return func(self, *args, **kwargs)
        finally:
            lock.release()

    return wrapper


def decodeFlightSwVersion(v: Optional[int]) -> Optional[tuple[int, int, int, int]]:
    """
    Decode a packed uint32 flight_sw_version into major.minor.patch and extra byte.
    Format (conventional MAVLink): [major:8][minor:8][patch:8][extra:8]
    Returns:
        A tuple of (major, minor, patch, extra) or None if input is None
    """
    if v is None:
        return None
    v &= 0xFFFFFFFF
    major = (v >> 24) & 0xFF
    minor = (v >> 16) & 0xFF
    patch = (v >> 8) & 0xFF
    extra = v & 0xFF

    return (major, minor, patch, extra)


def getFlightSwVersionString(v: Optional[tuple[int, int, int, int]]) -> str:
    """
    Convert flight_sw_version tuple into a human-readable string.
    """
    if v is None:
        return ""

    major, minor, patch, extra = v

    if extra != 0:
        return f"{major}.{minor}.{patch} ({extra:02x})"
    else:
        return f"{major}.{minor}.{patch}"
