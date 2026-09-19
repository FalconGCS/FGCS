import time
from typing import Any, List

from typing_extensions import TypedDict

import app.droneStatus as droneStatus
from app import logger, socketio
from app.utils import notConnectedError

PARAM_REQUEST_UPDATE_THROTTLE_SECS = 0.2


class ExportParamsFileType(TypedDict):
    file_path: str


class MultipleParamsProgressDataType(TypedDict):
    message: str
    param_id: str
    current_index: int
    total_params: int


def setMultipleParamsProgressUpdateCallback(
    data: MultipleParamsProgressDataType,
) -> None:
    """
    Callback function to emit progress updates when setting multiple parameters.
    """
    socketio.emit("set_multiple_params_progress", data)


@socketio.on("get_params")
def get_params() -> None:
    """
    Get cached parameters from the params controller.
    """
    drone = droneStatus.drone
    if drone is None:
        return

    if droneStatus.state != "params":
        socketio.emit(
            "params_error",
            {"message": "You must be on the params screen to get parameters."},
        )
        logger.debug(f"Current state: {droneStatus.state}")
        return

    socketio.emit(
        "get_params_result", {"success": True, "data": drone.paramsController.params}
    )


@socketio.on("set_multiple_params")
def set_multiple_params(params_list: List[Any]) -> None:
    """
    Set multiple parameters at the same time.

    Args:
        params_list: The list of parameters to be setting from the client.
    """
    if droneStatus.state != "params":
        socketio.emit(
            "params_error",
            {"message": "You must be on the params screen to save parameters."},
        )
        logger.debug(f"Current state: {droneStatus.state}")
        return

    drone = droneStatus.drone
    if drone is None:
        return

    params_controller = drone.paramsController
    response = params_controller.setMultipleParams(
        params_list, setMultipleParamsProgressUpdateCallback
    )
    if response.get("success"):
        socketio.emit("param_set_success", response)
    else:
        socketio.emit("params_error", response)


@socketio.on("refresh_params")
def refresh_params() -> None:
    """
    Refresh all parameters
    """
    if droneStatus.state != "params":
        socketio.emit(
            "params_error",
            {"message": "You must be on the params screen to refresh the parameters."},
        )
        logger.debug(f"Current state: {droneStatus.state}")
        return

    drone = droneStatus.drone
    if drone is None:
        return

    params_controller = drone.paramsController

    last_received_count_sent = 0
    last_progress_emit_time = 0.0

    def send_param_request_update(progress_data: dict) -> None:
        nonlocal last_received_count_sent, last_progress_emit_time
        received_params = int(progress_data.get("received_number_of_params", 0))
        if received_params <= last_received_count_sent:
            return

        total_params = max(int(progress_data.get("total_number_of_params", 0)), 1)
        is_final_update = received_params >= total_params

        now = time.monotonic()
        if (
            not is_final_update
            and now - last_progress_emit_time < PARAM_REQUEST_UPDATE_THROTTLE_SECS
        ):
            return

        socketio.emit("param_request_update", progress_data)
        last_received_count_sent = received_params
        last_progress_emit_time = now

    response = params_controller.fetchAllParamsBlocking(
        timeout_secs=120,
        progress_update_callback=send_param_request_update,
    )

    if not response.get("success"):
        socketio.emit(
            "params_error",
            {
                "message": response.get(
                    "message", "An error occurred while fetching parameters."
                )
            },
        )
        return

    socketio.emit(
        "get_params_result", {"success": True, "data": drone.paramsController.params}
    )


@socketio.on("export_params_to_file")
def export_params_to_file(data: ExportParamsFileType) -> None:
    """
    Export parameters to a file.

    Args:
        data: The data from the client containing the file path.
    """
    if droneStatus.state != "params":
        socketio.emit(
            "params_error",
            {"message": "You must be on the params screen to export parameters."},
        )
        logger.debug(f"Current state: {droneStatus.state}")
        return

    drone = droneStatus.drone
    if drone is None:
        notConnectedError(action="export params to file")
        return

    file_path = data.get("file_path", None)
    if not file_path:
        socketio.emit(
            "export_params_result",
            {"success": False, "message": "No file path provided."},
        )
        logger.error("No file path provided for exporting parameters.")
        return

    result = drone.paramsController.exportParamsToFile(file_path)

    socketio.emit("export_params_result", result)
