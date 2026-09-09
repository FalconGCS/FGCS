import copy

from pymavlink import mavutil
from typing_extensions import TypedDict

import app.droneStatus as droneStatus
from app import logger, socketio
from app.drone import DATASTREAM_RATES
from app.utils import (
    missingParameterError,
    sendMessage,
)


class SetStateType(TypedDict):
    state: str


class SetStreamRateType(TypedDict):
    stream: int
    rate: int


GLOBAL_MESSAGE_LISTENERS = ["HEARTBEAT", "STATUSTEXT", "GLOBAL_POSITION_INT", "VFR_HUD"]

STATES_MESSAGE_LISTENERS = {
    "dashboard": [
        "BATTERY_STATUS",
        "ATTITUDE",
        "ALTITUDE",
        "NAV_CONTROLLER_OUTPUT",
        "SYS_STATUS",
        "GPS_RAW_INT",
        "GPS2_RAW",
        "RC_CHANNELS",
        "ESC_TELEMETRY_1_TO_4",
        "ESC_TELEMETRY_5_TO_8",
        "MISSION_CURRENT",
        "EKF_STATUS_REPORT",
        "VIBRATION",
    ],
    "missions": [
        "NAV_CONTROLLER_OUTPUT",
    ],
    "graphs": ["ATTITUDE", "SYS_STATUS"],
    "config.flight_modes": [
        "RC_CHANNELS",
    ],
    "config.rc": ["RC_CHANNELS"],
    "config.servo": ["SERVO_OUTPUT_RAW"],
}


DASHBOARD_STREAM_RATES = copy.deepcopy(DATASTREAM_RATES)


def apply_dashboard_stream_rates() -> None:
    if not droneStatus.drone:
        return

    for stream, rate in DASHBOARD_STREAM_RATES.items():
        droneStatus.drone.sendDataStreamRequestMessage(stream, rate)


@socketio.on("set_state")
def set_state(data: SetStateType) -> None:
    """
    Set the state of the drone based on the file current page we are on

    Args:
        data: The form data passed in from the frontend, this contains the state we wish to change to
    """
    # Ensure that a state was actually sent
    if (newState := data.get("state", None)) is None:
        return missingParameterError("set_state", "state")

    logger.info(f"Changing state to {newState}")

    droneStatus.state = newState

    if not droneStatus.drone:
        return

    # Reset all data streams
    droneStatus.drone.stopAllDataStreams()

    # Remove all existing message listeners
    droneStatus.drone.clearAllMessageListeners()

    # Always setup position stream to get GLOBAL_POSITION_INT messages on
    # non-dashboard pages
    if droneStatus.state != "dashboard":
        droneStatus.drone.sendDataStreamRequestMessage(
            mavutil.mavlink.MAV_DATA_STREAM_POSITION, 1
        )

    for message in GLOBAL_MESSAGE_LISTENERS:
        droneStatus.drone.addMessageListener(message, sendMessage)

    if droneStatus.state == "dashboard":
        apply_dashboard_stream_rates()
        for message in STATES_MESSAGE_LISTENERS["dashboard"]:
            droneStatus.drone.addMessageListener(message, sendMessage)

    elif droneStatus.state == "missions":
        droneStatus.drone.sendDataStreamRequestMessage(
            mavutil.mavlink.MAV_DATA_STREAM_EXTENDED_STATUS, 1
        )
        for message in STATES_MESSAGE_LISTENERS["missions"]:
            droneStatus.drone.addMessageListener(message, sendMessage)
    elif droneStatus.state == "graphs":
        droneStatus.drone.sendDataStreamRequestMessage(
            mavutil.mavlink.MAV_DATA_STREAM_EXTENDED_STATUS, 1
        )
        droneStatus.drone.sendDataStreamRequestMessage(
            mavutil.mavlink.MAV_DATA_STREAM_EXTRA1, 4
        )
        droneStatus.drone.sendDataStreamRequestMessage(
            mavutil.mavlink.MAV_DATA_STREAM_EXTRA2, 3
        )

        for message in STATES_MESSAGE_LISTENERS["graphs"]:
            droneStatus.drone.addMessageListener(message, sendMessage)
    elif droneStatus.state == "config.flight_modes":
        droneStatus.drone.sendDataStreamRequestMessage(
            mavutil.mavlink.MAV_DATA_STREAM_RC_CHANNELS, 2
        )

        for message in STATES_MESSAGE_LISTENERS["config.flight_modes"]:
            droneStatus.drone.addMessageListener(message, sendMessage)
    elif droneStatus.state == "config.rc":
        droneStatus.drone.sendDataStreamRequestMessage(
            mavutil.mavlink.MAV_DATA_STREAM_RC_CHANNELS, 4
        )

        for message in STATES_MESSAGE_LISTENERS["config.rc"]:
            droneStatus.drone.addMessageListener(message, sendMessage)
    elif droneStatus.state == "config.servo":
        droneStatus.drone.sendDataStreamRequestMessage(
            mavutil.mavlink.MAV_DATA_STREAM_RC_CHANNELS, 4
        )

        for message in STATES_MESSAGE_LISTENERS["config.servo"]:
            droneStatus.drone.addMessageListener(message, sendMessage)


@socketio.on("set_stream_rate")
def set_stream_rate(data: SetStreamRateType):
    if not droneStatus.drone:
        return

    if (rate := data.get("rate", None)) is None:
        return missingParameterError("set_stream_rate", "rate")

    if (stream := data.get("stream", None)) is None:
        return missingParameterError("set_stream_rate", "stream")

    try:
        rate = int(rate)
        stream = int(stream)
    except (ValueError, TypeError):
        logger.error("Invalid set_stream_rate payload types")
        return

    if rate > 15 or rate < 0:
        logger.error("Cannot set data stream rate outside of range [0, 15]")
        return

    DASHBOARD_STREAM_RATES[stream] = rate

    # Dashboard-only behavior: only apply immediately while dashboard is active.
    if droneStatus.state == "dashboard":
        logger.info(f"Setting dashboard data stream {stream} rate to {rate}")
        droneStatus.drone.sendDataStreamRequestMessage(stream, rate)
