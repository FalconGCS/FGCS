import app.droneStatus as droneStatus
from app import logger, socketio
from app.utils import droneErrorCb
from app.customTypes import SetConfigParam


@socketio.on("get_failsafe_config")
def getFailsafeConfig() -> None:
    """
    Sends the failsafe config to the frontend, only works when the config page is loaded.
    """
    if droneStatus.state != "config.failsafe":
        socketio.emit(
            "params_error",
            {
                "message": "You must be on the config screen to access the failsafe configuration."
            },
        )
        logger.debug(f"Current state: {droneStatus.state}")
        return

    if not droneStatus.drone:
        logger.warning("Attempted to get the failsafe config when drone is None.")
        droneErrorCb(
            "You must be connected to the drone to access the failsafe configuration."
        )
        return

    failsafe_config = droneStatus.drone.failsafeController.getConfig()

    socketio.emit(
        "failsafe_config",
        {"params": failsafe_config},
    )


@socketio.on("set_failsafe_config_param")
def setFailsafeParam(data: SetConfigParam) -> None:
    """
    Sets a failsafe parameter based off data passed in, only works when the config page is loaded.
    """
    if droneStatus.state != "config.failsafe":
        socketio.emit(
            "params_error",
            {
                "message": "You must be on the config screen to access the failsafe configuration."
            },
        )
        logger.debug(f"Current state: {droneStatus.state}")
        return

    if not droneStatus.drone:
        logger.warning("Attempted to set a failsafe param when drone is None.")
        droneErrorCb(
            "You must be connected to the drone to access the failsafe configuration."
        )
        return

    param_id = data.get("param_id", None)
    value = data.get("value", None)

    if param_id is None or value is None:
        droneErrorCb("Param ID and value must be specified.")
        return

    success = droneStatus.drone.failsafeController.setFailsafeParam(param_id, value)
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
    socketio.emit("set_failsafe_param_result", result)
