import app.droneStatus as droneStatus
from app import logger, socketio
from app.utils import notConnectedError


@socketio.on("get_frame_config")
def getFrameDetails() -> None:
    """
    Sends the current frame class and frame type of the drone to the frontend. Only works when on the motor test panel of config page
    """

    if not droneStatus.drone:
        return notConnectedError(action="get frame config")

    if droneStatus.state != "config.motor_test":
        socketio.emit(
            "params_error",
            {
                "message": "You must be on the motor test section of the config page to access the frame details"
            },
        )
        logger.debug(f"Current state: {droneStatus.state}")
        return

    framesConfig = droneStatus.drone.frameController.getConfig()

    socketio.emit(
        "frame_type_config",
        framesConfig,
    )
