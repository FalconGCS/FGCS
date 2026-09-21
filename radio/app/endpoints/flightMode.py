from typing_extensions import TypedDict

import app.droneStatus as droneStatus
from app import logger, socketio
from app.customTypes import SetFlightModeValueAndNumber
from app.utils import droneErrorCb, notConnectedError


class SetCurrentFlightModeType(TypedDict):
    newFlightMode: int


class SetFlightModeChannelType(TypedDict):
    channel: int


@socketio.on("get_flight_mode_config")
def getFlightModeConfig() -> None:
    """
    Sends the flight mode config to the frontend, only works when the config page is loaded.
    """
    if not droneStatus.drone:
        return notConnectedError(action="get the flight mode config")

    if droneStatus.state != "config.flight_modes":
        socketio.emit(
            "params_error",
            {"message": "You must be on the config screen to access the flight modes."},
        )
        logger.debug(f"Current state: {droneStatus.state}")
        return

    flight_modes_config = droneStatus.drone.flightModesController.getConfig()

    socketio.emit(
        "flight_mode_config",
        flight_modes_config,
    )


@socketio.on("set_flight_mode")
def setFlightMode(data: SetFlightModeValueAndNumber) -> None:
    """
    Sets the flight mode based off data passed in, only works when the config page is loaded.

    Args:
        data (SetFlightModeValueAndNumber): Contains the flight mode number and the flight mode to set to it
    """
    if not droneStatus.drone:
        return notConnectedError(action="set the flight mode")

    if droneStatus.state != "config.flight_modes":
        socketio.emit(
            "params_error",
            {"message": "You must be on the config screen to access the flight modes."},
        )
        logger.debug(f"Current state: {droneStatus.state}")
        return

    mode_number = data.get("mode_number", None)
    flight_mode = data.get("flight_mode", None)

    if mode_number is None or flight_mode is None:
        droneErrorCb("Mode number and flight mode must be specified.")
        return

    result = droneStatus.drone.flightModesController.setFlightMode(
        mode_number, flight_mode
    )

    socketio.emit("set_flight_mode_result", result)


@socketio.on("set_flight_mode_channel")
def setFlightModeChannel(data: SetFlightModeChannelType) -> None:
    """
    Sets the flight mode channel based off data passed in, only works when the config page is loaded.

    Args:
        data (SetFlightModeChannelType): Contains the flight mode channel to set
    """
    if not droneStatus.drone:
        return notConnectedError(action="set the flight mode channel")

    if droneStatus.state != "config.flight_modes":
        socketio.emit(
            "params_error",
            {"message": "You must be on the config screen to access the flight modes."},
        )
        logger.debug(f"Current state: {droneStatus.state}")
        return

    channel = data.get("channel", None)

    if channel is None:
        droneErrorCb("Flight mode channel must be specified.")
        return

    try:
        channel_int = int(channel)
    except ValueError:
        droneErrorCb("Flight mode channel must be an integer.")
        return

    result = droneStatus.drone.flightModesController.setFlightModeChannel(channel_int)

    socketio.emit("set_flight_mode_channel_result", result)


@socketio.on("refresh_flight_mode_data")
def refreshFlightModeData() -> None:
    """
    Refreshes the flight mode data, only works when the config page is loaded.
    """
    if not droneStatus.drone:
        return notConnectedError(action="refresh the flight mode data")

    if droneStatus.state != "config.flight_modes":
        socketio.emit(
            "params_error",
            {"message": "You must be on the config screen to access the flight modes."},
        )
        logger.debug(f"Current state: {droneStatus.state}")
        return

    droneStatus.drone.flightModesController.refreshData()

    flight_modes = droneStatus.drone.flightModesController.flight_modes
    flight_mode_channel = droneStatus.drone.flightModesController.flight_mode_channel

    socketio.emit(
        "flight_mode_config",
        {"flight_modes": flight_modes, "flight_mode_channel": flight_mode_channel},
    )


@socketio.on("set_current_flight_mode")
def setCurrentFlightMode(data: SetCurrentFlightModeType) -> None:
    """
    Sets the current flight mode of the drone, only works when the dashboard is loaded

    Args:
        data (dict): A dictionary containing the flight mode to be set as an integer
    """
    if not droneStatus.drone:
        return notConnectedError(action="set the current flight mode")

    if droneStatus.state != "dashboard":
        socketio.emit(
            "params_error",
            {
                "message": "You must be on the dashboard screen to set the current flight mode."
            },
        )
        logger.debug(f"Current state: {droneStatus.state}")
        return

    new_flight_mode = data.get("newFlightMode")

    if new_flight_mode is None:
        droneErrorCb("Flight mode must be specified.")
        return

    result = droneStatus.drone.flightModesController.setCurrentFlightMode(
        new_flight_mode
    )
    socketio.emit("set_current_flight_mode_result", result)
