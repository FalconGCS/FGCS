import app.droneStatus as droneStatus
from app import logger, socketio
from app.customTypes import SetConfigParam
from app.utils import notConnectedError


@socketio.on("get_serial_ports_config")
def getSerialPortsConfig() -> None:
    """
    Sends the serial ports config to the frontend, only works when
    the serial ports config screen is loaded.
    """
    if not droneStatus.drone:
        return notConnectedError(action="get the serial ports config")

    if droneStatus.state != "config.serial_ports":
        socketio.emit(
            "params_error",
            {
                "message": "You must be on the serial ports config screen to access the serial ports config."
            },
        )
        logger.debug(f"Current state: {droneStatus.state}")
        return

    serial_ports_config = droneStatus.drone.serialPortsController.getConfig()

    socketio.emit(
        "serial_ports_config",
        serial_ports_config,
    )


@socketio.on("set_serial_port_config_param")
def setSerialPortConfigParam(data: SetConfigParam) -> None:
    """
    Sets a serial port config parameter on the drone.
    """
    if not droneStatus.drone:
        return notConnectedError(action="set a serial port config parameter")

    if droneStatus.state != "config.serial_ports":
        socketio.emit(
            "params_error",
            {
                "message": "You must be on the serial ports config screen to set serial port config parameters."
            },
        )
        logger.debug(f"Current state: {droneStatus.state}")
        return

    param_id = data.get("param_id", None)
    value = data.get("value", None)

    if param_id is None or value is None:
        socketio.emit(
            "params_error",
            {"message": "Param ID and value must be specified."},
        )
        return

    success = droneStatus.drone.serialPortsController.setConfigParam(param_id, value)
    if success:
        result = {
            "success": True,
            "message": f"Parameter {param_id} successfully set to {value}.",
            "param_id": param_id,
            "value": value,
        }
    else:
        result = {
            "success": False,
            "message": f"Failed to set parameter {param_id} to {value}.",
        }
    socketio.emit("set_serial_port_config_result", result)
